// Publishing platform preset: keep every platform selector consistent.
(function () {
  const FIXED_PLATFORMS = ['巴哈小屋', '方格子'];
  const PRESET_VERSION = 1;

  function defaultConfig() {
    return {
      indent: 'inherit',
      paragraphSpacing: state.formatting?.defaultParagraphSpacing ?? true,
      sceneSeparator: state.formatting?.defaultSceneSeparator ?? true
    };
  }

  function normalizePlatformState({ migrate = false } = {}) {
    state.formatting ||= structuredClone(defaultState.formatting);
    state.formatting.platforms ||= {};

    const firstMigration = migrate && state.platformPresetVersion !== PRESET_VERSION;
    const old = state.formatting.platforms;
    const next = {};

    for (const name of FIXED_PLATFORMS) {
      next[name] = firstMigration ? defaultConfig() : { ...defaultConfig(), ...(old[name] || {}) };
    }

    state.formatting.platforms = next;
    platforms.splice(0, platforms.length, ...FIXED_PLATFORMS);

    for (const chapter of state.chapters || []) {
      for (const part of chapter.parts || []) {
        const prior = part.platformStatus || {};
        part.platformStatus = Object.fromEntries(FIXED_PLATFORMS.map(name => [name, firstMigration ? false : Boolean(prior[name])]));
      }
    }

    if (firstMigration) state.platformPresetVersion = PRESET_VERSION;
  }

  function fillSelector(select) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    select.add(new Option('預設設定', ''));
    FIXED_PLATFORMS.forEach(name => select.add(new Option(name, name)));
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

  function cleanSettingsUI() {
    document.getElementById('platformManager')?.remove();
    const section = document.getElementById('platformFormatSettings')?.closest('.settings-section');
    const description = section?.querySelector('p');
    if (description) description.textContent = '發布格式固定為「預設設定、巴哈小屋、方格子」。可分別調整巴哈小屋與方格子的段首、段落空行與場景分隔符。';
  }

  function refreshPlatformSurfaces() {
    if (typeof renderFormattingSettings === 'function') renderFormattingSettings();
    if (typeof renderParts === 'function') renderParts();
    syncSelectors();
    bindSelectors();
    cleanSettingsUI();
  }

  // Normalize the fresh UI immediately, but do not mark the one-time Drive migration yet.
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

  // After a StoryFlow folder is loaded, clear legacy platform configuration exactly once.
  // The version marker is stored in workspace.json, so later visits preserve new edits.
  const baseChooseOutputDirectory = StoryFlowIntegrations.chooseOutputDirectory;
  StoryFlowIntegrations.chooseOutputDirectory = async (...args) => {
    const result = await baseChooseOutputDirectory(...args);
    const needsMigration = state.platformPresetVersion !== PRESET_VERSION;
    normalizePlatformState({ migrate: true });
    refreshPlatformSurfaces();
    if (needsMigration) saveState('平台設定已整理');
    return result;
  };

  document.getElementById('openSettingsBtn')?.addEventListener('click', () => setTimeout(cleanSettingsUI, 0));
  document.getElementById('settingsNav')?.addEventListener('click', () => setTimeout(cleanSettingsUI, 0));

  refreshPlatformSurfaces();
})();