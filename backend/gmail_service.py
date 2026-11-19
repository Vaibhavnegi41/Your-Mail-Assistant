"""
Gmail Service — sends approved email drafts via Gmail REST API.

In development:  returns a mock message ID (no real send).
In production:   uses the user's Google OAuth access_token (from chrome.identity.getAuthToken)
                 to call the Gmail REST API directly — no service account needed.

Gmail API docs:
  https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send
"""

import os
import base64
import httpx
from email.message import EmailMessage
from typing import Optional


# ---------------------------------------------------------------------------
# Idempotency guard — prevents duplicate sends if the endpoint is retried
# Format: { idempotency_key -> gmail_message_id }
# ---------------------------------------------------------------------------
_SENT_MESSAGES: dict[str, str] = {}


def _build_mime_message(recipient: str, subject: str, body: str) -> str:
    """Build RFC 2822 MIME message and return base64url-encoded raw string."""
    message = EmailMessage()
    message.set_content(body)
    message["To"] = recipient
    message["Subject"] = subject
    # Gmail API requires base64url encoding with no padding issues
    return base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")


def gmail_send_approved_email(
    user_id: str,
    recipient: str,
    subject: str,
    body: str,
    idempotency_key: str,
    access_token: Optional[str] = None,
) -> str:
    """
    Send an approved email via Gmail API using the user's OAuth access_token.

    Parameters
    ----------
    user_id         : Google user ID (sub) — used for logging only
    recipient       : To: email address
    subject         : Email subject line
    body            : Plain-text email body
    idempotency_key : Unique key to prevent duplicate sends on retry
    access_token    : Google OAuth2 access_token from chrome.identity.getAuthToken()
                      If None (dev mode), returns a mock message ID.

    Returns
    -------
    str : Gmail message ID (e.g. "18c3f2a9b4e1d7f0")
    """
    # 1. Idempotency check — return existing message ID without re-sending
    if idempotency_key in _SENT_MESSAGES:
        print(f"[Gmail] Idempotent skip — already sent: {idempotency_key}")
        return _SENT_MESSAGES[idempotency_key]

    # 2. Development / no token — mock send
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env != "production" or not access_token:
        mock_id = f"mock-{idempotency_key[:20]}"
        _SENT_MESSAGES[idempotency_key] = mock_id
        print(f"[Gmail] Mock send to {recipient} | subject: {subject[:50]}")
        return mock_id

    # 3. Production — call Gmail REST API
    raw_message = _build_mime_message(recipient, subject, body)

    try:
        response = httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw_message},
            timeout=15.0,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        error_detail = exc.response.text if exc.response else str(exc)
        print(f"[Gmail] API error {exc.response.status_code}: {error_detail}")
        raise RuntimeError(f"Gmail API returned {exc.response.status_code}: {error_detail}")
    except httpx.TimeoutException:
        raise RuntimeError("Gmail API request timed out after 15 seconds.")
    except httpx.RequestError as exc:
        raise RuntimeError(f"Could not reach Gmail API: {exc}")

    result = response.json()
    message_id: str = result.get("id", "")

    if not message_id:
        raise RuntimeError("Gmail API returned success but no message ID in response.")

    # 4. Cache for idempotency and return
    _SENT_MESSAGES[idempotency_key] = message_id
    print(f"[Gmail] Sent to {recipient} | Gmail ID: {message_id}")
    return message_id
