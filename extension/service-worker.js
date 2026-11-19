
const API_BASE = 'http://127.0.0.1:8000';

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});


/**
 * Get a valid Google OAuth2 access token using Chrome's identity API.
 *
 * - interactive: true  → shows the Google sign-in popup if the user is not logged in
 * - interactive: false → returns the cached token silently, or null if not signed in
 *
 * The token is scoped to: openid, email, profile, gmail.send
 * (defined in manifest.json under oauth2.scopes)
 *
 * @param {boolean} interactive - Whether to show the login UI
 * @returns {Promise<string|null>} access_token or null
 */
async function getAuthToken(interactive = false) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
      if (err || !token) {
        console.warn('[Auth] getAuthToken failed:', err);
        resolve({ token: null, error: err || 'No token received from Google' });
        return;
      }
      resolve({ token, error: null });
    });
  });
}

/**
 * Fetch the signed-in user's profile from Google using the access token.
 * Returns { email, name, userId (sub) } or null on failure.
 *
 * @param {string} token - Google OAuth2 access_token
 */
async function fetchUserInfo(token) {
  // 1. Try Google UserInfo endpoint (returns picture, full name, email)
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (resp.ok) {
      const data = await resp.json();
      return {
        email: data.email || '',
        name: data.name || data.given_name || (data.email ? data.email.split('@')[0] : 'User'),
        picture: data.picture || '',
        userId: data.sub || '',
      };
    }
  } catch { /* fallback to tokeninfo */ }

  // 2. Fallback to tokeninfo endpoint
  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      email: data.email || '',
      name: data.email ? data.email.split('@')[0] : 'User',
      picture: '',
      userId: data.sub || '',
    };
  } catch {
    return null;
  }
}

/**
 * Remove the cached token from Chrome's identity cache and from session storage.
 * Call this on sign-out or when the backend returns 401.
 *
 * @param {string} token - The token to invalidate
 */
async function revokeToken(token) {
  if (!token) return;

  // Remove from Chrome's internal token cache
  await new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });

  // Optionally revoke on Google's servers (best practice)
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
    });
  } catch { /* network error on revoke is acceptable */ }

  // Clear from session storage
  await chrome.storage.session.remove(['auth_token', 'user_info']);
  console.log('[Auth] Token revoked and session cleared.');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // All handlers are async — return true to keep the message channel open
  (async () => {
    try {
      switch (message.type) {

      // ── GET_AUTH_TOKEN ──────────────────────────────────────────────────
      // Called by sidepanel when it needs a fresh token (on load or after 401)
      case 'GET_AUTH_TOKEN': {
        const interactive = message.interactive !== false; // default: true

        // Guard: catch placeholder client_id before attempting auth
        const manifest = chrome.runtime.getManifest();
        const clientId = manifest.oauth2?.client_id || '';
        if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
          sendResponse({
            success: false,
            error: 'OAuth not configured. Set a real client_id in manifest.json. See extension/README.md for setup steps.'
          });
          return;
        }

        const { token, error: authError } = await getAuthToken(interactive);

        if (!token) {
          sendResponse({
            success: false,
            error: `Google sign-in failed: ${authError || 'Unknown error'}. Make sure the Extension ID matches your Google Cloud OAuth client.`
          });
          return;
        }

        const userInfo = await fetchUserInfo(token);

        // Cache in session storage (cleared when browser closes)
        await chrome.storage.session.set({
          auth_token: token,
          user_info: userInfo,
        });

        console.log(`[Auth] Signed in as ${userInfo?.email}`);
        sendResponse({ success: true, token, userInfo });
        break;
      }

      // ── GET_USER_INFO ───────────────────────────────────────────────────
      // Returns cached session info without triggering a new auth flow
      case 'GET_USER_INFO': {
        const session = await chrome.storage.session.get(['auth_token', 'user_info']);
        if (session.auth_token && session.user_info) {
          sendResponse({ success: true, token: session.auth_token, userInfo: session.user_info });
        } else {
          sendResponse({ success: false, error: 'No active session.' });
        }
        break;
      }

      // ── SIGN_OUT ────────────────────────────────────────────────────────
      case 'SIGN_OUT': {
        const session = await chrome.storage.session.get(['auth_token']);
        await revokeToken(session.auth_token);
        sendResponse({ success: true });
        break;
      }

      // ── REFRESH_TOKEN ───────────────────────────────────────────────────
      // Force a silent token refresh (non-interactive). Used when backend returns 401.
      case 'REFRESH_TOKEN': {
        const oldSession = await chrome.storage.session.get(['auth_token']);
        if (oldSession.auth_token) {
          // Remove stale token from Chrome's cache to force a fresh one
          await new Promise((resolve) => {
            chrome.identity.removeCachedAuthToken({ token: oldSession.auth_token }, resolve);
          });
        }

        const { token: freshToken } = await getAuthToken(false); // silent — no popup
        if (freshToken) {
          const userInfo = await fetchUserInfo(freshToken);
          await chrome.storage.session.set({ auth_token: freshToken, user_info: userInfo });
          sendResponse({ success: true, token: freshToken, userInfo });
        } else {
          // Silent refresh failed — user must sign in interactively
          await chrome.storage.session.remove(['auth_token', 'user_info']);
          sendResponse({ success: false, error: 'Token refresh failed. Please sign in again.' });
        }
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
    }
  } catch (err) {
    console.error('[ServiceWorker] Uncaught message error:', err);
    sendResponse({ success: false, error: err?.message || 'Internal extension error' });
  }
  })();

  return true; // keep channel open for async sendResponse
});
