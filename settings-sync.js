// Portable StoryFlow settings + custom platform management.
(function () {
  let cloudSaveTimer = null;
  let applyingCloudSettings = false;

  function defaultPlatformConfig() {
    return {
      indent: 'inherit',
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator
    };
  }

  function settingsPayload() {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      platforms: [...platforms],
      formatting: state.formatting,
      sceneMarker: state.sceneMarker
    };
  }

  function normalizePlatforms(names) {
    const seen = new Set();
    return (Array.isArray(names) ? names : [])
      .map(name => String(name || '').trim())
      .filter(name => name && !seen.has(name) && seen.add(name));
  }

  function ensurePlatformConfigs() {
    state.formatting ||= {};
    state.formatting.platforms ||= {};
    platforms.forEach(platform => {
      state.formatting.platforms[platform] ||= defaultPlatformConfig();
    });
  }

  function refreshPlatformDropdown(select) {
    if (!select) return;
    const current = select.value;
    const hasDefault = select.id === 'suggestionPlatformSelect' || select.id === 'reviewPlatformSelect';
    select.innerHTML = '';
    if (hasDefault) select.add(new Option('StoryFlow 預設格式', ''));
    platforms.forEach(platform => select.add(new Option(platform, platform)));
    select.value = [...select.options].some(option => option.value === current) ? current : (hasDefault ? '' : (platforms[0] || ''));
  }

  function refreshPlatformUI() {
    ensurePlatformConfigs();
    refreshPlatformDropdown(document.getElementById('suggestionPlatformSelect'));
    refreshPlatformDropdown(document.getElementById('reviewPlatformSelect'));
    if (typeof renderFormattingSettings === 'function') renderFormattingSettings();
    if (typeof renderParts === 'function') renderParts();
    renderPlatformManager();
  }

  async function savePortableSettings({ quiet = true } = {}) {
    if (applyingCloudSettings) return;
    try {
      const folder = await StoryFlowIntegrations.restoreOutputDirectory();
      if (!folder.connected) return;
      const path = await StoryFlowIntegrations.saveStoryFlowSettings(settingsPayload());
      if (!quiet) notify(`平台設定已保存：${path}`);
    } catch (error) {
      if (!quiet) notify(`平台設定尚未寫入資料夾：${error.message}`, true);
      else console.warn('Unable to save portable StoryFlow settings', error);
    }
  }

  function schedulePortableSave() {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => savePortableSettings(), 350);
  }

  async function loadPortableSettings({ seedIfMissing = false } = {}) {
    try {
      const folder = await StoryFlowIntegrations.restoreOutputDirectory();
      if (!folder.connected) return false;
      const saved = await StoryFlowIntegrations.loadStoryFlowSettings();
      if (!saved) {
        if (seedIfMissing) await savePortableSettings();
        return false;
      }

      applyingCloudSettings = true;
      const savedPlatforms = normalizePlatforms(saved.platforms);
      if (savedPlatforms.length || Array.isArray(saved.platforms)) {
        platforms.splice(0, platforms.length, ...savedPlatforms);
      }
      if (saved.formatting && typeof saved.formatting === 'object') {
        state.formatting = saved.formatting;
      }
      if (typeof saved.sceneMarker === 'string' && saved.sceneMarker.trim()) {
        state.sceneMarker = saved.sceneMarker;
      }
      ensurePlatformConfigs();
      saveState('已載入 StoryFlow 設定');
      refreshPlatformUI();
      if (typeof refreshSuggestionFormatting === 'function') refreshSuggestionFormatting();
      applyingCloudSettings = false;
      return true;
    } catch (error) {
      applyingCloudSettings = false;
      console.warn('Unable to load portable StoryFlow settings', error);
      return false;
    }
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
        <div><strong>發布平台</strong><p>平台不是寫死的；自行新增需要發布的平台，再設定各自格式。</p></div>
        <div class="platform-add-row">
          <input id="newPlatformName" class="text-input" placeholder="例如：巴哈小屋" />
          <button id="addPlatformBtn" type="button" class="button tiny primary">新增平台</button>
        </div>
      </div>
      <div id="managedPlatformList" class="managed-platform-list"></div>
      <div class="portable-settings-note">平台清單與排版會同步保存到產出資料夾的 <code>settings.json</code>；API Key 不會寫進去。</div>`;
    settingsList.insertAdjacentElement('beforebegin', manager);

    document.getElementById('addPlatformBtn').onclick = addPlatformFromInput;
    document.getElementById('newPlatformName').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addPlatformFromInput();
      }
    });
  }

  function addPlatformFromInput() {
    const input = document.getElementById('newPlatformName');
    const name = String(input?.value || '').trim();
    if (!name) return;
    if (platforms.includes(name)) {
      notify(`「${name}」已經存在`);
      input.focus();
      return;
    }
    platforms.push(name);
    state.formatting.platforms[name] = defaultPlatformConfig();
    input.value = '';
    saveState('已新增平台');
    refreshPlatformUI();
    schedulePortableSave();
  }

  function removePlatform(name) {
    if (!confirm(`移除「${name}」平台設定？\n\n不會刪除已經產出的 Markdown；只會從 StoryFlow 的平台清單移除。`)) return;
    const index = platforms.indexOf(name);
    if (index >= 0) platforms.splice(index, 1);
    delete state.formatting.platforms[name];
    for (const chapter of state.chapters || []) {
      for (const part of chapter.parts || []) {
        if (part.platformStatus) delete part.platformStatus[name];
      }
    }
    saveState('已移除平台');
    refreshPlatformUI();
    schedulePortableSave();
  }

  function renderPlatformManager() {
    ensurePlatformManager();
    const list = document.getElementById('managedPlatformList');
    if (!list) return;
    list.innerHTML = '';
    if (!platforms.length) {
      list.innerHTML = '<span class="muted">尚未新增平台。仍可使用 StoryFlow 預設格式預覽與存檔。</span>';
      return;
    }
    platforms.forEach(name => {
      const row = document.createElement('div');
      row.className = 'managed-platform-chip';
      const text = document.createElement('span');
      text.textContent = name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button platform-remove-btn';
      remove.textContent = '×';
      remove.title = `移除 ${name}`;
      remove.onclick = () => removePlatform(name);
      row.append(text, remove);
      list.appendChild(row);
    });
  }

  // Existing settings controls already update browser state. Mirror those changes to settings.json.
  const settingsDialog = document.getElementById('settingsDialog');
  if (settingsDialog) {
    settingsDialog.addEventListener('change', event => {
      if (event.target.closest('#pickerApiKeyInput')) return;
      schedulePortableSave();
    });
  }

  // When a new output folder is chosen, load its settings if present; otherwise seed it.
  const baseChooseOutputDirectory = StoryFlowIntegrations.chooseOutputDirectory;
  StoryFlowIntegrations.chooseOutputDirectory = async (...args) => {
    const result = await baseChooseOutputDirectory(...args);
    const loaded = await loadPortableSettings();
    if (!loaded) await savePortableSettings();
    return result;
  };

  // Ensure the manager appears whenever Settings is opened.
  document.getElementById('openSettingsBtn')?.addEventListener('click', () => setTimeout(() => {
    ensurePlatformManager();
    renderPlatformManager();
  }, 0));
  document.getElementById('settingsNav')?.addEventListener('click', () => setTimeout(() => {
    ensurePlatformManager();
    renderPlatformManager();
  }, 0));

  ensurePlatformManager();
  renderPlatformManager();
  loadPortableSettings({ seedIfMissing: true });
})();