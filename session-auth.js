// Keep Google auth convenient across reloads without persisting the access token.
// sessionStorage stores only a same-tab/session hint. On reload StoryFlow silently
// requests a fresh short-lived token; after the browser session is gone the user
// can be asked to sign in again.
(function () {
  const SESSION_KEY = 'storyflow.google.session.v1';

  function hasSessionHint() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
    catch (_) { return false; }
  }

  function rememberSession() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); }
    catch (_) {}
  }

  function rememberIfAuthorized() {
    if (StoryFlowIntegrations.hasGoogleToken()) rememberSession();
  }

  function syncLoggedInUi() {
    if (!StoryFlowIntegrations.hasGoogleToken()) return;
    const dot = document.getElementById('googleDot');
    const status = document.getElementById('googleStatus');
    const button = document.getElementById('googleLoginBtn');
    dot?.classList.add('connected');
    if (status) status.textContent = '本次瀏覽器工作階段已登入';
    if (button) button.textContent = '已登入';
  }

  function syncRestoringUi() {
    const status = document.getElementById('googleStatus');
    const button = document.getElementById('googleLoginBtn');
    if (status) status.textContent = '正在恢復登入…';
    if (button) button.textContent = '恢復中…';
  }

  function syncSignedOutUi() {
    const dot = document.getElementById('googleDot');
    const status = document.getElementById('googleStatus');
    const button = document.getElementById('googleLoginBtn');
    dot?.classList.remove('connected');
    if (status) status.textContent = '需要重新登入';
    if (button) button.textContent = '登入 Google';
  }

  const baseRequestAccessToken = StoryFlowIntegrations.requestAccessToken.bind(StoryFlowIntegrations);
  StoryFlowIntegrations.requestAccessToken = async function requestAccessTokenForSession(...args) {
    const token = await baseRequestAccessToken(...args);
    if (token) {
      rememberSession();
      syncLoggedInUi();
    }
    return token;
  };

  const baseRestoreGoogleAccess = StoryFlowIntegrations.restoreGoogleAccess.bind(StoryFlowIntegrations);
  StoryFlowIntegrations.restoreGoogleAccess = async function restoreGoogleAccessForSession() {
    if (StoryFlowIntegrations.hasGoogleToken()) {
      syncLoggedInUi();
      return true;
    }
    // A cold browser/tab session should not silently revive an older Google login.
    if (!hasSessionHint()) return false;
    try {
      const restored = await baseRestoreGoogleAccess();
      if (restored) {
        rememberSession();
        syncLoggedInUi();
      }
      return restored;
    } catch (_) {
      return false;
    }
  };

  // Some integration methods obtain a token internally. Remember that the current
  // browser session is authenticated after they succeed, without storing the token.
  ['inspectGoogleDoc', 'refreshChapterSource'].forEach(name => {
    const base = StoryFlowIntegrations[name];
    if (typeof base !== 'function') return;
    StoryFlowIntegrations[name] = async function rememberIntegrationSession(...args) {
      const result = await base.apply(StoryFlowIntegrations, args);
      rememberIfAuthorized();
      syncLoggedInUi();
      return result;
    };
  });

  const baseLoginStatus = window.loginGoogleStatusOnly;
  if (typeof baseLoginStatus === 'function') {
    window.loginGoogleStatusOnly = async function loginGoogleStatusForSession(...args) {
      const result = await baseLoginStatus(...args);
      if (StoryFlowIntegrations.hasGoogleToken()) {
        rememberSession();
        syncLoggedInUi();
      }
      return result;
    };
  }

  // The previous implementation only wrapped restoreGoogleAccess; nothing actually
  // called it during boot, so a plain F5 still looked signed out. Perform the restore
  // automatically whenever this same page session has already authenticated.
  async function restoreOnBoot() {
    if (!hasSessionHint() || StoryFlowIntegrations.hasGoogleToken()) {
      syncLoggedInUi();
      return;
    }
    syncRestoringUi();

    // GIS is loaded asynchronously. restoreGoogleAccess already waits for it, and a
    // second attempt covers unusually slow script initialization without user action.
    let restored = await StoryFlowIntegrations.restoreGoogleAccess();
    if (!restored) {
      await new Promise(resolve => window.setTimeout(resolve, 700));
      restored = await StoryFlowIntegrations.restoreGoogleAccess();
    }

    if (restored) syncLoggedInUi();
    else syncSignedOutUi();
  }

  restoreOnBoot();
})();
