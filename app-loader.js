// Build-free classic-script manifest.
//
// StoryFlow's feature modules intentionally share top-level lexical bindings, so they
// cannot be converted to ES modules one file at a time. Keeping the parser-blocking
// order here makes that dependency explicit without hiding it in one long HTML line.
(function () {
  const scripts = [
    { src: './config.js?v=20260817-1625', owner: 'core' },
    { src: './src/persistence/integrations.js?v=20260824-p0', owner: 'persistence' },
    { src: './app.js?v=20260824-flow2', owner: 'core' },
    { src: './src/connection/session-auth.js?v=20260817-1522', owner: 'connection' },
    { src: './src/connection/folder-session.js', owner: 'connection' },
    { src: './ui-bootstrap.js?v=20260818-1548', owner: 'ui' },
    { src: './patches.js', owner: 'legacy-bridge' },
    { src: './src/persistence/settings-sync.js?v=20260824-p0', owner: 'persistence' },
    { src: './src/persistence/workspace-safety.js?v=20260824-p0', owner: 'persistence' },
    { src: './smart-split-ui.js?v=20260818-1321', owner: 'split' },
    { src: './platform-lock.js', owner: 'publishing' },
    { src: './source-flow.js?v=20260824-flow2', owner: 'source' },
    { src: './projects.js?v=20260819-1405', owner: 'projects' },
    { src: './boundary-v2.js?v=20260818-1636', owner: 'split' },
    { src: './publishing-flow.js?v=20260824-flow2', owner: 'publishing' },
    { id: 'storyflowPublishingDisclosureButtonV1Js', src: './publishing-disclosure-button-v1.js?v=20260818-1836', owner: 'publishing' },
    { src: './publishing-project-switcher.js?v=20260818-1800', owner: 'publishing' },
    { id: 'storyflowPublishingGroupingV1Js', src: './publishing-grouping-v1.js?v=20260818-1816', owner: 'publishing' },
    { id: 'storyflowPublishingProjectFilterV1Js', src: './publishing-project-filter-v1.js?v=20260824-flow2', owner: 'publishing' },
    { src: './app-ux.js', owner: 'ui' },
    { src: './source-relink.js?v=20260817-1117', owner: 'source' },
    { src: './project-source-sync.js?v=20260817-1315', owner: 'source', attributes: { 'data-storyflow-project-source-sync': '' } },
    { src: './src/connection/connection-ui.js?v=20260824-flow2', owner: 'connection' },
    { src: './src/connection/logout-unload-settings.js?v=20260824-privacy', owner: 'connection' },
    { src: './src/settings/settings-page.js?v=20260824-p1b', owner: 'settings' },
    { id: 'storyflowPlatformSettingsV2Js', src: './src/settings/platform-settings-v2.js?v=20260817-1632', owner: 'settings' },
    { id: 'storyflowSettingsBootstrapJs', src: './src/settings/settings-bootstrap.js?v=20260817-1703', owner: 'settings' },
    { id: 'storyflowSettingsFileImportFixJs', src: './src/settings/settings-file-import-fix.js?v=20260817-1720', owner: 'settings' },
    { src: './navigation.js?v=20260824-flow2', owner: 'ui' },
    { src: './confirm-continuation.js', owner: 'split' },
    { src: './preview-mode.js?v=20260817-1405', owner: 'ui' },
    { src: './src/connection/auth-consistency-fix.js?v=20260817-1710', owner: 'connection' },
    { src: './src/connection/mobile-google-auth.js?v=20260817-1858', owner: 'connection' },
    { src: './workspace-ux-refine.js?v=20260818-1055', owner: 'ui' },
    { src: './ui-system-v4.js?v=20260820-0005', owner: 'ui' },
    { id: 'storyflowProjectPersistenceGuardJs', src: './src/persistence/project-persistence-guard.js?v=20260824-p0', owner: 'persistence' },
    { id: 'storyflowProjectSourceModeV2Js', src: './project-source-mode-v2.js?v=20260818-1438', owner: 'source' },
    { id: 'storyflowSourceArticleUxV2Js', src: './source-article-ux-v2.js?v=20260818-1504', owner: 'source' },
    { id: 'storyflowChapterManagementV2Js', src: './chapter-management-v2.js?v=20260818-1538', owner: 'projects' },
    { id: 'storyflowManualChapterEditV1Js', src: './manual-chapter-edit-v1.js?v=20260819-1425', owner: 'projects' },
    { id: 'storyflowSmartSplitPreferenceLiveV1Js', src: './smart-split-preference-live-v1.js?v=20260818-1618', owner: 'split' },
    { id: 'storyflowSmartSplitTitleRuleV2Js', src: './smart-split-title-rule-v2.js?v=20260818-1636', owner: 'split' },
    { id: 'storyflowProjectProgressBadgesV1Js', src: './project-progress-badges-v1.js?v=20260818-1752', owner: 'projects' },
    { id: 'storyflowWorksLibraryUxV2Js', src: './works-library-ux-v2.js?v=20260818-1752', owner: 'projects' },
    { src: './quick-switch-new-project-fix.js?v=20260819-0138', owner: 'projects' }
  ];

  window.StoryFlowAssetManifest = Object.freeze(scripts.map(entry => Object.freeze({ ...entry })));

  function attributes(entry) {
    const values = [];
    if (entry.id) values.push(`id="${entry.id}"`);
    values.push(`src="${entry.src}"`);
    values.push(`data-storyflow-owner="${entry.owner}"`);
    Object.entries(entry.attributes || {}).forEach(([name, value]) => values.push(`${name}="${value}"`));
    return values.join(' ');
  }

  if (document.readyState === 'loading') {
    document.write(scripts.map(entry => `<script ${attributes(entry)}><\/script>`).join(''));
    return;
  }

  // Development/test fallback when the loader itself is injected after parsing.
  (async () => {
    for (const entry of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        if (entry.id) script.id = entry.id;
        script.src = entry.src;
        script.async = false;
        script.dataset.storyflowOwner = entry.owner;
        Object.entries(entry.attributes || {}).forEach(([name, value]) => script.setAttribute(name, value));
        script.onload = resolve;
        script.onerror = () => reject(new Error(`StoryFlow 無法載入 ${entry.src}`));
        document.body.appendChild(script);
      });
    }
  })().catch(error => {
    console.error(error);
    document.body.dataset.storyflowLoadError = 'true';
  });
})();
