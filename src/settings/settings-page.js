// Settings is a full app view, not a modal. Primary content navigation stays focused
// on Workspace / Works / Publishing; settings lives with the persistent connection
// utilities in the lower-left sidebar.
(function () {
  // Keep the final theme layers deterministic after settings creates its app view.
  function ensureThemeOrder() {
    const theme = document.getElementById('storyflowBlueThemeCss');
    const mobile = document.getElementById('storyflowMobileVisualPolishCss');
    const workspaceUx = document.getElementById('storyflowWorkspaceUxCss');
    const connectionStatus = document.getElementById('storyflowConnectionStatusCss');
    const uiSystem = document.getElementById('storyflowUiSystemCss');
    const layoutIntegrity = document.getElementById('storyflowUiLayoutIntegrityCss');
    const desktopResponsive = document.getElementById('storyflowDesktopResponsiveCss');
    if (theme && theme.parentElement === document.head) document.head.appendChild(theme);
    if (mobile && mobile.parentElement === document.head) document.head.appendChild(mobile);
    if (workspaceUx && workspaceUx.parentElement === document.head) document.head.appendChild(workspaceUx);
    if (connectionStatus && connectionStatus.parentElement === document.head) document.head.appendChild(connectionStatus);
    if (uiSystem && uiSystem.parentElement === document.head) document.head.appendChild(uiSystem);
    if (layoutIntegrity && layoutIntegrity.parentElement === document.head) document.head.appendChild(layoutIntegrity);
    if (desktopResponsive && desktopResponsive.parentElement === document.head) document.head.appendChild(desktopResponsive);
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
            <h1 id="settingsViewHeading">設定</h1>
            <p class="settings-page-subtitle">管理 Google Docs、StoryFlow 資料夾、發布平台與排版。</p>
          </div>
        </header>`;
      main.appendChild(view);
    }

    if (dialog.parentElement !== view) view.appendChild(dialog);
    dialog.classList.add('settings-page-dialog');
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', 'region');
    dialog.setAttribute('aria-labelledby', 'settingsViewHeading');

    const form = dialog.querySelector('.settings-dialog');
    form?.classList.add('settings-page-form');
    const oldHead = form?.querySelector(':scope > .panel-head');
    oldHead?.remove();

    if (!document.getElementById('storyflowDevicePrivacySection')) {
      const privacy = document.createElement('section');
      privacy.id = 'storyflowDevicePrivacySection';
      privacy.className = 'settings-device-privacy';
      privacy.innerHTML = `
        <div>
          <strong>裝置與隱私</strong>
          <p>清除這個瀏覽器中的 Google 登入、暫存設定與資料夾連線。StoryFlow 資料夾內的作品與設定檔不會被刪除。</p>
        </div>
        <button id="settingsLeaveDeviceBtn" class="button danger" type="button">離開此裝置</button>`;
      privacy.querySelector('#settingsLeaveDeviceBtn').addEventListener('click', () => {
        window.StoryFlowLogout?.leaveDevice?.();
      });
      view.appendChild(privacy);
    }

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
      logout.dataset.hint = '離開此裝置';
      logout.setAttribute('aria-label', '離開此裝置');
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
  ensureThemeOrder();
  syncSettingsAvailability();

  window.addEventListener('storyflow:connection-changed', syncSettingsAvailability);
  window.addEventListener('storyflow:integration-config-changed', syncSettingsAvailability);

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
