// Keep Google auth across normal reloads without relying on a silent GIS request.
// The short-lived access token is kept only in sessionStorage, so a page refresh can
// restore it immediately. Closing the browser/tab session clears it in normal browser
// behavior; StoryFlow logout clears it explicitly.
(function () {
  const SESSION_KEY = 'storyflow.google.session.v1';
  const TOKEN_KEY = 'storyflow.google.access-token.v1';
  const TOKEN_EXPIRES_KEY = 'storyflow.google.access-token.expires.v1';
  const TOKEN_TTL_MS = 45 * 60 * 1000;
  const GOOGLE_READY_TIMEOUT_MS = 5000;
  const RESTORE_TIMEOUT_MS = 1800;
  let restoreInFlight = null;
  let shimInstalled = false;

  function hasSessionHint() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
    catch (_) { return false; }
  }

  function clearCachedToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_EXPIRES_KEY);
    } catch (_) {}
  }

  function cachedToken() {
    if (!hasSessionHint()) return '';
    try {
      const token = sessionStorage.getItem(TOKEN_KEY) || '';
      const expiresAt = Number(sessionStorage.getItem(TOKEN_EXPIRES_KEY) || 0);
      if (!token || !expiresAt || Date.now() >= expiresAt) {
        clearCachedToken();
        return '';
      }
      return token;
    } catch (_) {
      return '';
    }
  }

  function rememberSession(token = '') {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(TOKEN_EXPIRES_KEY, String(Date.now() + TOKEN_TTL_MS));
      }
    } catch (_) {}
  }

  function forgetSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    clearCachedToken();
  }

  function rememberIfAuthorized(token = '') {
    if (StoryFlowIntegrations.hasGoogleToken()) rememberSession(token);
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

  function waitForGoogleIdentity(timeout = GOOGLE_READY_TIMEOUT_MS) {
    const started = Date.now();
    return new Promise(resolve => {
      const check = () => {
        if (window.google?.accounts?.oauth2?.initTokenClient) return resolve(true);
        if (Date.now() - started >= timeout) return resolve(false);
        window.setTimeout(check, 80);
      };
      check();
    });
  }

  // integrations.js owns the real in-memory accessToken. Rather than adding a
  // second token state there, intercept token-client initialization. For a silent
  // restore in this same browser session we feed the cached short-lived token back
  // through the normal GIS callback, so integrations.js hydrates its own token.
  async function installSessionTokenShim() {
    if (shimInstalled) return true;
    if (!(await waitForGoogleIdentity())) return false;

    const oauth2 = window.google.accounts.oauth2;
    const originalInitTokenClient = oauth2.initTokenClient.bind(oauth2);
    oauth2.initTokenClient = function initTokenClientWithSessionCache(config) {
      const realClient = originalInitTokenClient(config);
      let callback = typeof config?.callback === 'function' ? config.callback : () => {};

      const proxy = {
        requestAccessToken(options = {}) {
          const prompt = options?.prompt ?? '';
          const token = cachedToken();

          // Never start a network-based silent request during page boot. GIS can
          // leave that callback pending in some browser/account states, which was
          // the cause of the UI remaining on “恢復中”.
          if (!prompt) {
            queueMicrotask(() => {
              if (token) callback({ access_token: token, expires_in: Math.floor(TOKEN_TTL_MS / 1000) });
              else callback({ error: 'login_required', error_description: '需要重新登入 Google' });
            });
            return;
          }

          realClient.callback = response => callback(response);
          realClient.requestAccessToken(options);
        }
      };

      Object.defineProperty(proxy, 'callback', {
        configurable: true,
        enumerable: true,
        get() { return callback; },
        set(next) {
          callback = typeof next === 'function' ? next : () => {};
          realClient.callback = callback;
        }
      });
      return proxy;
    };

    shimInstalled = true;
    return true;
  }

  const baseRequestAccessToken = StoryFlowIntegrations.requestAccessToken.bind(StoryFlowIntegrations);
  StoryFlowIntegrations.requestAccessToken = async function requestAccessTokenForSession(...args) {
    await installSessionTokenShim();
    const token = await baseRequestAccessToken(...args);
    if (token) {
      rememberSession(token);
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

    const token = cachedToken();
    if (!token) {
      syncSignedOutUi();
      return false;
    }
    if (restoreInFlight) return restoreInFlight;

    syncRestoringUi();
    restoreInFlight = (async () => {
      try {
        if (!(await installSessionTokenShim())) {
          syncSignedOutUi();
          return false;
        }
        const restored = await withTimeout(baseRestoreGoogleAccess(), RESTORE_TIMEOUT_MS);
        if (restored && StoryFlowIntegrations.hasGoogleToken()) {
          rememberSession(token);
          syncLoggedInUi();
          return true;
        }
        clearCachedToken();
        syncSignedOutUi();
        return false;
      } catch (_) {
        clearCachedToken();
        syncSignedOutUi();
        return false;
      } finally {
        restoreInFlight = null;
      }
    })();
    return restoreInFlight;
  };

  ['inspectGoogleDoc', 'refreshChapterSource'].forEach(name => {
    const base = StoryFlowIntegrations[name];
    if (typeof base !== 'function') return;
    StoryFlowIntegrations[name] = async function rememberIntegrationSession(...args) {
      try {
        const result = await base.apply(StoryFlowIntegrations, args);
        rememberIfAuthorized();
        syncLoggedInUi();
        return result;
      } catch (error) {
        if (/401|invalid_token|unauthorized/i.test(String(error?.message || ''))) {
          clearCachedToken();
          syncSignedOutUi();
        }
        throw error;
      }
    };
  });

  const baseLoginStatus = window.loginGoogleStatusOnly;
  if (typeof baseLoginStatus === 'function') {
    window.loginGoogleStatusOnly = async function loginGoogleStatusForSession(...args) {
      const result = await baseLoginStatus(...args);
      if (StoryFlowIntegrations.hasGoogleToken()) {
        rememberIfAuthorized();
        syncLoggedInUi();
      }
      return result;
    };
  }

  window.StoryFlowSessionAuth = {
    hasSessionHint,
    hasCachedToken: () => Boolean(cachedToken()),
    rememberSession,
    forgetSession,
    syncLoggedInUi,
    syncSignedOutUi
  };

  // Start hydration immediately on reload. settings-sync may call the same method
  // later; restoreInFlight makes the operation idempotent instead of concurrent.
  if (cachedToken()) StoryFlowIntegrations.restoreGoogleAccess();
  else syncSignedOutUi();
})();
