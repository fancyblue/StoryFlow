// StoryFlow content and user-specific integration configuration live in the selected
// StoryFlow folder. Public repository code contains no personal Google Cloud IDs.
(function () {
  let saveTimer = null;
  let applyingDriveState = false;
  let persistQueue = Promise.resolve();
  let changeVersion = 0;
  let persistedVersion = 0;
  let canonicalSaveStatus = '正在檢查保存位置…';
  let canonicalSaveError = false;

  function renderSaveStatus() {
    if (!els.saveState) return;
    els.saveState.textContent = canonicalSaveStatus;
    els.saveState.classList.toggle('error-text', canonicalSaveError);
  }

  function setSaveStatus(message, isError = false) {
    canonicalSaveStatus = message;
    canonicalSaveError = isError;
    renderSaveStatus();
  }

  function syncedTimeLabel() {
    return new Intl.DateTimeFormat('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
  }

  function cloneDefaultState() {
    return structuredClone(defaultState);
  }

  function defaultPlatformConfig() {
    return {
      indent: 'inherit',
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator
    };
  }

  function normalizePlatforms(names) {
    const seen = new Set();
    return (Array.isArray(names) ? names : [])
      .map(name => String(name || '').trim())
      .filter(name => name && !seen.has(name) && seen.add(name));
  }

  function normalizeGoogleClientId(value) {
    return String(value || '').trim();
  }

  function projectNumberFromClientId(clientId) {
    const match = normalizeGoogleClientId(clientId).match(/^(\d+)-.+\.apps\.googleusercontent\.com$/i);
    return match?.[1] || '';
  }

  function googleClientId() {
    return normalizeGoogleClientId(window.STORYFLOW_CONFIG?.googleClientId);
  }

  function setGoogleClientId(value) {
    window.STORYFLOW_CONFIG ||= {};
    const clientId = normalizeGoogleClientId(value);
    window.STORYFLOW_CONFIG.googleClientId = clientId || null;
    window.STORYFLOW_CONFIG.googleProjectNumber = clientId ? projectNumberFromClientId(clientId) || null : null;
    return clientId;
  }

  function ensureGoogleSettingsFields() {
    const pickerInput = document.getElementById('pickerApiKeyInput');
    const section = pickerInput?.closest('.settings-section');
    if (!pickerInput || !section) return;

    const heading = section.querySelector(':scope > strong');
    const intro = section.querySelector(':scope > p');
    if (heading) heading.textContent = 'Google 整合';
    if (intro) intro.innerHTML = 'OAuth Client ID 與 Picker API Key 都保存在你選擇的 StoryFlow 資料夾 <code>settings.json</code>，不需要寫進 GitHub。分享或 clone 專案時，每個人可使用自己的 Google Cloud 設定。';

    let clientInput = document.getElementById('googleClientIdInput');
    if (!clientInput) {
      const clientLabel = document.createElement('label');
      clientLabel.className = 'field-label';
      clientLabel.htmlFor = 'googleClientIdInput';
      clientLabel.textContent = 'Google OAuth Client ID';
      clientInput = document.createElement('input');
      clientInput.id = 'googleClientIdInput';
      clientInput.className = 'text-input';
      clientInput.type = 'text';
      clientInput.autocomplete = 'off';
      clientInput.spellcheck = false;
      clientInput.placeholder = '1234567890-xxxxxxxx.apps.googleusercontent.com';
      section.insertBefore(clientLabel, pickerInput);
      section.insertBefore(clientInput, pickerInput);

      const pickerLabel = document.createElement('label');
      pickerLabel.className = 'field-label';
      pickerLabel.htmlFor = 'pickerApiKeyInput';
      pickerLabel.textContent = 'Google Picker API Key';
      section.insertBefore(pickerLabel, pickerInput);
    }

    clientInput.value = googleClientId();
    const save = document.getElementById('savePickerKeyBtn');
    const clear = document.getElementById('clearPickerKeyBtn');
    if (save) save.textContent = '保存 Google 整合設定';
    if (clear) clear.textContent = '清除 Google 設定';
  }

  function ensurePlatformConfigs() {
    state.formatting ||= structuredClone(defaultState.formatting);
    state.formatting.platforms ||= {};
    platforms.forEach(platform => {
      state.formatting.platforms[platform] ||= defaultPlatformConfig();
    });
  }

  function settingsPayload() {
    return {
      schemaVersion: 3,
      updatedAt: new Date().toISOString(),
      googleClientId: googleClientId(),
      pickerApiKey: StoryFlowIntegrations.pickerApiKey(),
      platforms: [...platforms],
      formatting: state.formatting,
      sceneMarker: state.sceneMarker
    };
  }

  function workspacePayload() {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      state
    };
  }

  async function folderConnected() {
    return Boolean((await StoryFlowIntegrations.restoreOutputDirectory()).connected);
  }

  function saveFailureStatus(error) {
    if (error?.code === 'MOBILE_READ_ONLY') return '手機唯讀 · 不會寫入資料夾';
    if (error?.code === 'WORKSPACE_CONFLICT') return '保存已暫停 · 發現較新版本';
    if (error?.code === 'WORKSPACE_CORRUPT') return '工作資料損壞 · 請先恢復';
    return '保存失敗 · 請重試';
  }

  async function persistAllNow({ quiet = true } = {}) {
    if (applyingDriveState) return false;
    if (window.StoryFlowMobileSafeMode?.isReadOnly?.()) {
      setSaveStatus('手機唯讀 · 不會寫入資料夾');
      return false;
    }
    if (!(await folderConnected())) {
      setSaveStatus('尚未保存 · 請連接資料夾');
      return false;
    }
    const targetVersion = changeVersion;
    setSaveStatus('保存中…');
    try {
      await Promise.all([
        StoryFlowIntegrations.saveWorkspace(workspacePayload()),
        StoryFlowIntegrations.saveStoryFlowSettings(settingsPayload())
      ]);
      persistedVersion = Math.max(persistedVersion, targetVersion);
      setSaveStatus(`已保存 ${syncedTimeLabel()}`);
      window.dispatchEvent(new CustomEvent('storyflow:workspace-persisted', {
        detail: { reason: 'scheduled-save' }
      }));
      if (!quiet) notify('已保存到 StoryFlow 資料夾');
      if (changeVersion > targetVersion) schedulePersist();
      return true;
    } catch (error) {
      setSaveStatus(saveFailureStatus(error), true);
      if (!quiet) notify(`尚未寫入 StoryFlow 資料夾：${error.message}`, true);
      else console.warn('Drive persistence failed', error);
      return false;
    }
  }

  function persistAll(options = {}) {
    const task = persistQueue.then(() => persistAllNow(options));
    persistQueue = task.catch(() => {});
    return task;
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persistAll();
    }, 300);
  }

  // Replace browser-local content persistence. In-memory state is only the live UI working copy.
  saveState = function saveStateToDrive(label = '準備保存') {
    changeVersion += 1;
    setSaveStatus('尚未保存 · 準備中');
    schedulePersist();
  };

  function applySavedSettings(saved) {
    if (!saved) return;
    if (typeof saved.googleClientId === 'string') setGoogleClientId(saved.googleClientId);
    const savedPlatforms = normalizePlatforms(saved.platforms);
    if (Array.isArray(saved.platforms)) platforms.splice(0, platforms.length, ...savedPlatforms);
    if (saved.formatting && typeof saved.formatting === 'object') state.formatting = saved.formatting;
    if (typeof saved.sceneMarker === 'string' && saved.sceneMarker.trim()) state.sceneMarker = saved.sceneMarker;
    StoryFlowIntegrations.setPickerApiKey(saved.pickerApiKey || '');
    ensurePlatformConfigs();
    ensureGoogleSettingsFields();
  }

  function applySavedWorkspace(saved) {
    const next = saved?.state;
    if (!next?.chapters?.length) return false;
    state = next;
    state.chapters.forEach(chapter => {
      chapter.parts ||= [];
      chapter.parts.forEach(normalizePartAfterword);
      chapter.source ||= null;
    });
    state.activeChapterId = state.chapters.some(chapter => chapter.id === state.activeChapterId)
      ? state.activeChapterId : state.chapters[0].id;
    ensurePlatformConfigs();
    return true;
  }

  async function loadDriveData() {
    if (!(await folderConnected())) return false;
    applyingDriveState = true;
    try {
      const [savedSettings, savedWorkspace] = await Promise.all([
        StoryFlowIntegrations.loadStoryFlowSettings(),
        StoryFlowIntegrations.loadWorkspace()
      ]);
      const workspaceRecovery = StoryFlowIntegrations.getWorkspaceRecovery?.();
      if (savedSettings) applySavedSettings(savedSettings);
      const hasWorkspace = applySavedWorkspace(savedWorkspace);
      refreshPlatformUI();
      renderAll();
      if (activeChapter()?.draft) suggestNextPart();
      els.pickerApiKeyInput.value = StoryFlowIntegrations.pickerApiKey();
      const clientInput = document.getElementById('googleClientIdInput');
      if (clientInput) clientInput.value = googleClientId();
      notify(workspaceRecovery
        ? '工作資料需要恢復；StoryFlow 已停止覆蓋 workspace.json'
        : hasWorkspace || savedSettings ? '已從 StoryFlow 資料夾載入' : '新的 StoryFlow 資料夾', Boolean(workspaceRecovery));
      persistedVersion = changeVersion;
      setSaveStatus(workspaceRecovery
        ? '工作資料損壞 · 請先恢復'
        : hasWorkspace || savedSettings ? `已保存 ${syncedTimeLabel()}` : '新的資料夾 · 尚未有工作資料', Boolean(workspaceRecovery));
      window.dispatchEvent(new CustomEvent('storyflow:workspace-loaded', {
        detail: { hasWorkspace, hasSettings: Boolean(savedSettings) }
      }));
      return Boolean(hasWorkspace || savedSettings);
    } finally {
      applyingDriveState = false;
    }
  }

  function refreshPlatformDropdown(select) {
    if (!select) return;
    const current = select.value;
    const hasDefault = select.id === 'suggestionPlatformSelect' || select.id === 'reviewPlatformSelect';
    select.innerHTML = '';
    if (hasDefault) select.add(new Option('預設格式', ''));
    platforms.forEach(platform => select.add(new Option(platform, platform)));
    const values = [...select.options].map(option => option.value);
    select.value = values.includes(current) ? current : (hasDefault ? '' : (platforms[0] || ''));
  }

  function refreshPlatformUI() {
    ensurePlatformConfigs();
    refreshPlatformDropdown(document.getElementById('suggestionPlatformSelect'));
    refreshPlatformDropdown(document.getElementById('reviewPlatformSelect'));
    if (typeof renderFormattingSettings === 'function') renderFormattingSettings();
    if (typeof renderParts === 'function') renderParts();
    renderPlatformManager();
  }

  function ensurePlatformManager() {
    if (document.getElementById('platformManager')) return;
    const settingsList = document.getElementById('platformFormatSettings');
    if (!settingsList) return;
    const manager = document.createElement('div');
    manager.id = 'platformManager';
    manager.className = 'platform-manager';
    manager.innerHTML = `
      <div class="platform-manager-head">
        <div><strong>發布平台</strong><p>只保留你實際會發布的平台，平台設定會各自套用。</p></div>
        <div class="platform-add-row">
          <input id="newPlatformName" class="text-input" placeholder="輸入平台名稱" />
          <button id="addPlatformBtn" type="button" class="button tiny primary">新增平台</button>
        </div>
      </div>
      <div id="managedPlatformList" class="managed-platform-list"></div>
      <div class="portable-settings-note">文章、Google 整合設定、平台設定與工作進度都保存在 StoryFlow 資料夾；公開 repo 不需要放個人的 Client ID 或 API Key。</div>`;
    settingsList.insertAdjacentElement('beforebegin', manager);
    document.getElementById('addPlatformBtn').onclick = addPlatformFromInput;
    document.getElementById('newPlatformName').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); addPlatformFromInput(); }
    });
  }

  function addPlatformFromInput() {
    const input = document.getElementById('newPlatformName');
    const name = String(input?.value || '').trim();
    if (!name) return;
    if (platforms.includes(name)) return notify(`「${name}」已存在`);
    platforms.push(name);
    state.formatting.platforms[name] = defaultPlatformConfig();
    input.value = '';
    refreshPlatformUI();
    saveState('平台已新增');
  }

  function removePlatform(name) {
    if (!confirm(`移除「${name}」平台設定？\n\n不會刪除已產出的 Markdown。`)) return;
    const index = platforms.indexOf(name);
    if (index >= 0) platforms.splice(index, 1);
    delete state.formatting.platforms[name];
    for (const chapter of state.chapters || []) for (const part of chapter.parts || []) {
      if (part.platformStatus) delete part.platformStatus[name];
    }
    refreshPlatformUI();
    saveState('平台已移除');
  }

  function renderPlatformManager() {
    ensurePlatformManager();
    const list = document.getElementById('managedPlatformList');
    if (!list) return;
    list.innerHTML = '';
    if (!platforms.length) {
      list.innerHTML = '<span class="muted">尚未新增平台；仍可使用預設格式。</span>';
      return;
    }
    platforms.forEach(name => {
      const row = document.createElement('div');
      row.className = 'managed-platform-chip';
      const text = document.createElement('span'); text.textContent = name;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'icon-button platform-remove-btn'; remove.textContent = '×';
      remove.onclick = () => removePlatform(name);
      row.append(text, remove); list.appendChild(row);
    });
  }

  // Folder selection reuses the remembered handle when permission needs to be
  // renewed. If the folder is already connected, an explicit click opens the
  // picker so the user can intentionally switch folders.
  const baseChooseOutputDirectory = StoryFlowIntegrations.chooseOutputDirectory;
  StoryFlowIntegrations.chooseOutputDirectory = async (...args) => {
    const result = await baseChooseOutputDirectory(...args);
    const loaded = await loadDriveData();
    if (!loaded) await persistAll();
    return result;
  };

  // Guard Google actions with local configuration. This gives clone/fork users a
  // useful next step instead of a generic OAuth initialization error.
  ['requestAccessToken', 'inspectGoogleDoc', 'refreshChapterSource'].forEach(name => {
    const base = StoryFlowIntegrations[name];
    if (typeof base !== 'function') return;
    StoryFlowIntegrations[name] = async function configuredGoogleAction(...args) {
      if (!googleClientId()) {
        window.StoryFlowShowSettings?.();
        throw new Error('請先在「設定 → Google 整合」輸入你自己的 OAuth Client ID。');
      }
      return base.apply(StoryFlowIntegrations, args);
    };
  });

  // Save Google Client ID + Picker API key together into settings.json.
  document.getElementById('savePickerKeyBtn').onclick = async () => {
    const clientInput = document.getElementById('googleClientIdInput');
    const nextClientId = normalizeGoogleClientId(clientInput?.value);
    if (!nextClientId || !projectNumberFromClientId(nextClientId)) {
      notify('請輸入有效的 Google OAuth Client ID（*.apps.googleusercontent.com）', true);
      clientInput?.focus();
      return;
    }
    const changedClient = nextClientId !== googleClientId();
    setGoogleClientId(nextClientId);
    StoryFlowIntegrations.setPickerApiKey(els.pickerApiKeyInput.value);
    if (changedClient) {
      window.StoryFlowSessionAuth?.forgetSession?.();
      window.StoryFlowSessionAuth?.syncSignedOutUi?.();
    }
    await persistAll({ quiet: false });
    notify(changedClient ? 'Google 整合設定已保存；請重新登入 Google' : 'Google 整合設定已保存');
  };

  document.getElementById('clearPickerKeyBtn').onclick = async () => {
    setGoogleClientId('');
    StoryFlowIntegrations.setPickerApiKey('');
    const clientInput = document.getElementById('googleClientIdInput');
    if (clientInput) clientInput.value = '';
    els.pickerApiKeyInput.value = '';
    window.StoryFlowSessionAuth?.forgetSession?.();
    window.StoryFlowSessionAuth?.syncSignedOutUi?.();
    await persistAll({ quiet: false });
    notify('已清除 Google 整合設定');
  };

  document.getElementById('settingsDialog')?.addEventListener('change', event => {
    if (!['pickerApiKeyInput', 'googleClientIdInput'].includes(event.target.id)) {
      changeVersion += 1;
      schedulePersist();
    }
  });

  const googleLoginButton = document.getElementById('googleLoginBtn');
  if (googleLoginButton) {
    const baseLogin = googleLoginButton.onclick;
    googleLoginButton.onclick = event => {
      if (!googleClientId()) {
        event?.preventDefault?.();
        window.StoryFlowShowSettings?.();
        notify('請先設定 Google OAuth Client ID', true);
        return;
      }
      return baseLogin?.call(googleLoginButton, event);
    };
  }

  // Clear test data now clears Drive workspace.json, while keeping settings/platforms.
  setTimeout(() => {
    const reset = document.getElementById('resetWorkspaceBtn');
    if (!reset) return;
    reset.onclick = async () => {
      if (!confirm('清除目前 StoryFlow 工作資料？\n\n會重設 workspace.json，但保留 settings.json、平台設定與已產出的 Markdown。')) return;
      state = cloneDefaultState();
      suggestion = null;
      renderAll();
      await StoryFlowIntegrations.saveWorkspace(workspacePayload());
      notify('工作資料已清除');
    };
  }, 0);

  async function restoreRememberedConnections() {
    try {
      const folder = await StoryFlowIntegrations.restoreOutputDirectory();
      await refreshFolderStatus();
      if (folder.connected) await loadDriveData();
      else setSaveStatus(folder.remembered ? '尚未保存 · 請重新連接資料夾' : '尚未保存 · 請連接資料夾');
    } catch (error) {
      console.warn('StoryFlow folder auto-restore failed', error);
    }

    try {
      if (!googleClientId()) {
        window.StoryFlowSessionAuth?.syncSignedOutUi?.();
        return;
      }
      const restoredGoogle = await StoryFlowIntegrations.restoreGoogleAccess();
      if (restoredGoogle) await loginGoogleStatusOnly();
    } catch (error) {
      console.warn('Google session auto-restore failed', error);
    }
  }

  ensureGoogleSettingsFields();
  window.StoryFlowSaveStatus = { render: renderSaveStatus, set: setSaveStatus };
  window.StoryFlowPersistenceStatus = {
    dirty: () => Boolean(saveTimer || changeVersion > persistedVersion || StoryFlowIntegrations.workspaceSavePending?.()),
    flush: () => persistAll({ quiet: true }),
    markClean: () => {
      clearTimeout(saveTimer);
      saveTimer = null;
      persistedVersion = changeVersion;
    }
  };
  window.addEventListener('beforeunload', event => {
    if (!window.StoryFlowPersistenceStatus.dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  renderSaveStatus();
  // Remove legacy content caches while preserving the connection-only database.
  StoryFlowIntegrations.purgeLegacyBrowserStorage();
  ensurePlatformManager();
  renderPlatformManager();
  setTimeout(restoreRememberedConnections, 0);
})();
