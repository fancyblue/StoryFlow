// Public runtime defaults only. User-specific Google credentials are loaded from
// settings.json. A phone/new device may import that file through the native file
// picker; only the integration bootstrap is then kept for this browser session so a
// normal refresh does not lose the Client ID again.
(function () {
  const SESSION_KEY = 'storyflow.integration-bootstrap.v1';
  let bootstrap = {};
  try { bootstrap = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}') || {}; }
  catch (_) { bootstrap = {}; }

  const clientId = String(bootstrap.googleClientId || '').trim();
  const projectNumber = String(bootstrap.googleProjectNumber || '').trim()
    || clientId.match(/^(\d+)-.+\.apps\.googleusercontent\.com$/i)?.[1]
    || '';

  window.STORYFLOW_CONFIG = {
    googleClientId: clientId || null,
    googleProjectNumber: projectNumber || null,
    googleScopes: [
      "https://www.googleapis.com/auth/drive.file"
    ],
    googlePickerApiKey: null
  };
})();
