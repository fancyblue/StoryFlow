// Publishing platform presets: provide defaults, but allow user-added platforms.
(function () {
  const DEFAULT_PLATFORMS = ['巴哈小屋', '方格子'];
  const PRESET_VERSION = 1;

  function defaultConfig() {
    return {
      indent: 'inherit',
      paragraphSpacing: state.formatting?.defaultParagraphSpacing ?? true,
      sceneSeparator: state.formatting?.defaultSceneSeparator ?? true
    };
  }

  function uniqueNames(names) {
    const seen = new Set();
    return names.map(name => String(name || '').trim()).filter(name => name && !seen.has(name) && seen.add(name));
  }

  function normalizePlatformState({ migrate = false } = {}) {
    state.formatting ||= structuredClone(defaultState.formatting);
    state.formatting.platforms ||= {};

    const firstMigration = migrate && state.platformPresetVersion !== PRESET_VERSION;
    const oldConfigs = state.formatting.platforms;
    const oldNames = uniqueNames([...platforms, ...Object.keys(oldConfigs)]);
    const names = firstMigration
      ? [...DEFAULT_PLATFORMS]
      : uniqueNames([...DEFAULT_PLATFORMS, ...oldNames.filter(name => !DEFAULT_PLATFORMS.includes(name))]);

    const next = {};
    for (const name of names) {
      next[name] = firstMigration
        ? defaultConfig()
        : { ...defaultConfig(), ...(oldConfigs[name] || {}) };
    }

    state.formatting.platforms = next;
    platforms.splice(0, platforms.length, ...names);

    for (const chapter of state.chapters || []) {
      for (const part of chapter.parts || []) {
        const prior = part.platformStatus || {};
        part.platformStatus = Object.fromEntries(names.map(name => [name, firstMigration ? false : Boolean(prior[name])]));
      }
    }

    if (firstMigration) state.platformPresetVersion = PRESET_VERSION;
  }

  function fillSelector(select) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    select.add(new Option('預設設定', ''));
    platforms.forEach(name => select.add(new Option(name, name)));
    const values = [...select.options].map(option => option.value);
    select.value = values.includes(current) ? current : '';
  }

  function syncSelectors() {
    fillSelector(document.getElementById('suggestionPlatformSelect'));
    fillSelector(document.getElementById('reviewPlatformSelect'));
    document.querySelectorAll('.copy-platform').forEach(fillSelector);
  }

  function bindSelector(select) {
    if (!select || select.dataset.platformPresetBound) return;
    select.dataset.platformPresetBound = '1';
    const resync = () => fillSelector(select);
    select.addEventListener('focus', resync);
    select.addEventListener('pointerdown', resync);
  }

  function bindSelectors() {
    bindSelector(document.getElementById('suggestionPlatformSelect'));
    bindSelector(document.getElementById('reviewPlatformSelect'));
    document.querySelectorAll('.copy-platform').forEach(bindSelector);
  }

  function updateSettingsCopy() {
    const section = document.getElementById('platformFormatSettings')?.closest('.settings-section');
    const description = section?.querySelector('p');
    if (description) description.textContent = '預設提供「巴哈小屋、方格子」，也可以自行新增發布平台；每個平台可個別設定段首、段落空行與場景分隔符。';
  }

  function refreshPlatformSurfaces() {
    normalizePlatformState({ migrate: false });
    if (typeof renderFormattingSettings === 'function') renderFormattingSettings();
    if (typeof renderParts === 'function') renderParts();
    if (typeof renderPlatformManager === 'function') renderPlatformManager();
    syncSelectors();
    bindSelectors();
    updateSettingsCopy();
  }

  // Keep the two defaults available without deleting user-created platforms.
  normalizePlatformState({ migrate: false });

  const baseRenderSuggestion = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionPlatformPreset() {
    baseRenderSuggestion();
    syncSelectors();
    bindSelectors();
  };

  const baseRenderParts = window.renderParts;
  window.renderParts = function renderPartsPlatformPreset() {
    baseRenderParts();
    syncSelectors();
    bindSelectors();
  };

  // Existing workspaces that have not yet received the requested one-time cleanup
  // are cleaned exactly once. After that, user-added platforms are preserved.
  const baseChooseOutputDirectory = StoryFlowIntegrations.chooseOutputDirectory;
  StoryFlowIntegrations.chooseOutputDirectory = async (...args) => {
    const result = await baseChooseOutputDirectory(...args);
    const needsMigration = state.platformPresetVersion !== PRESET_VERSION;
    normalizePlatformState({ migrate: true });
    refreshPlatformSurfaces();
    if (needsMigration) saveState('平台設定已整理');
    return result;
  };

  document.getElementById('openSettingsBtn')?.addEventListener('click', () => setTimeout(refreshPlatformSurfaces, 0));
  document.getElementById('settingsNav')?.addEventListener('click', () => setTimeout(refreshPlatformSurfaces, 0));

  refreshPlatformSurfaces();
})();