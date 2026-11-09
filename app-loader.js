// Build-free classic-script manifest.
//
// StoryFlow's feature modules intentionally share top-level lexical bindings, so they
// cannot be converted to ES modules one file at a time. Keeping the parser-blocking
// order here makes that dependency explicit without hiding it in one long HTML line.
(function () {
  const scripts = [
    { src: './src/core/shared.js?v=20261108-a4', owner: 'core' },
    { src: './src/core/config.js?v=20261104-a3', owner: 'core' },
    { src: './src/projects/content-model.js?v=20261106-a1', owner: 'projects' },
    { src: './src/persistence/integrations.js?v=20261109-a5', owner: 'persistence' },
    { id: 'storyflowFolderAssetsJs', src: './src/persistence/folder-assets.js?v=20261106-a1', owner: 'persistence' },
    { src: './src/source/google-docs.js?v=20261104-a9', owner: 'source' },
    { src: './src/core/app.js?v=20261109-a5', owner: 'core' },
    { src: './src/core/render-pipeline.js?v=20260925-a5', owner: 'core' },
    { src: './src/connection/session-auth.js?v=20261104-a9', owner: 'connection' },
    { src: './src/connection/folder-session.js?v=20260825-p1e', owner: 'connection' },
    { src: './src/ui/ui-bootstrap.js?v=20260824-p1c', owner: 'ui' },
    { src: './src/ui/workspace-interactions.js?v=20261016-a2', owner: 'ui' },
    { src: './src/persistence/settings-sync.js?v=20261108-a4', owner: 'persistence' },
    { src: './src/persistence/workspace-safety.js?v=20261016-a7', owner: 'persistence' },
    { src: './src/split/smart-split-ui.js?v=20261016-a9', owner: 'split' },
    { src: './src/publishing/platform-lock.js?v=20260925-a5', owner: 'publishing' },
    { src: './src/source/source-diff.js?v=20261104-a12', owner: 'source' },
    { src: './src/source/source-sync-history.js?v=20260825-p1', owner: 'source' },
    { src: './src/source/source-flow.js?v=20261017-a7', owner: 'source' },
    { src: './src/projects/projects.js?v=20261103-a12', owner: 'projects' },
    { src: './src/split/boundary-engine.js?v=20260925-a5', owner: 'split' },
    { src: './src/publishing/publishing-output.js?v=20261106-a1', owner: 'publishing' },
    { id: 'storyflowPublishingPreviewJs', src: './src/publishing/publishing-preview.js?v=20261108-a6', owner: 'publishing' },
    { id: 'storyflowPublishingLightboxJs', src: './src/publishing/publishing-lightbox.js?v=20261108-a2', owner: 'publishing' },
    { src: './src/publishing/publishing-flow.js?v=20261109-a6', owner: 'publishing' },
    { id: 'storyflowPublishingDisclosureJs', src: './src/publishing/publishing-disclosure.js?v=20260925-a5', owner: 'publishing' },
    { src: './src/publishing/publishing-project-switcher.js?v=20260925-a5', owner: 'publishing' },
    { id: 'storyflowPublishingProjectFilterJs', src: './src/publishing/publishing-project-filter.js?v=20261103-a5', owner: 'publishing' },
    { src: './src/ui/anchored-menu.js?v=20261103-a12', owner: 'ui' },
    { src: './src/ui/app-ux.js?v=20261107-a4', owner: 'ui' },
    { src: './src/source/source-relink.js?v=20261016-a7', owner: 'source' },
    { src: './src/connection/connection-ui.js?v=20261016-a11', owner: 'connection' },
    { src: './src/connection/logout-unload-settings.js?v=20261016-a7', owner: 'connection' },
    { src: './src/settings/settings-page.js?v=20261016-a12', owner: 'settings' },
    { id: 'storyflowPlatformSettingsJs', src: './src/settings/platform-settings.js?v=20261106-a1', owner: 'settings' },
    { id: 'storyflowSettingsBootstrapJs', src: './src/settings/settings-bootstrap.js?v=20260905-p51a', owner: 'settings' },
    { id: 'storyflowSettingsFileImportJs', src: './src/settings/settings-file-import.js?v=20260825-p2b', owner: 'settings' },
    { id: 'storyflowBackupCenterJs', src: './src/settings/backup-center.js?v=20260924-a1', owner: 'settings' },
    { id: 'storyflowQuickStartJs', src: './src/connection/quick-start.js?v=20261016-a7', owner: 'connection' },
    { src: './src/ui/navigation.js?v=20261107-a4', owner: 'ui' },
    { src: './src/split/confirm-continuation.js?v=20261103-a1', owner: 'split' },
    { src: './src/ui/preview-mode.js?v=20261104-a12', owner: 'ui' },
    { src: './src/ui/reading-settings.js?v=20261016-a16', owner: 'ui' },
    { src: './src/ui/rail-resize.js?v=20261016-a18', owner: 'ui' },
    { src: './src/connection/google-auth.js?v=20260825-p2b', owner: 'connection' },
    { src: './src/connection/mobile-google-auth.js?v=20260817-1858', owner: 'connection' },
    { src: './src/ui/workspace-ux.js?v=20261107-a5', owner: 'ui' },
    { src: './src/ui/ui-system.js?v=20260924-a1', owner: 'ui' },
    { id: 'storyflowPublishingDeleteJs', src: './src/publishing/publishing-delete.js?v=20261017-a10', owner: 'publishing' },
    { id: 'storyflowProjectPersistenceGuardJs', src: './src/persistence/project-persistence-guard.js?v=20261108-a4', owner: 'persistence' },
    { id: 'storyflowMobileSafeModeJs', src: './src/persistence/mobile-safe-mode.js?v=20261109-a2', owner: 'persistence' },
    { id: 'storyflowProjectSourceSyncJs', src: './src/source/project-source-sync.js?v=20261104-a12', owner: 'source', attributes: { 'data-storyflow-project-source-sync': '' } },
    { id: 'storyflowSourceArticleUxJs', src: './src/source/source-article-ux.js?v=20260925-a5', owner: 'source' },
    { id: 'storyflowChapterManagementJs', src: './src/projects/chapter-management.js?v=20261103-a12', owner: 'projects' },
    { id: 'storyflowManualChapterEditJs', src: './src/projects/manual-chapter-edit.js?v=20261103-a8', owner: 'projects' },
    { id: 'storyflowSmartSplitPreferencesJs', src: './src/split/smart-split-preferences.js?v=20260825-p2b', owner: 'split' },
    { id: 'storyflowSmartSplitTitleJs', src: './src/split/smart-split-title.js?v=20260925-a5', owner: 'split' },
    { id: 'storyflowWorksLibraryUxJs', src: './src/projects/works-library-ux.js?v=20261107-a4', owner: 'projects' },
    { src: './src/projects/workspace-project-ux.js?v=20261016-a16', owner: 'projects' },
    { id: 'storyflowGlobalSearchJs', src: './src/ui/global-search.js?v=20261106-a1', owner: 'ui' },
    { id: 'storyflowArticleImagesJs', src: './src/publishing/article-images.js?v=20261016-a7', owner: 'publishing' },
    { id: 'storyflowVisualPhotoCacheJs', src: './src/projects/visual-photo-cache.js?v=20261104-a12', owner: 'projects' },
    { id: 'storyflowVisualFolderBrowserJs', src: './src/projects/visual-folder-browser.js?v=20261104-a12', owner: 'projects' },
    { id: 'storyflowVisualWorkspaceJs', src: './src/projects/visual-workspace.js?v=20261109-a2', owner: 'projects' }
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

  // index.html marks <html> as booting so the workbench it contains is not painted before
  // the landing view replaces it (styles/layers/foundation.css). The written scripts are
  // parser-blocking, so DOMContentLoaded follows the last of them, failed ones included.
  function finishBooting() {
    document.documentElement.classList.remove('storyflow-booting');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', finishBooting, { once: true });
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
  }).finally(finishBooting);
})();
