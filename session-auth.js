// Keep Google auth convenient across reloads without persisting the access token.
// A sessionStorage marker only says that this tab/browser session has already authenticated.
// The token itself remains memory-only; once the browser session is gone, StoryFlow asks again.
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

  function forgetSession() {
    try { sessionStorage.removeItem(SESSION_KEY); }
    catch (_) {}
  }

  function rememberIfAuthorized() {
    if (StoryFlowIntegrations.hasGoogleToken()) rememberSession();
  }

  const baseRequestAccessToken = StoryFlowIntegrations.requestAccessToken.bind(StoryFlowIntegrations);
  StoryFlowIntegrations.requestAccessToken = async function requestAccessTokenForSession(...args) {
    const token = await baseRequestAccessToken(...args);
    if (token) rememberSession();
    return token;
  };

  const baseRestoreGoogleAccess = StoryFlowIntegrations.restoreGoogleAccess.bind(StoryFlowIntegrations);
  StoryFlowIntegrations.restoreGoogleAccess = async function restoreGoogleAccessForSession() {
    if (StoryFlowIntegrations.hasGoogleToken()) return true;
    // Cold browser start: do not silently revive a previous Google session.
    // A normal page reload keeps sessionStorage and is allowed to restore silently.
    if (!hasSessionHint()) return false;
    const restored = await baseRestoreGoogleAccess();
    if (restored) rememberSession();
    else forgetSession();
    return restored;
  };

  // Some integration methods obtain a token internally. Remember that the current
  // browser session is authenticated after they succeed, without storing the token.
  ['inspectGoogleDoc', 'refreshChapterSource'].forEach(name => {
    const base = StoryFlowIntegrations[name];
    if (typeof base !== 'function') return;
    StoryFlowIntegrations[name] = async function rememberIntegrationSession(...args) {
      const result = await base.apply(StoryFlowIntegrations, args);
      rememberIfAuthorized();
      return result;
    };
  });

  const baseLoginStatus = window.loginGoogleStatusOnly;
  if (typeof baseLoginStatus === 'function') {
    window.loginGoogleStatusOnly = async function loginGoogleStatusForSession(...args) {
      const result = await baseLoginStatus(...args);
      if (StoryFlowIntegrations.hasGoogleToken()) {
        rememberSession();
        const status = document.getElementById('googleStatus');
        if (status) status.textContent = '本次瀏覽器工作階段已登入';
      }
      return result;
    };
  }
})();
