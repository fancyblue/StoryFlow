// Build-free classic-script manifest.
//
// StoryFlow's feature modules intentionally share top-level lexical bindings, so they
// cannot be converted to ES modules one file at a time. Keeping the parser-blocking
// order here makes that dependency explicit without hiding it in one long HTML line.
(function () {
  const scripts = [
    { src: './src/core/config.js?v=20260817-1625', owner: 'core' },
    { src: './src/persistence/integrations.js?v=20260825-p2c', owner: 'persistence' },
    { src: './src/core/app.js?v=20260825-p1e', owner: 'core' },
    { src: './src/connection/session-auth.js?v=20260817-1522', owner: 'connection' },
    { src: './src/connection/folder-session.js?v=20260825-p1e', owner: 'connection' },
    { src: './src/ui/ui-bootstrap.js?v=20260824-p1c', owner: 'ui' },
    { src: './src/ui/workspace-interactions.js?v=20260825-p2b', owner: 'ui' },
    { src: './src/persistence/settings-sync.js?v=20260825-p2c', owner: 'persistence' },
    { src: './src/persistence/workspace-safety.js?v=20260824-p0', owner: 'persistence' },
    { src: './src/split/smart-split-ui.js?v=20260818-1321', owner: 'split' },
    { src: './src/publishing/platform-lock.js', owner: 'publishing' },
    { src: './src/source/source-diff.js?v=20260825-p1', owner: 'source' },
    { src: './src/source/source-sync-history.js?v=20260825-p1', owner: 'source' },
    { src: './src/source/source-flow.js?v=20260825-p2d', owner: 'source' },
    { src: './src/projects/projects.js?v=20260825-p2d', owner: 'projects' },
    { src: './src/split/boundary-engine.js?v=20260825-p2b', owner: 'split' },
    { src: './src/publishing/publishing-flow.js?v=20260824-flow2', owner: 'publishing' },
    { id: 'storyflowPublishingDisclosureJs', src: './src/publishing/publishing-disclosure.js?v=20260825-p2b', owner: 'publishing' },
    { src: './src/publishing/publishing-project-switcher.js?v=20260818-1800', owner: 'publishing' },
    { id: 'storyflowPublishingGroupingJs', src: './src/publishing/publishing-grouping.js?v=20260825-p2b', owner: 'publishing' },
    { id: 'storyflowPublishingProjectFilterJs', src: './src/publishing/publishing-project-filter.js?v=20260825-p2b', owner: 'publishing' },
    { src: './src/ui/app-ux.js?v=20260825-p2d', owner: 'ui' },
    { src: './src/source/source-relink.js?v=20260817-1117', owner: 'source' },
    { src: './src/connection/connection-ui.js?v=20260824-flow2', owner: 'connection' },
    { src: './src/connection/logout-unload-settings.js?v=20260825-p1f', owner: 'connection' },
    { src: './src/settings/settings-page.js?v=20260824-p1b', owner: 'settings' },
    { id: 'storyflowPlatformSettingsJs', src: './src/settings/platform-settings.js?v=20260825-p2b', owner: 'settings' },
    { id: 'storyflowSettingsBootstrapJs', src: './src/settings/settings-bootstrap.js?v=20260817-1703', owner: 'settings' },
    { id: 'storyflowSettingsFileImportJs', src: './src/settings/settings-file-import.js?v=20260825-p2b', owner: 'settings' },
    { id: 'storyflowBackupCenterJs', src: './src/settings/backup-center.js?v=20260825-p2c', owner: 'settings' },
    { id: 'storyflowQuickStartJs', src: './src/connection/quick-start.js?v=20260825-p1e', owner: 'connection' },
    { src: './src/ui/navigation.js?v=20260824-p1c2', owner: 'ui' },
    { src: './src/split/confirm-continuation.js', owner: 'split' },
    { src: './src/ui/preview-mode.js?v=20260817-1405', owner: 'ui' },
    { src: './src/connection/google-auth.js?v=20260825-p2b', owner: 'connection' },
    { src: './src/connection/mobile-google-auth.js?v=20260817-1858', owner: 'connection' },
    { src: './src/ui/workspace-ux.js?v=20260825-p2b', owner: 'ui' },
    { src: './src/ui/ui-system.js?v=20260825-p2b', owner: 'ui' },
    { id: 'storyflowPublishingDeleteJs', src: './src/publishing/publishing-delete.js?v=20260825-p2d', owner: 'publishing' },
    { id: 'storyflowProjectPersistenceGuardJs', src: './src/persistence/project-persistence-guard.js?v=20260825-p2d', owner: 'persistence' },
    { id: 'storyflowProjectSourceSyncJs', src: './src/source/project-source-sync.js?v=20260825-p2a', owner: 'source', attributes: { 'data-storyflow-project-source-sync': '' } },
    { id: 'storyflowSourceArticleUxJs', src: './src/source/source-article-ux.js?v=20260825-p2b', owner: 'source' },
    { id: 'storyflowChapterManagementJs', src: './src/projects/chapter-management.js?v=20260825-p2b', owner: 'projects' },
    { id: 'storyflowManualChapterEditJs', src: './src/projects/manual-chapter-edit.js?v=20260825-p2b', owner: 'projects' },
    { id: 'storyflowSmartSplitPreferencesJs', src: './src/split/smart-split-preferences.js?v=20260825-p2b', owner: 'split' },
    { id: 'storyflowSmartSplitTitleJs', src: './src/split/smart-split-title.js?v=20260825-p2b', owner: 'split' },
    { id: 'storyflowWorksLibraryUxJs', src: './src/projects/works-library-ux.js?v=20260825-p2b', owner: 'projects' },
    { src: './src/projects/workspace-project-ux.js?v=20260825-p2b', owner: 'projects' }
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
