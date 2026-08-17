// Mobile/new-device bootstrap: load settings.json through the browser's native file
// picker before Google OAuth is available. This avoids the OAuth chicken-and-egg
// problem where the Client ID is itself stored in settings.json.
(function () {
  const SESSION_KEY = 'storyflow.integration-bootstrap.v1';

  function normalizeClientId(value) {
    return String(value || '').trim();
  }

  function projectNumberFromClientId(clientId) {
    const match = normalizeClientId(clientId).match(/^(\d+)-.+\.apps\.googleusercontent\.com$/i);
    return match?.[1] || '';
  }

  function integrationPayload(saved) {
    const source = saved?.settings && typeof saved.settings === 'object' ? saved.settings : saved;
    if (!source || typeof source !== 'object') throw new Error('這不是有效的 StoryFlow settings.json。');
    const googleClientId = normalizeClientId(source.googleClientId);
    const projectNumber = projectNumberFromClientId(googleClientId);
    if (!googleClientId || !projectNumber) {
      throw new Error('settings.json 裡找不到有效的 Google OAuth Client ID。');
    }
    return {
      googleClientId,
      googleProjectNumber: projectNumber,
      pickerApiKey: String(source.pickerApiKey || '').trim(),
      platforms: Array.isArray(source.platforms) ? source.platforms : null,
      formatting: source.formatting && typeof source.formatting === 'object' ? source.formatting : null,
      sceneMarker: typeof source.sceneMarker === 'string' ? source.sceneMarker : null
    };
  }

  function rememberIntegration(payload) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        googleClientId: payload.googleClientId,
        googleProjectNumber: payload.googleProjectNumber,
        pickerApiKey: payload.pickerApiKey
      }));
    } catch (_) {}
  }

  function applyPayload(payload, { remember = true } = {}) {
    window.STORYFLOW_CONFIG ||= {};
    const previousClientId = String(window.STORYFLOW_CONFIG.googleClientId || '');
    window.STORYFLOW_CONFIG.googleClientId = payload.googleClientId;
    window.STORYFLOW_CONFIG.googleProjectNumber = payload.googleProjectNumber;
    StoryFlowIntegrations?.setPickerApiKey?.(payload.pickerApiKey || '');

    // Import the rest of settings.json too when present, so a phone/new device gets
    // the same publishing configuration without requiring a writable local folder.
    if (payload.platforms && typeof platforms !== 'undefined') {
      const names = [...new Set(payload.platforms.map(name => String(name || '').trim()).filter(Boolean))];
      platforms.splice(0, platforms.length, ...names);
    }
    if (payload.formatting && typeof state !== 'undefined') state.formatting = structuredClone(payload.formatting);
    if (payload.sceneMarker && typeof state !== 'undefined') state.sceneMarker = payload.sceneMarker;

    if (remember) rememberIntegration(payload);
    if (previousClientId && previousClientId !== payload.googleClientId) {
      window.StoryFlowSessionAuth?.forgetSession?.();
      window.StoryFlowSessionAuth?.syncSignedOutUi?.();
    }

    const clientInput = document.getElementById('googleClientIdInput');
    const pickerInput = document.getElementById('pickerApiKeyInput');
    if (clientInput) clientInput.value = payload.googleClientId;
    if (pickerInput) pickerInput.value = payload.pickerApiKey || '';
    window.renderFormattingSettings?.();
    window.dispatchEvent(new CustomEvent('storyflow:integration-config-changed'));
  }

  function updateStatus(message, ready = false) {
    const status = document.getElementById('settingsBootstrapStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('ready', ready);
  }

  async function importSettingsFile(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (_) {
      throw new Error('無法讀取這個 JSON 檔案。');
    }
    const payload = integrationPayload(parsed);
    applyPayload(payload);
    updateStatus('設定已載入，可以登入 Google。重新整理也會保留到這次瀏覽器工作階段結束。', true);
    notify?.('settings.json 已載入，現在可以登入 Google');
  }

  function installUi() {
    const clientInput = document.getElementById('googleClientIdInput');
    const section = clientInput?.closest('.settings-section');
    if (!section || document.getElementById('settingsBootstrapPanel')) return;
    const intro = section.querySelector(':scope > p');

    const panel = document.createElement('div');
    panel.id = 'settingsBootstrapPanel';
    panel.className = 'settings-bootstrap-panel';
    panel.innerHTML = `
      <div class="settings-bootstrap-copy">
        <strong>手機／新裝置快速載入</strong>
        <span>不需要先登入 Google。從手機的檔案選擇器開啟 <code>settings.json</code>；若 Google Drive 已加入系統檔案來源，也可以直接從 Drive 選取。</span>
        <small id="settingsBootstrapStatus">${window.STORYFLOW_CONFIG?.googleClientId ? '目前已載入 Client ID。' : '目前尚未載入 Client ID。'}</small>
      </div>
      <div class="settings-bootstrap-actions">
        <button id="importSettingsJsonBtn" type="button" class="button ghost">匯入 settings.json</button>
        <button id="bootstrapGoogleLoginBtn" type="button" class="button primary">登入 Google</button>
      </div>
      <input id="settingsBootstrapFileInput" type="file" accept="application/json,.json" hidden />`;
    intro?.insertAdjacentElement('afterend', panel);

    const input = panel.querySelector('#settingsBootstrapFileInput');
    panel.querySelector('#importSettingsJsonBtn').onclick = () => input.click();
    input.onchange = async () => {
      try {
        await importSettingsFile(input.files?.[0]);
      } catch (error) {
        updateStatus(error.message, false);
        notify?.(error.message, true);
      } finally {
        input.value = '';
      }
    };
    panel.querySelector('#bootstrapGoogleLoginBtn').onclick = () => {
      if (!window.STORYFLOW_CONFIG?.googleClientId) {
        updateStatus('請先匯入 settings.json，或在下方手動輸入 Client ID。', false);
        return;
      }
      document.getElementById('googleLoginBtn')?.click();
    };
  }

  // Restore only integration bootstrap data for this browser session. config.js also
  // reads this early on reload; this second pass restores the Picker API key and UI.
  try {
    const cached = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (cached?.googleClientId) applyPayload(integrationPayload(cached), { remember: false });
  } catch (_) {}

  installUi();
  const observer = new MutationObserver(installUi);
  observer.observe(document.body, { childList: true, subtree: true });

  window.StoryFlowSettingsBootstrap = {
    sessionKey: SESSION_KEY,
    importSettingsFile,
    clear() {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    }
  };
})();
