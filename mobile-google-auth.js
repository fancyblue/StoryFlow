// Mobile-safe explicit Google OAuth.
// Google Identity Services opens the token flow in a popup/window and mobile browsers
// require that requestAccessToken() be called directly from the user's click gesture.
// The older auth stack awaited readiness/shim setup before making that call, which can
// lose transient user activation on Android/iOS and leave the UI stuck on "登入中…".
(function () {
  const integrations = typeof StoryFlowIntegrations !== 'undefined'
    ? StoryFlowIntegrations
    : window.StoryFlowIntegrations;
  if (!integrations || integrations.__mobileExplicitAuthInstalled) return;
  integrations.__mobileExplicitAuthInstalled = true;

  const delegatedRequest = integrations.requestAccessToken.bind(integrations);
  const LOGIN_TIMEOUT_MS = 45000;

  function googleReady() {
    return Boolean(window.google?.accounts?.oauth2?.initTokenClient);
  }

  function googleConfig() {
    return {
      clientId: String(window.STORYFLOW_CONFIG?.googleClientId || '').trim(),
      scope: (window.STORYFLOW_CONFIG?.googleScopes || []).join(' ')
    };
  }

  function popupErrorMessage(error) {
    const type = String(error?.type || error?.error || '').toLowerCase();
    if (type.includes('popup_failed_to_open')) return '瀏覽器沒有開啟 Google 登入視窗，請允許彈出式視窗後再試一次。';
    if (type.includes('popup_closed')) return 'Google 登入視窗已關閉，請再試一次。';
    return error?.message || error?.error_description || error?.type || 'Google 登入沒有完成。';
  }

  function requestInteractiveTokenDirect(options = {}) {
    const { clientId, scope } = googleConfig();
    if (!clientId) return Promise.reject(new Error('請先載入或設定 Google OAuth Client ID。'));
    if (!googleReady()) return Promise.reject(new Error('Google 登入元件仍在載入，請稍候幾秒後再按一次。'));

    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        if (timer) window.clearTimeout(timer);
        fn(value);
      };

      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope,
          callback: response => {
            if (response?.error) {
              finish(reject, new Error(response.error_description || response.error));
              return;
            }
            if (!response?.access_token) {
              finish(reject, new Error('Google 沒有回傳可用的登入憑證。'));
              return;
            }
            finish(resolve, response.access_token);
          },
          error_callback: error => finish(reject, new Error(popupErrorMessage(error)))
        });

        timer = window.setTimeout(() => {
          finish(reject, new Error('Google 登入逾時。若沒有看到登入視窗，請確認瀏覽器允許彈出式視窗後再試一次。'));
        }, LOGIN_TIMEOUT_MS);

        // Keep this call in the same synchronous click stack. Do not await before it.
        client.requestAccessToken({ prompt: options.prompt || 'consent' });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  integrations.requestAccessToken = function requestAccessTokenMobileSafe(options = {}) {
    const prompt = options.prompt != null ? String(options.prompt) : '';
    if (!prompt) return delegatedRequest(options);

    // Start the interactive Google window synchronously, while user activation from
    // the button click is still valid. Once Google returns a fresh token, cache it and
    // let the existing silent/session path hydrate integrations.js's private token.
    return requestInteractiveTokenDirect(options).then(async freshToken => {
      window.StoryFlowSessionAuth?.rememberSession?.(freshToken);
      const hydrated = await delegatedRequest({ silent: true, prompt: '' });
      if (!hydrated) throw new Error('Google 登入完成，但 StoryFlow 無法建立目前工作階段。請再試一次。');
      return hydrated;
    });
  };
})();
