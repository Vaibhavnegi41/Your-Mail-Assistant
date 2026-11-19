"""
Authentication module — Google OAuth via chrome.identity.getAuthToken()

Flow:
  1. Chrome Extension calls chrome.identity.getAuthToken({ interactive: true })
  2. Chrome returns a Google OAuth2 access_token
  3. Extension attaches it as:  Authorization: Bearer <access_token>
  4. Every FastAPI endpoint calls get_current_user_id() which:
       - In development: returns "dev-user-001" (no token required)
       - In production:  calls verify_google_token() which hits Google's
         tokeninfo endpoint, extracts the user's Google ID (sub), and
         caches it to avoid re-verifying the same token on every request.
"""

import os
import time
import httpx
from typing import Optional
from fastapi import HTTPException, Security, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# In-memory token cache:  { access_token -> (google_user_id, expiry_unix_ts) }
# Avoids hitting Google's tokeninfo API on every single request.
# Tokens are evicted when they expire (exp field from tokeninfo response).
# ---------------------------------------------------------------------------
_TOKEN_CACHE: dict[str, tuple[str, float]] = {}


def _evict_expired_tokens() -> None:
    """Remove tokens whose TTL has passed to prevent unbounded memory growth."""
    now = time.time()
    expired = [t for t, (_, exp) in _TOKEN_CACHE.items() if exp < now]
    for t in expired:
        del _TOKEN_CACHE[t]


async def verify_google_token(access_token: str) -> str:
    """
    Verify a Google OAuth2 access_token by calling Google's tokeninfo endpoint.

    Returns the Google user ID (sub) on success.
    Raises HTTP 401 on invalid / expired / wrong-audience tokens.

    Google tokeninfo endpoint docs:
      https://developers.google.com/identity/sign-in/web/backend-auth
    """
    # 1. Check cache first
    cached = _TOKEN_CACHE.get(access_token)
    if cached:
        user_id, exp = cached
        if time.time() < exp:
            return user_id
        else:
            del _TOKEN_CACHE[access_token]

    _evict_expired_tokens()

    # 2. Call Google's tokeninfo endpoint
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"access_token": access_token},
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google token verification timed out. Please retry.",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not reach Google auth servers: {exc}",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google access token.",
        )

    data = resp.json()

    # 3. Validate audience (aud) matches your Google Client ID
    #    This prevents tokens issued for other apps from being accepted.
    aud = data.get("aud", "")
    if google_client_id and aud != google_client_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token audience mismatch — token was not issued for this application.",
        )

    # 4. Extract user identity
    user_id: Optional[str] = data.get("sub")  # Google's unique, stable user ID
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is valid but contains no user identity (sub).",
        )

    # 5. Store in cache until 60s before expiry
    exp_seconds = int(data.get("exp", 0))
    cache_until = exp_seconds - 60 if exp_seconds > 60 else time.time() + 300
    _TOKEN_CACHE[access_token] = (user_id, cache_until)

    return user_id


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> str:
    """
    FastAPI dependency — extracts and validates the requesting user's identity.

    Development mode (ENVIRONMENT != "production"):
      Returns "dev-user-001" without any token verification.
      This lets you run and test locally without a real Google account.

    Production mode:
      Expects:  Authorization: Bearer <google_oauth_access_token>
      Verifies the token with Google and returns the user's Google ID (sub).
    """
    env = os.getenv("ENVIRONMENT", "development").lower()

    if env != "production":
        # Dev bypass — no auth required locally
        return "dev-user-001"

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in with Google.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await verify_google_token(credentials.credentials)


def get_token_from_request(credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    """
    Helper: extract the raw access_token from credentials.
    Used by endpoints that need to forward the token to Gmail API.
    """
    if credentials and credentials.credentials:
        return credentials.credentials
    return None
