// Google authentication controller: keep the visible login state aligned with the token StoryFlow can
// actually use. This runs after the older auth/settings shims so it can repair the
// bootstrap edge case where an old in-memory token survives after settings.json
// clears the session cache, leaving the UI saying "已登入" while API calls fail.
(function () {
  // integrations.js declares StoryFlowIntegrations with top-level `const`, which is
  // shared across classic scripts but is NOT a window property. Using only
  // window.StoryFlowIntegrations made this whole repair module silently return.
  const integrations = typeof StoryFlowIntegrations !== 'undefined'
    ? StoryFlowIntegrations
    : window.StoryFlowIntegrations;
  if (!integrations || integrations.__authConsistencyInstalled) return;
  integrations.__authConsistencyInstalled = true;
  if (!window.StoryFlowIntegrations) window.StoryFlowIntegrations = integrations;

  const rawHasGoogleToken = integrations.hasGoogleToken.bind(integrations);
  const sessionAuth = () => window.StoryFlowSessionAuth;
  let verifiedForCurrentConfig = Boolean(rawHasGoogleToken() && sessionAuth()?.hasCachedToken?.());
  let loginInFlight = null;

  function hasGoogleConfig() {
    return Boolean(String(window.STORYFLOW_CONFIG?.googleClientId || '').trim());
  }

  function hasUsableGoogleToken() {
    const cached = Boolean(sessionAuth()?.hasCachedToken?.());
    return Boolean(rawHasGoogleToken() && (verifiedForCurrentConfig || cached));
  }

  // All UI surfaces (top-right and sidebar) call this dynamically, so replacing the
  // public predicate fixes contradictory auth labels without touching the private
  // accessToken held inside integrations.js.
  integrations.hasGoogleToken = hasUsableGoogleToken;

  function syncSettingsUi() {
    // settings-bootstrap may be loaded dynamically before or after this file. Calling
    // it directly as well as emitting the normal connection event prevents a stale
    // "登入 Google" button from surviving after the sidebar has already turned green.
    queueMicrotask(() => window.StoryFlowSettingsBootstrap?.sync?.());
  }

  function syncSignedOut({ clearSession = false } = {}) {
    verifiedForCurrentConfig = false;
    if (clearSession) sessionAuth()?.forgetSession?.();
    sessionAuth()?.syncSignedOutUi?.();
    window.StoryFlowConnectionUi?.sync?.();
    syncSettingsUi();
  }

  function syncLoggedIn(token = '') {
    verifiedForCurrentConfig = Boolean(rawHasGoogleToken());
    if (token) sessionAuth()?.rememberSession?.(token);
    sessionAuth()?.syncLoggedInUi?.();
    window.StoryFlowConnectionUi?.sync?.();
    syncSettingsUi();
  }

  function isAuthError(error) {
    return /401|login_required|invalid[_ ]?token|unauthori[sz]ed|重新登入 Google/i.test(String(error?.message || error || ''));
  }

  async function interactiveLogin({ notifySuccess = true, notifyError = true } = {}) {
    if (!hasGoogleConfig()) {
      syncSignedOut();
      window.StoryFlowShowSettings?.();
      const message = '請先載入或設定 Google OAuth Client ID';
      if (notifyError) window.notify?.(message, true);
      return false;
    }
    if (loginInFlight) return loginInFlight;

    // Important: an explicit click must always go to Google. Do not let an old
    // in-memory token turn it into the shim's silent prompt="" path.
    loginInFlight = (async () => {
      try {
        const token = await integrations.requestAccessToken({ prompt: 'consent' });
        if (!token || !rawHasGoogleToken()) throw new Error('Google 沒有回傳可用的登入憑證');
        syncLoggedIn(token);
        if (notifySuccess) window.notify?.('Google 授權完成');
        return true;
      } catch (error) {
        syncSignedOut({ clearSession: true });
        if (notifyError) window.notify?.(`Google 登入失敗：${error.message || error}`, true);
        return false;
      } finally {
        loginInFlight = null;
      }
    })();
    return loginInFlight;
  }

  // Replace the legacy button handler after settings-sync has wrapped it. The
  // bootstrap "登入 Google" button delegates to this same button, so desktop and
  // mobile share one explicit re-authentication path.
  const loginButton = document.getElementById('googleLoginBtn');
  if (loginButton) {
    loginButton.onclick = event => {
      event?.preventDefault?.();
      interactiveLogin();
    };
  }

  // Re-applying the SAME settings.json must not sign the user out. settings-bootstrap
  // explicitly invalidates auth first when the Client ID really changes; therefore
  // an integration-config event can safely preserve a currently usable token.
  window.addEventListener('storyflow:integration-config-changed', () => {
    if (hasUsableGoogleToken()) syncLoggedIn();
    else syncSignedOut();
  });

  // Google operations get one guarded retry. This prevents a stale token from
  // bouncing between restoreGoogleAccess() and the same expired session token.
  ['inspectGoogleDoc', 'refreshChapterSource'].forEach(name => {
    const base = integrations[name];
    if (typeof base !== 'function') return;
    integrations[name] = async function authenticatedOperation(...args) {
      if (!hasUsableGoogleToken()) {
        const loggedIn = await interactiveLogin({ notifySuccess: false });
        if (!loggedIn) throw new Error('需要重新登入 Google');
      }
      try {
        const result = await base.apply(integrations, args);
        syncLoggedIn();
        return result;
      } catch (error) {
        if (!isAuthError(error)) throw error;
        syncSignedOut({ clearSession: true });
        const loggedIn = await interactiveLogin({ notifySuccess: false });
        if (!loggedIn) throw new Error('需要重新登入 Google');
        const result = await base.apply(integrations, args);
        syncLoggedIn();
        return result;
      }
    };
  });

  // Repair the current page immediately. In the broken state rawHasGoogleToken()
  // may still be true while the session cache is gone; that must render as signed out.
  if (hasUsableGoogleToken()) syncLoggedIn();
  else syncSignedOut();

  window.StoryFlowGoogleAuth = {
    login: interactiveLogin,
    isAuthenticated: hasUsableGoogleToken,
    invalidate: () => syncSignedOut({ clearSession: true })
  };
})();
