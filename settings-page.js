// Settings is a full app view, not a modal. Primary content navigation stays focused
// on Workspace / Works / Publishing; settings lives with the persistent connection
// utilities in the lower-left sidebar.
(function () {
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
    button.setAttribute('aria-label', '設定');
    button.innerHTML = '<span aria-hidden="true">⚙</span><span class="sidebar-settings-label">設定</span>';
    utilities.appendChild(button);

    if (logout) utilities.appendChild(logout);
    button.addEventListener('click', () => window.StoryFlowNavigate?.('settings'));
  }

  function showSettings({ focusPicker = false } = {}) {
    ensureSettingsView();
    try {
      document.getElementById('pickerApiKeyInput').value = StoryFlowIntegrations.pickerApiKey();
      window.renderFormattingSettings?.();
    } catch (_) {}
    window.StoryFlowNavigate?.('settings');
    if (focusPicker) requestAnimationFrame(() => document.getElementById('pickerApiKeyInput')?.focus());
  }

  ensureSettingsView();
  ensureSidebarSettingsButton();

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
})();
