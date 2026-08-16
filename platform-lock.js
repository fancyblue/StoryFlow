// Publishing platform presets: provide defaults on first setup, then respect user removals/additions.
(function () {
  const DEFAULT_PLATFORMS = ['巴哈小屋', '方格子'];
  const PRESET_VERSION = 2;

  function defaultConfig() {
    return {
      indent: 'inherit',
      paragraphSpacing: state.formatting?.defaultParagraphSpacing ?? true,
      sceneSeparator: state.formatting?.defaultSceneSeparator ?? true
    };
  }

  function uniqueNames(names) {
    const seen = new Set();
    return (names || []).map(name => String(name || '').trim()).filter(name => name && !seen.has(name) && seen.add(name));
  }

  function normalizePlatformState({ migrate = false } = {}) {
    state.formatting ||= structuredClone(defaultState.formatting);
    state.formatting.platforms ||= {};

    const firstMigration = migrate && state.platformPresetVersion !== PRESET_VERSION;
    const oldConfigs = state.formatting.platforms;
    const oldNames = uniqueNames([...platforms, ...Object.keys(oldConfigs)]).filter(name => name !== '巴哈姆特');
    const names = firstMigration
      ? [...DEFAULT_PLATFORMS]
      : (state.platformPresetVersion >= PRESET_VERSION ? oldNames : uniqueNames([...DEFAULT_PLATFORMS, ...oldNames]));

    const next = {};
    for (const name of names) next[name] = { ...defaultConfig(), ...(oldConfigs[name] || {}) };
    state.formatting.platforms = next;
    platforms.splice(0, platforms.length, ...names);

    for (const chapter of state.chapters || []) {
      for (const part of chapter.parts || []) {
        const prior = part.platformStatus || {};
        part.platformStatus = Object.fromEntries(names.map(name => [name, Boolean(prior[name])]));
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
    if (description) description.textContent = '初始提供「巴哈小屋、方格子」。兩者都可以移除，也可以自行新增其他平台；每個平台可個別設定排版。';
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

  const baseChooseOutputDirectory = StoryFlowIntegrations.chooseOutputDirectory;
  StoryFlowIntegrations.chooseOutputDirectory = async (...args) => {
    const result = await baseChooseOutputDirectory(...args);
    const needsMigration = state.platformPresetVersion !== PRESET_VERSION;
    normalizePlatformState({ migrate: true });
    refreshPlatformSurfaces();
    if (needsMigration) saveState('平台預設已建立');
    return result;
  };

  document.getElementById('openSettingsBtn')?.addEventListener('click', () => setTimeout(refreshPlatformSurfaces, 0));
  document.getElementById('settingsNav')?.addEventListener('click', () => setTimeout(refreshPlatformSurfaces, 0));

  refreshPlatformSurfaces();
})();