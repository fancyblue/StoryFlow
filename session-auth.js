// Keep Google auth convenient across reloads without persisting the access token.
// sessionStorage stores only a same-tab/session hint. A single silent restore is
// attempted during app boot; the access token itself remains memory-only.
(function () {
  const SESSION_KEY = 'storyflow.google.session.v1';
  const RESTORE_TIMEOUT_MS = 5000;
  let restoreInFlight = null;

  function hasSessionHint() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
    catch (_) { return false; }
  }

  function rememberSession() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); }
    catch (_) {}
  }

  function forgetSession() {
    try { sessionStorage.removeItem(SESSION_KEY); }
    catch (_) {}
  }

  function rememberIfAuthorized() {
    if (StoryFlowIntegrations.hasGoogleToken()) rememberSession();
  }

  function emitConnectionChange() {
    window.dispatchEvent(new CustomEvent('storyflow:connection-changed'));
  }

  function syncLoggedInUi() {
    if (!StoryFlowIntegrations.hasGoogleToken()) return;
    const dot = document.getElementById('googleDot');
    const status = document.getElementById('googleStatus');
    const button = document.getElementById('googleLoginBtn');
    dot?.classList.add('connected');
    if (status) status.textContent = '已登入';
    if (button) button.textContent = '已登入';
    emitConnectionChange();
  }

  function syncRestoringUi() {
    const status = document.getElementById('googleStatus');
    const button = document.getElementById('googleLoginBtn');
    if (status) status.textContent = '正在恢復登入…';
    if (button) button.textContent = '恢復中…';
    emitConnectionChange();
  }

  function syncSignedOutUi() {
    const dot = document.getElementById('googleDot');
    const status = document.getElementById('googleStatus');
    const button = document.getElementById('googleLoginBtn');
    dot?.classList.remove('connected');
    if (status) status.textContent = hasSessionHint() ? '登入已失效' : '尚未登入';
    if (button) button.textContent = '登入 Google';
    emitConnectionChange();
  }

  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise(resolve => window.setTimeout(() => resolve(false), timeoutMs))
    ]);
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
    if (!hasSessionHint()) {
      syncSignedOutUi();
      return false;
    }
    if (restoreInFlight) return restoreInFlight;

    syncRestoringUi();
    restoreInFlight = (async () => {
      try {
        const restored = await withTimeout(baseRestoreGoogleAccess(), RESTORE_TIMEOUT_MS);
        if (restored && StoryFlowIntegrations.hasGoogleToken()) {
          rememberSession();
          syncLoggedInUi();
          return true;
        }
        syncSignedOutUi();
        return false;
      } catch (_) {
        syncSignedOutUi();
        return false;
      } finally {
        restoreInFlight = null;
      }
    })();
    return restoreInFlight;
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

  // settings-sync.js owns the single boot-time restore call. Keeping only one
  // caller is important because Google Identity Services uses one mutable token
  // callback; concurrent silent requests can overwrite each other's callbacks and
  // leave the UI stuck on "恢復中" indefinitely.
  window.StoryFlowSessionAuth = {
    hasSessionHint,
    rememberSession,
    forgetSession,
    syncLoggedInUi,
    syncSignedOutUi
  };
})();
