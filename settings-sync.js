// StoryFlow persistence lives in the selected Google Drive-mounted folder, not browser storage.
(function () {
  let saveTimer = null;
  let applyingDriveState = false;

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

  function ensurePlatformConfigs() {
    state.formatting ||= structuredClone(defaultState.formatting);
    state.formatting.platforms ||= {};
    platforms.forEach(platform => {
      state.formatting.platforms[platform] ||= defaultPlatformConfig();
    });
  }

  function settingsPayload() {
    return {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
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

  async function persistAll({ quiet = true } = {}) {
    if (applyingDriveState || !(await folderConnected())) return;
    try {
      await Promise.all([
        StoryFlowIntegrations.saveWorkspace(workspacePayload()),
        StoryFlowIntegrations.saveStoryFlowSettings(settingsPayload())
      ]);
      if (!quiet) notify('已保存到 StoryFlow 資料夾');
    } catch (error) {
      if (!quiet) notify(`尚未寫入 StoryFlow 資料夾：${error.message}`, true);
      else console.warn('Drive persistence failed', error);
    }
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistAll(), 300);
  }

  // Replace browser-local persistence. In-memory state is only the live UI working copy.
  saveState = function saveStateToDrive(label = '準備同步') {
    els.saveState.textContent = label;
    schedulePersist();
    window.setTimeout(() => { els.saveState.textContent = '已同步'; }, 900);
  };

  function applySavedSettings(saved) {
    if (!saved) return;
    const savedPlatforms = normalizePlatforms(saved.platforms);
    if (Array.isArray(saved.platforms)) platforms.splice(0, platforms.length, ...savedPlatforms);
    if (saved.formatting && typeof saved.formatting === 'object') state.formatting = saved.formatting;
    if (typeof saved.sceneMarker === 'string' && saved.sceneMarker.trim()) state.sceneMarker = saved.sceneMarker;
    StoryFlowIntegrations.setPickerApiKey(saved.pickerApiKey || '');
    ensurePlatformConfigs();
  }

  function applySavedWorkspace(saved) {
    const next = saved?.state;
    if (!next?.chapters?.length) return false;
    state = next;
    state.chapters.forEach(chapter => { chapter.parts ||= []; chapter.source ||= null; });
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
      if (savedSettings) applySavedSettings(savedSettings);
      const hasWorkspace = applySavedWorkspace(savedWorkspace);
      refreshPlatformUI();
      renderAll();
      if (activeChapter()?.draft) suggestNextPart();
      els.pickerApiKeyInput.value = StoryFlowIntegrations.pickerApiKey();
      notify(hasWorkspace || savedSettings ? '已從 StoryFlow 資料夾載入' : '新的 StoryFlow 資料夾');
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
        <div><strong>發布平台</strong><p>只新增你真的使用的平台。</p></div>
        <div class="platform-add-row">
          <input id="newPlatformName" class="text-input" placeholder="平台名稱" />
          <button id="addPlatformBtn" type="button" class="button tiny primary">新增</button>
        </div>
      </div>
      <div id="managedPlatformList" class="managed-platform-list"></div>
      <div class="portable-settings-note">平台、排版、工作進度與 API Key 都保存在你選的 StoryFlow 資料夾；瀏覽器不保存 StoryFlow 資料。</div>`;
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

  // Folder selection becomes the session entry point because no directory handle is stored in-browser.
  const baseChooseOutputDirectory = StoryFlowIntegrations.chooseOutputDirectory;
  StoryFlowIntegrations.chooseOutputDirectory = async (...args) => {
    const result = await baseChooseOutputDirectory(...args);
    const loaded = await loadDriveData();
    if (!loaded) await persistAll();
    return result;
  };

  // Save API key into Drive settings instead of localStorage.
  document.getElementById('savePickerKeyBtn').onclick = async () => {
    StoryFlowIntegrations.setPickerApiKey(els.pickerApiKeyInput.value);
    await persistAll({ quiet: false });
  };
  document.getElementById('clearPickerKeyBtn').onclick = async () => {
    StoryFlowIntegrations.setPickerApiKey('');
    els.pickerApiKeyInput.value = '';
    await persistAll({ quiet: false });
  };

  document.getElementById('settingsDialog')?.addEventListener('change', event => {
    if (event.target.id !== 'pickerApiKeyInput') schedulePersist();
  });

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

  // Remove any legacy browser residue left by earlier test versions.
  StoryFlowIntegrations.purgeLegacyBrowserStorage();
  ensurePlatformManager();
  renderPlatformManager();
})();