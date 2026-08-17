// Settings is a full app view, not a modal. Primary content navigation stays focused
// on Workspace / Works / Publishing; settings lives with the persistent connection
// utilities in the lower-left sidebar.
(function () {
  function loadStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    document.body.appendChild(script);
  }

  // Keep late-loaded theme layers deterministic. Component CSS comes first,
  // then the desktop/mobile theme, and the final workspace UX layer stays last.
  function ensureThemeOrder() {
    const theme = document.getElementById('storyflowBlueThemeCss');
    const mobile = document.getElementById('storyflowMobileVisualPolishCss');
    const workspaceUx = document.getElementById('storyflowWorkspaceUxRefineCss');
    if (theme && theme.parentElement === document.head) document.head.appendChild(theme);
    if (mobile && mobile.parentElement === document.head) document.head.appendChild(mobile);
    if (workspaceUx && workspaceUx.parentElement === document.head) document.head.appendChild(workspaceUx);
  }

  function loadLateUiAssets() {
    loadStylesheet('storyflowPlatformSettingsV2Css', './platform-settings-v2.css?v=20260817-1632');
    loadStylesheet('storyflowControlPolishCss', './control-polish.css?v=20260817-1632');
    loadStylesheet('storyflowSettingsBootstrapCss', './settings-bootstrap.css?v=20260817-1703');
    loadStylesheet('storyflowNavigationUtilityPolishCss', './navigation-utility-polish.css?v=20260817-1902');
    loadStylesheet('storyflowMobileBottomNavFixCss', './mobile-bottom-nav-fix.css?v=20260817-2130');
    loadScript('storyflowPlatformSettingsV2Js', './platform-settings-v2.js?v=20260817-1632');
    loadScript('storyflowSettingsBootstrapJs', './settings-bootstrap.js?v=20260817-1703');
    loadScript('storyflowSettingsFileImportFixJs', './settings-file-import-fix.js?v=20260817-1720');
    ensureThemeOrder();
  }

  function ensureSettingsView() {
    const main = document.querySelector('.main');
    const dialog = document.getElementById('settingsDialog');
    if (!main || !dialog) return null;

    let view = document.getElementById('settingsView');
    if (!view) {
      view = document.createElement('section');
      view.id = 'settingsView';
      view.className = 'app-view settings-view';
      view.hidden = true;
      view.innerHTML = `
        <header class="settings-page-head">
          <div>
            <p class="eyebrow">STORYFLOW / SETTINGS</p>
            <h1>設定</h1>
            <p class="settings-page-subtitle">管理 Google Docs、StoryFlow 資料夾、發布平台與排版。</p>
          </div>
        </header>`;
      main.appendChild(view);
    }

    if (dialog.parentElement !== view) view.appendChild(dialog);
    dialog.classList.add('settings-page-dialog');
    dialog.setAttribute('open', '');

    const form = dialog.querySelector('.settings-dialog');
    form?.classList.add('settings-page-form');
    const oldHead = form?.querySelector(':scope > .panel-head');
    oldHead?.remove();

    return view;
  }

  function ensureSidebarSettingsButton() {
    const status = document.getElementById('sidebarConnectionStatus');
    if (!status || document.getElementById('sidebarSettingsBtn')) return;

    let utilities = status.querySelector('.sidebar-utility-actions');
    const logout = document.getElementById('sidebarLogoutBtn');
    if (!utilities) {
      utilities = document.createElement('div');
      utilities.className = 'sidebar-utility-actions';
      status.appendChild(utilities);
    }

    const button = document.createElement('button');
    button.id = 'sidebarSettingsBtn';
    button.className = 'sidebar-settings-button';
    button.type = 'button';
    button.title = '設定';
    button.dataset.hint = '設定';
    button.setAttribute('aria-label', '設定');
    button.innerHTML = '<span aria-hidden="true">⚙</span><span class="sidebar-settings-label">設定</span>';
    utilities.appendChild(button);

    if (logout) {
      logout.dataset.hint = '登出並清除連線';
      logout.setAttribute('aria-label', '登出並清除連線');
      utilities.appendChild(logout);
    }
    button.addEventListener('click', () => window.StoryFlowNavigate?.('settings'));
  }

  function hasLoadedIntegrationSettings() {
    if (String(window.STORYFLOW_CONFIG?.googleClientId || '').trim()) return true;
    try {
      return Boolean(sessionStorage.getItem('storyflow.integration-bootstrap.v1'));
    } catch (_) {
      return false;
    }
  }

  function hasConnectedFolder() {
    return Boolean(document.getElementById('folderDot')?.classList.contains('connected'));
  }

  function syncSettingsAvailability() {
    const publishingSection = document.getElementById('defaultIndent')?.closest('.settings-section')
      || document.getElementById('platformFormatSettings')?.closest('.settings-section');
    const securityNote = document.querySelector('#settingsDialog .security-note');
    const readyForAdvancedSettings = hasLoadedIntegrationSettings() || hasConnectedFolder();

    // First-run settings should focus only on the two prerequisites: load/import
    // Google integration settings and connect the StoryFlow folder. Publishing
    // platform/format controls become relevant only after either source is available.
    if (publishingSection) publishingSection.hidden = !readyForAdvancedSettings;
    if (securityNote) securityNote.hidden = !readyForAdvancedSettings;
  }

  function showSettings({ focusPicker = false } = {}) {
    ensureSettingsView();
    try {
      document.getElementById('pickerApiKeyInput').value = StoryFlowIntegrations.pickerApiKey();
      window.renderFormattingSettings?.();
      window.StoryFlowSettingsBootstrap?.sync?.();
    } catch (_) {}
    syncSettingsAvailability();
    ensureThemeOrder();
    window.StoryFlowNavigate?.('settings');
    if (focusPicker) requestAnimationFrame(() => document.getElementById('pickerApiKeyInput')?.focus());
  }

  ensureSettingsView();
  ensureSidebarSettingsButton();
  loadLateUiAssets();
  syncSettingsAvailability();

  window.addEventListener('storyflow:connection-changed', syncSettingsAvailability);
  window.addEventListener('storyflow:integration-config-changed', syncSettingsAvailability);

  // Keep legacy callers working (for example, trying to load Google Docs before a
  // Picker API key has been configured), but route them to the settings page.
  window.openSettings = function openSettingsPage() {
    showSettings({ focusPicker: true });
  };

  const legacyNav = document.getElementById('settingsNav');
  if (legacyNav) {
    legacyNav.hidden = true;
    legacyNav.onclick = event => {
      event?.preventDefault?.();
      showSettings();
    };
  }

  const legacySettingsButton = document.getElementById('openSettingsBtn');
  if (legacySettingsButton) legacySettingsButton.onclick = () => showSettings();

  window.StoryFlowShowSettings = showSettings;
  window.StoryFlowSyncSettingsAvailability = syncSettingsAvailability;
})();
