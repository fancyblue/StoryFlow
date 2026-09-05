// Google integration bootstrap + settings state UX.
// A new device can load settings.json before OAuth is available. Once integration
// settings exist, the raw Client ID / API key fields stay out of the way until the
// user explicitly chooses to update them.
(function () {
  const SESSION_KEY = 'storyflow.integration-bootstrap.v1';
  let editing = false;
  let sourceHint = '';

  function normalizeClientId(value) {
    return String(value || '').trim();
  }

  function projectNumberFromClientId(clientId) {
    const match = normalizeClientId(clientId).match(/^(\d+)-.+\.apps\.googleusercontent\.com$/i);
    return match?.[1] || '';
  }

  function hasConfig() {
    return Boolean(normalizeClientId(window.STORYFLOW_CONFIG?.googleClientId));
  }

  function isAuthenticated() {
    return Boolean(
      window.StoryFlowGoogleAuth?.isAuthenticated?.()
      || window.StoryFlowIntegrations?.hasGoogleToken?.()
    );
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

  function rememberIntegration(payload, source = sourceHint || 'settings') {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        googleClientId: payload.googleClientId,
        googleProjectNumber: payload.googleProjectNumber,
        pickerApiKey: payload.pickerApiKey,
        source
      }));
    } catch (_) {}
  }

  function currentSettingsPayload() {
    return {
      schemaVersion: 3,
      updatedAt: new Date().toISOString(),
      googleClientId: normalizeClientId(window.STORYFLOW_CONFIG?.googleClientId),
      pickerApiKey: StoryFlowIntegrations?.pickerApiKey?.() || '',
      platforms: typeof platforms !== 'undefined' ? [...platforms] : [],
      formatting: typeof state !== 'undefined' ? state.formatting : {},
      sceneMarker: typeof state !== 'undefined' ? state.sceneMarker : '＊＊＊'
    };
  }

  function applyPayload(payload, { remember = true, source = 'settings' } = {}) {
    window.STORYFLOW_CONFIG ||= {};
    const previousClientId = String(window.STORYFLOW_CONFIG.googleClientId || '');
    window.STORYFLOW_CONFIG.googleClientId = payload.googleClientId;
    window.STORYFLOW_CONFIG.googleProjectNumber = payload.googleProjectNumber;
    StoryFlowIntegrations?.setPickerApiKey?.(payload.pickerApiKey || '');

    if (payload.platforms && typeof platforms !== 'undefined') {
      const names = [...new Set(payload.platforms.map(name => String(name || '').trim()).filter(Boolean))];
      platforms.splice(0, platforms.length, ...names);
    }
    if (payload.formatting && typeof state !== 'undefined') state.formatting = structuredClone(payload.formatting);
    if (payload.sceneMarker && typeof state !== 'undefined') state.sceneMarker = payload.sceneMarker;

    sourceHint = source;
    if (remember) rememberIntegration(payload, source);
    if (previousClientId && previousClientId !== payload.googleClientId) {
      window.StoryFlowGoogleAuth?.invalidate?.();
      window.StoryFlowSessionAuth?.forgetSession?.();
      window.StoryFlowSessionAuth?.syncSignedOutUi?.();
    }

    const clientInput = document.getElementById('googleClientIdInput');
    const pickerInput = document.getElementById('pickerApiKeyInput');
    if (clientInput) clientInput.value = payload.googleClientId;
    if (pickerInput) pickerInput.value = payload.pickerApiKey || '';
    window.renderFormattingSettings?.();
    window.dispatchEvent(new CustomEvent('storyflow:integration-config-changed'));
    syncView();
  }

  function setStatus(message, ready = false) {
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
    editing = false;
    applyPayload(payload, { source: 'imported' });
    setStatus('設定已載入。', true);
    window.notify?.('settings.json 已載入；Google 整合設定已就緒');
  }

  function fieldNodes(section) {
    return {
      clientLabel: section?.querySelector('label[for="googleClientIdInput"]'),
      clientInput: document.getElementById('googleClientIdInput'),
      pickerLabel: section?.querySelector('label[for="pickerApiKeyInput"]'),
      pickerInput: document.getElementById('pickerApiKeyInput'),
      actions: document.getElementById('savePickerKeyBtn')?.closest('.settings-actions')
    };
  }

  function setFieldsVisible(section, visible) {
    const nodes = fieldNodes(section);
    Object.values(nodes).forEach(node => {
      if (node) node.hidden = !visible;
    });
    section?.classList.toggle('google-integration-editing', visible);
  }

  function sourceDescription() {
    if (sourceHint === 'imported') return '已從 settings.json 載入';
    if (sourceHint === 'manual') return '已保存到 StoryFlow settings.json';
    return 'Google 整合設定已載入';
  }

  function syncSaveButtonState() {
    const save = document.getElementById('savePickerKeyBtn');
    const client = document.getElementById('googleClientIdInput');
    const picker = document.getElementById('pickerApiKeyInput');
    if (!save || !client || !picker) return;

    const nextClientId = normalizeClientId(client.value);
    const currentClientId = normalizeClientId(window.STORYFLOW_CONFIG?.googleClientId);
    const nextPickerKey = String(picker.value || '').trim();
    const currentPickerKey = String(StoryFlowIntegrations?.pickerApiKey?.() || '').trim();
    const changed = nextClientId !== currentClientId || nextPickerKey !== currentPickerKey;
    const canSave = Boolean(projectNumberFromClientId(nextClientId) && changed);

    save.disabled = !canSave;
    save.classList.toggle('primary', canSave);
    save.classList.toggle('ghost', !canSave);

    // With nothing stored there is nothing to clear. Leaving the destructive
    // action as the only enabled control in an unconfigured state would make
    // "清除" read as the recommended next step.
    const clear = document.getElementById('clearPickerKeyBtn');
    if (clear) clear.disabled = !hasConfig();
  }

  function syncView() {
    const panel = document.getElementById('settingsBootstrapPanel');
    const section = document.getElementById('googleClientIdInput')?.closest('.settings-section');
    if (!panel || !section) return;

    const configured = hasConfig();
    const authenticated = configured && isAuthenticated();
    const copy = panel.querySelector('.settings-bootstrap-copy');
    const actions = panel.querySelector('.settings-bootstrap-actions');
    if (!copy || !actions) return;

    panel.classList.toggle('configured', configured);
    panel.classList.toggle('authenticated', authenticated);
    panel.classList.toggle('editing', editing);
    setFieldsVisible(section, !configured || editing);
    syncSaveButtonState();

    if (!configured) {
      copy.innerHTML = `
        <strong>Google 整合尚未設定</strong>
        <span>可匯入既有 <code>settings.json</code>，或在下方手動輸入 Client ID 與 API Key。</span>
        <small id="settingsBootstrapStatus">先完成設定後才能登入 Google。</small>`;
      actions.innerHTML = '<button id="importSettingsJsonBtn" type="button" class="button primary">匯入 settings.json</button>';
      wireActions();
      return;
    }

    if (editing) {
      copy.innerHTML = `
        <strong>更新 Google 整合設定</strong>
        <span>只有需要更換 Google Cloud 專案或 API Key 時才需要修改。</span>
        <small id="settingsBootstrapStatus" class="ready">目前設定仍會保留，直到你保存變更。</small>`;
      actions.innerHTML = `
        <button id="importSettingsJsonBtn" type="button" class="button ghost">重新匯入 settings.json</button>
        <button id="cancelGoogleSettingsEditBtn" type="button" class="button ghost">取消更新</button>`;
      wireActions();
      return;
    }

    copy.innerHTML = `
      <strong>${authenticated ? 'Google 已連線' : 'Google 整合已就緒'}</strong>
      <span>${sourceDescription()}。Client ID 與 API Key 已隱藏；需要變更時再進入更新模式。</span>
      <small id="settingsBootstrapStatus" class="ready">${authenticated ? '目前已登入 Google，可以直接使用 Google Docs。' : '設定完成，登入後即可使用 Google Docs。'}</small>`;

    actions.innerHTML = authenticated
      ? `<span class="settings-google-status connected"><span aria-hidden="true">●</span> 已登入 Google</span>
         <button id="editGoogleSettingsBtn" type="button" class="button ghost">更新設定</button>
         <button id="importSettingsJsonBtn" type="button" class="button ghost">重新匯入</button>`
      : `<button id="bootstrapGoogleLoginBtn" type="button" class="button primary">登入 Google</button>
         <button id="editGoogleSettingsBtn" type="button" class="button ghost">更新設定</button>
         <button id="importSettingsJsonBtn" type="button" class="button ghost">重新匯入</button>`;
    wireActions();
  }

  function openFilePicker() {
    document.getElementById('settingsBootstrapFileInput')?.click();
  }

  async function loginGoogle() {
    if (!hasConfig()) {
      setStatus('請先匯入 settings.json，或在下方手動輸入設定。', false);
      return;
    }
    const button = document.getElementById('bootstrapGoogleLoginBtn');
    if (button) {
      button.disabled = true;
      button.textContent = '登入中…';
    }
    try {
      const ok = window.StoryFlowGoogleAuth?.login
        ? await window.StoryFlowGoogleAuth.login()
        : (document.getElementById('googleLoginBtn')?.click(), false);
      if (ok || isAuthenticated()) syncView();
    } finally {
      if (!isAuthenticated() && button) {
        button.disabled = false;
        button.textContent = '登入 Google';
      }
    }
  }

  function wireActions() {
    document.getElementById('importSettingsJsonBtn')?.addEventListener('click', openFilePicker);
    document.getElementById('bootstrapGoogleLoginBtn')?.addEventListener('click', loginGoogle);
    document.getElementById('editGoogleSettingsBtn')?.addEventListener('click', () => {
      editing = true;
      syncView();
      requestAnimationFrame(() => document.getElementById('googleClientIdInput')?.focus());
    });
    document.getElementById('cancelGoogleSettingsEditBtn')?.addEventListener('click', () => {
      editing = false;
      const client = document.getElementById('googleClientIdInput');
      const picker = document.getElementById('pickerApiKeyInput');
      if (client) client.value = window.STORYFLOW_CONFIG?.googleClientId || '';
      if (picker) picker.value = StoryFlowIntegrations?.pickerApiKey?.() || '';
      syncView();
    });
  }

  async function saveManualSettings() {
    const clientInput = document.getElementById('googleClientIdInput');
    const pickerInput = document.getElementById('pickerApiKeyInput');
    const clientId = normalizeClientId(clientInput?.value);
    const projectNumber = projectNumberFromClientId(clientId);
    if (!clientId || !projectNumber) {
      window.notify?.('請輸入有效的 Google OAuth Client ID（*.apps.googleusercontent.com）', true);
      clientInput?.focus();
      return;
    }

    const folder = await StoryFlowIntegrations.restoreOutputDirectory();
    if (!folder.connected) {
      window.notify?.('請先連接 StoryFlow 資料夾，再保存 Google 整合設定。', true);
      return;
    }

    const previousClientId = normalizeClientId(window.STORYFLOW_CONFIG?.googleClientId);
    window.STORYFLOW_CONFIG.googleClientId = clientId;
    window.STORYFLOW_CONFIG.googleProjectNumber = projectNumber;
    StoryFlowIntegrations.setPickerApiKey(pickerInput?.value || '');
    const payload = currentSettingsPayload();

    try {
      await StoryFlowIntegrations.saveStoryFlowSettings(payload);
      sourceHint = 'manual';
      rememberIntegration({
        googleClientId: clientId,
        googleProjectNumber: projectNumber,
        pickerApiKey: payload.pickerApiKey
      }, 'manual');
      if (previousClientId && previousClientId !== clientId) window.StoryFlowGoogleAuth?.invalidate?.();
      editing = false;
      window.notify?.('Google 整合設定已保存到 StoryFlow/settings.json');
      syncView();
    } catch (error) {
      window.notify?.(`Google 整合設定保存失敗：${error.message}`, true);
    }
  }

  async function clearManualSettings() {
    if (!window.confirm('清除 Google Client ID 與 Picker API Key？')) return;
    const folder = await StoryFlowIntegrations.restoreOutputDirectory();
    if (!folder.connected) {
      window.notify?.('請先連接 StoryFlow 資料夾，再清除保存的 Google 設定。', true);
      return;
    }
    window.STORYFLOW_CONFIG.googleClientId = null;
    window.STORYFLOW_CONFIG.googleProjectNumber = null;
    StoryFlowIntegrations.setPickerApiKey('');
    window.StoryFlowGoogleAuth?.invalidate?.();
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    await StoryFlowIntegrations.saveStoryFlowSettings(currentSettingsPayload());
    editing = false;
    sourceHint = '';
    window.notify?.('Google 整合設定已清除');
    syncView();
  }

  function installUi() {
    const clientInput = document.getElementById('googleClientIdInput');
    const section = clientInput?.closest('.settings-section');
    if (!section) return;

    let panel = document.getElementById('settingsBootstrapPanel');
    if (!panel) {
      const intro = section.querySelector(':scope > p');
      panel = document.createElement('div');
      panel.id = 'settingsBootstrapPanel';
      panel.className = 'settings-bootstrap-panel';
      panel.innerHTML = '<div class="settings-bootstrap-copy"></div><div class="settings-bootstrap-actions"></div><input id="settingsBootstrapFileInput" type="file" accept="application/json,.json" hidden />';
      intro?.insertAdjacentElement('afterend', panel);

      const input = panel.querySelector('#settingsBootstrapFileInput');
      input.onchange = async () => {
        try {
          await importSettingsFile(input.files?.[0]);
        } catch (error) {
          setStatus(error.message, false);
          window.notify?.(error.message, true);
        } finally {
          input.value = '';
        }
      };
    }

    // Replace the legacy always-visible save/clear behavior with explicit update mode.
    const save = document.getElementById('savePickerKeyBtn');
    const clear = document.getElementById('clearPickerKeyBtn');
    if (save && !save.dataset.bootstrapManaged) {
      save.dataset.bootstrapManaged = '1';
      save.onclick = event => { event.preventDefault(); saveManualSettings(); };
    }
    if (clear && !clear.dataset.bootstrapManaged) {
      clear.dataset.bootstrapManaged = '1';
      clear.onclick = event => { event.preventDefault(); clearManualSettings(); };
    }

    [clientInput, document.getElementById('pickerApiKeyInput')].forEach(input => {
      if (!input || input.dataset.bootstrapDirtyBound === '1') return;
      input.dataset.bootstrapDirtyBound = '1';
      input.addEventListener('input', syncSaveButtonState);
    });

    syncView();
  }

  // Restore bootstrap config for this browser session. config.js also reads it early;
  // this pass restores the Picker API key, formatting and source label in the UI.
  try {
    const cached = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (cached?.googleClientId) {
      sourceHint = cached.source || 'settings';
      applyPayload(integrationPayload(cached), { remember: false, source: sourceHint });
    }
  } catch (_) {}

  installUi();
  const observer = new MutationObserver(() => {
    if (!document.getElementById('settingsBootstrapPanel')) installUi();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('storyflow:connection-changed', syncView);
  window.addEventListener('storyflow:integration-config-changed', syncView);

  window.StoryFlowSettingsBootstrap = {
    sessionKey: SESSION_KEY,
    importSettingsFile,
    sync: syncView,
    clear() {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
      sourceHint = '';
      syncView();
    }
  };
})();
