/**
 * sidepanel.js — Side Panel UI Controller
 *
 * Auth flow:
 *  1. On load: silently check for a cached session (GET_USER_INFO)
 *  2. If session found → show app iframe (100% full screen) and inject token + userInfo via postMessage
 *  3. If no session → show minimal Google sign-in screen
 *  4. User clicks "Continue with Google" → send GET_AUTH_TOKEN to service worker
 *  5. On success: store token, display full-screen iframe, inject token + userInfo
 *  6. Listens for SIGN_OUT event from Next.js frontend to cleanly log out
 */

const APP_URLS = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];

// DOM refs
const authScreen       = document.getElementById('auth-screen');
const loadingScreen    = document.getElementById('loading-screen');
const loadingTextEl    = document.getElementById('loading-text');
const cancelLoadingBtn = document.getElementById('cancel-loading-btn');
const appFrame         = document.getElementById('app-frame');
const signInBtn        = document.getElementById('sign-in-btn');
const authError        = document.getElementById('auth-error');

// Cached in memory for quick injection
let currentToken = null;
let currentUserInfo = null;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function showLoading(text = 'Loading...') {
  loadingScreen.style.display = 'flex';
  authScreen.style.display    = 'none';
  appFrame.style.display      = 'none';
  if (loadingTextEl) loadingTextEl.innerHTML = text;
  if (cancelLoadingBtn) cancelLoadingBtn.style.display = 'none';
}

function showAuthScreen(errorMsg = '') {
  loadingScreen.style.display = 'none';
  authScreen.style.display    = 'flex';
  appFrame.style.display      = 'none';
  signInBtn.disabled          = false;
  if (errorMsg) {
    authError.textContent     = errorMsg;
    authError.style.display   = 'block';
  } else {
    authError.style.display   = 'none';
  }
}

function showApp() {
  loadingScreen.style.display = 'none';
  authScreen.style.display    = 'none';
  // Iframe fills 100% of the sidepanel cleanly
  appFrame.style.display      = 'block';
  appFrame.style.marginTop    = '0';
  appFrame.style.height       = '100%';
}

/** Find the first responsive port and load the app iframe */
async function detectAndLoadApp() {
  for (const url of APP_URLS) {
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(1500) });
      if (appFrame.src !== url) {
        appFrame.src = url;
      }
      return url;
    } catch { /* port not responding */ }
  }
  return null;
}

/**
 * Inject the Google access_token and userInfo into the Next.js app via postMessage.
 */
function injectTokenIntoFrame(token, userInfo) {
  if (!appFrame.contentWindow || !token) return;
  appFrame.contentWindow.postMessage(
    { type: 'EXTENSION_AUTH_TOKEN', token, userInfo },
    '*'
  );
}

// ─────────────────────────────────────────────────────────────
// Auth flow
// ─────────────────────────────────────────────────────────────

async function tryRestoreSession() {
  showLoading('Restoring session...');
  try {
    const response = await Promise.race([
      new Promise((resolve) =>
        chrome.runtime.sendMessage({ type: 'GET_USER_INFO' }, resolve)
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
    ]);

    if (response?.success && response.token && response.userInfo) {
      currentToken = response.token;
      currentUserInfo = response.userInfo;
      showApp();
      await detectAndLoadApp();
      appFrame.onload = () => injectTokenIntoFrame(currentToken, currentUserInfo);
      return true;
    }
  } catch {
    // Session restore timeout or no active session
  }

  showAuthScreen();
  return false;
}

let signinTimer = null;

async function handleSignIn() {
  signInBtn.disabled = true;
  authError.style.display = 'none';
  showLoading('Connecting to Google...');

  if (cancelLoadingBtn) {
    cancelLoadingBtn.style.display = 'inline-block';
    cancelLoadingBtn.onclick = () => {
      clearTimeout(signinTimer);
      showAuthScreen('Sign-in cancelled.');
    };
  }

  signinTimer = setTimeout(() => {
    if (loadingTextEl) {
      loadingTextEl.innerHTML = `
        <span style="font-weight:600; color:#e2e8f0;">Waiting for Google...</span>
        <div style="font-size:11px; color:#94a3b8; margin-top:8px; line-height:1.5;">
          A Google popup window was opened.<br>
          Press <b>Alt + Tab</b> or check your taskbar to select your account and approve!
        </div>
      `;
    }
  }, 2500);

  let response = null;
  try {
    response = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN', interactive: true }, resolve)
    );
  } catch (err) {
    console.error('[Auth] sendMessage failed:', err);
  } finally {
    clearTimeout(signinTimer);
  }

  if (!response?.success) {
    const msg = response?.error || 'Sign-in failed. Please try again.';
    console.error('[Auth] Sign-in failed:', msg);
    showAuthScreen(msg);
    return;
  }

  currentToken = response.token;
  currentUserInfo = response.userInfo;
  showApp();

  const appUrl = await detectAndLoadApp();
  if (!appUrl) {
    showAuthScreen('Signed in! But frontend server is not running on localhost:3000.');
    return;
  }

  appFrame.onload = () => injectTokenIntoFrame(currentToken, currentUserInfo);
  // Also send immediately in case iframe was already loaded
  injectTokenIntoFrame(currentToken, currentUserInfo);
}

async function handleSignOut() {
  showLoading('Signing out...');
  currentToken = null;
  currentUserInfo = null;
  await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, resolve)
  );
  appFrame.src = 'about:blank';
  showAuthScreen();
}

// ─────────────────────────────────────────────────────────────
// Inter-window messaging (Next.js iframe ↔ Extension Sidepanel)
// ─────────────────────────────────────────────────────────────
window.addEventListener('message', async (event) => {
  const isOurApp = APP_URLS.some(u => event.origin.startsWith(u.replace('http://', 'http://')));
  if (!isOurApp && !event.origin.startsWith('http://localhost')) return;

  // Frontend signals it is ready to receive auth token & profile
  if (event.data?.type === 'FRONTEND_READY') {
    if (currentToken && currentUserInfo) {
      injectTokenIntoFrame(currentToken, currentUserInfo);
    } else {
      const session = await chrome.storage.session.get(['auth_token', 'user_info']);
      if (session.auth_token) {
        currentToken = session.auth_token;
        currentUserInfo = session.user_info;
        injectTokenIntoFrame(currentToken, currentUserInfo);
      }
    }
    return;
  }

  // Frontend requests Sign-Out (e.g. from the profile dropdown)
  if (event.data?.type === 'SIGN_OUT') {
    await handleSignOut();
    return;
  }

  // Token refresh requested by frontend on 401
  if (event.data?.type === 'REQUEST_AUTH_TOKEN_REFRESH') {
    const response = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' }, resolve)
    );

    if (response?.success) {
      currentToken = response.token;
      currentUserInfo = response.userInfo;
      injectTokenIntoFrame(currentToken, currentUserInfo);
    } else {
      showAuthScreen('Your session expired. Please sign in again.');
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────────
signInBtn.addEventListener('click', handleSignIn);

// ─────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────
tryRestoreSession();