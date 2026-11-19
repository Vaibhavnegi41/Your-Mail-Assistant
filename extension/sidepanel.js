/**
 * sidepanel.js — Side Panel UI Controller
 *
 * Auth flow:
 *  1. On load: silently check for a cached session (GET_USER_INFO)
 *  2. If session found → show app iframe with token in query param (dev) or header (prod)
 *  3. If no session → show sign-in screen
 *  4. User clicks "Continue with Google" → send GET_AUTH_TOKEN to service worker
 *  5. Service worker calls chrome.identity.getAuthToken({ interactive: true })
 *  6. On success: store token, show app, inject token into every API request via postMessage
 *
 * Token forwarding to Next.js frontend:
 *  Since the iframe loads your Next.js app (localhost:3000), we pass the token
 *  via postMessage so the frontend can attach it as Authorization: Bearer on
 *  every fetch to the FastAPI backend.
 */

const APP_URLS = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];

// DOM refs
const authScreen   = document.getElementById('auth-screen');
const loadingScreen = document.getElementById('loading-screen');
const userBar      = document.getElementById('user-bar');
const appFrame     = document.getElementById('app-frame');
const signInBtn    = document.getElementById('sign-in-btn');
const signOutBtn   = document.getElementById('sign-out-btn');
const userEmailLabel = document.getElementById('user-email-label');
const authError    = document.getElementById('auth-error');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function showLoading() {
  loadingScreen.style.display = 'flex';
  authScreen.style.display    = 'none';
  appFrame.style.display      = 'none';
  userBar.style.display       = 'none';
}

function showAuthScreen(errorMsg = '') {
  loadingScreen.style.display = 'none';
  authScreen.style.display    = 'flex';
  appFrame.style.display      = 'none';
  userBar.style.display       = 'none';
  signInBtn.disabled          = false;
  if (errorMsg) {
    authError.textContent     = errorMsg;
    authError.style.display   = 'block';
  } else {
    authError.style.display   = 'none';
  }
}

function showApp(userInfo) {
  loadingScreen.style.display = 'none';
  authScreen.style.display    = 'none';
  appFrame.style.display      = 'block';
  userBar.style.display       = 'flex';
  userEmailLabel.textContent  = userInfo?.email || 'Signed in';
  // Push down iframe to clear user bar
  appFrame.style.marginTop    = '32px';
  appFrame.style.height       = 'calc(100% - 32px)';
}

/** Find the first responsive port and load the app iframe */
async function detectAndLoadApp(token) {
  for (const url of APP_URLS) {
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      // Load iframe — the token will be injected via postMessage once it loads
      if (appFrame.src !== url) {
        appFrame.src = url;
      }
      return url;
    } catch { /* port not responding */ }
  }
  return null;
}

/**
 * Inject the Google access_token into the Next.js app via postMessage.
 * The frontend listens for this and stores it in-memory, then attaches it
 * as Authorization: Bearer on every fetch to the FastAPI backend.
 */
function injectTokenIntoFrame(token) {
  if (!appFrame.contentWindow) return;
  appFrame.contentWindow.postMessage(
    { type: 'EXTENSION_AUTH_TOKEN', token },
    '*'  // safe because only localhost origins are loaded
  );
}

// ─────────────────────────────────────────────────────────────
// Auth flow
// ─────────────────────────────────────────────────────────────

async function tryRestoreSession() {
  showLoading();
  const response = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'GET_USER_INFO' }, resolve)
  );

  if (response?.success && response.token && response.userInfo) {
    // Session found — restore without showing login
    showApp(response.userInfo);
    await detectAndLoadApp(response.token);
    // Inject token once iframe loads
    appFrame.onload = () => injectTokenIntoFrame(response.token);
    return true;
  }

  showAuthScreen();
  return false;
}

async function handleSignIn() {
  signInBtn.disabled = true;
  authError.style.display = 'none';
  showLoading();

  const response = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN', interactive: true }, resolve)
  );

  if (!response?.success) {
    const msg = response?.error || 'Sign-in failed. Please try again.';
    console.error('[Auth] Sign-in failed:', msg);
    showAuthScreen(msg);
    return;
  }

  const { token, userInfo } = response;
  showApp(userInfo);

  const appUrl = await detectAndLoadApp(token);
  if (!appUrl) {
    // Frontend not running — still show user bar but show a message
    showAuthScreen('Signed in! But frontend server is not running on localhost:3000.');
    return;
  }

  // Inject once iframe finishes loading
  appFrame.onload = () => injectTokenIntoFrame(token);
}

async function handleSignOut() {
  showLoading();
  await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, resolve)
  );
  appFrame.src = 'about:blank';
  showAuthScreen();
}

// ─────────────────────────────────────────────────────────────
// Token refresh on 401 (message from frontend iframe)
// ─────────────────────────────────────────────────────────────
window.addEventListener('message', async (event) => {
  // Only accept messages from our app URLs
  const isOurApp = APP_URLS.some(u => event.origin.startsWith(u.replace('http://', 'http://')));
  if (!isOurApp && !event.origin.startsWith('http://localhost')) return;

  if (event.data?.type === 'REQUEST_AUTH_TOKEN_REFRESH') {
    // Frontend got a 401 — request a silent token refresh
    const response = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' }, resolve)
    );

    if (response?.success) {
      injectTokenIntoFrame(response.token);
    } else {
      // Refresh failed — force re-login
      showAuthScreen('Your session expired. Please sign in again.');
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────────
signInBtn.addEventListener('click', handleSignIn);
signOutBtn.addEventListener('click', handleSignOut);

// ─────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────
tryRestoreSession();
