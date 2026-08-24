// Leaving this device is a local privacy reset, not a destructive data operation.
// It unloads browser-held StoryFlow state and forgets the folder handle, but never
// rewrites or deletes settings.json, workspace.json, or Markdown files.
(function () {
  const KEYS = [
    'storyflow.google.session.v1',
    'storyflow.google.access-token.v1',
    'storyflow.google.access-token.expires.v1',
    'storyflow.folder.session.v1',
    'storyflow.integration-bootstrap.v1'
  ];
  const CONNECTION_DB = 'storyflow-connections-v1';
  const LEGACY_CONNECTION_DB = 'storyflow-handles';
  const LEFT_QUERY_KEY = 'storyflow-left';
  let loggingOut = false;

  function integrationsApi() {
    return typeof StoryFlowIntegrations !== 'undefined'
      ? StoryFlowIntegrations
      : window.StoryFlowIntegrations;
  }

  function removeStoryFlowStorage(storage) {
    try {
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith('storyflow.')) keys.push(key);
      }
      keys.forEach(key => storage.removeItem(key));
    } catch (_) {}
  }

  function clearBrowserState() {
    try { window.StoryFlowSessionAuth?.forgetSession?.(); } catch (_) {}
    try { KEYS.forEach(key => sessionStorage.removeItem(key)); } catch (_) {}
    removeStoryFlowStorage(sessionStorage);
    removeStoryFlowStorage(localStorage);

    // Clear only the currently loaded in-memory integration values. Do NOT persist
    // these empty values back to settings.json.
    try {
      if (window.STORYFLOW_CONFIG) {
        window.STORYFLOW_CONFIG.googleClientId = null;
        window.STORYFLOW_CONFIG.googleProjectNumber = null;
      }
    } catch (_) {}
    try { integrationsApi()?.setPickerApiKey?.(''); } catch (_) {}
  }

  function deleteDatabase(name) {
    if (!('indexedDB' in window)) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = finish;
        request.onerror = finish;
        request.onblocked = finish;
        window.setTimeout(finish, 1200);
      } catch (_) {
        finish();
      }
    });
  }

  function recoveryUrl() {
    const url = new URL(location.href);
    url.searchParams.set(LEFT_QUERY_KEY, '1');
    url.hash = '';
    return url.href;
  }

  function clearRecoveryMarker() {
    const url = new URL(location.href);
    url.searchParams.delete(LEFT_QUERY_KEY);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function waitForSettingsBootstrap(timeout = 4000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.StoryFlowSettingsBootstrap?.importSettingsFile) {
          resolve(window.StoryFlowSettingsBootstrap);
          return;
        }
        if (Date.now() - started >= timeout) {
          reject(new Error('設定載入元件尚未準備完成，請稍後再試。'));
          return;
        }
        window.setTimeout(check, 80);
      };
      check();
    });
  }

  function dismissRecovery(dialog, destination = 'workspace') {
    clearRecoveryMarker();
    dialog.close();
    dialog.remove();
    window.StoryFlowNavigate?.(destination);
  }

  function showRecoveryScreen() {
    if (new URL(location.href).searchParams.get(LEFT_QUERY_KEY) !== '1') return;
    if (document.getElementById('storyflowRecoveryDialog')) return;

    const dialog = document.createElement('dialog');
    dialog.id = 'storyflowRecoveryDialog';
    dialog.className = 'storyflow-recovery-dialog';
    dialog.innerHTML = `
      <div class="storyflow-recovery-card">
        <div class="storyflow-recovery-mark" aria-hidden="true">S</div>
        <p class="eyebrow">DEVICE PRIVACY</p>
        <h1>已離開此裝置</h1>
        <p>這個瀏覽器中的 Google 登入、暫存設定與 StoryFlow 資料夾連線已清除。資料夾內的作品與設定檔仍完整保留。</p>
        <div class="storyflow-recovery-actions">
          <button id="reconnectStoryFlowFolderBtn" class="button primary" type="button">重新連接 StoryFlow 資料夾</button>
          <button id="reimportStoryFlowSettingsBtn" class="button ghost" type="button">匯入 settings.json</button>
          <button id="openManualStoryFlowSettingsBtn" class="button quiet" type="button">改用手動設定</button>
        </div>
        <p id="storyflowRecoveryStatus" class="storyflow-recovery-status" role="status" aria-live="polite"></p>
        <input id="storyflowRecoveryFileInput" type="file" accept="application/json,.json" hidden />
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', event => event.preventDefault());

    const status = dialog.querySelector('#storyflowRecoveryStatus');
    dialog.querySelector('#reconnectStoryFlowFolderBtn').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      status.textContent = '請選擇原本的 StoryFlow 資料夾。';
      try {
        const result = await window.StoryFlowFolderConnection?.choose?.({ reuseRemembered: true });
        if (!result) {
          button.disabled = false;
          return;
        }
        status.textContent = '工作區與設定已載入。';
        dismissRecovery(dialog, 'workspace');
      } catch (error) {
        button.disabled = false;
        if (error?.name !== 'AbortError') status.textContent = error.message;
      }
    });

    const fileInput = dialog.querySelector('#storyflowRecoveryFileInput');
    dialog.querySelector('#reimportStoryFlowSettingsBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      status.textContent = '正在載入設定…';
      try {
        const bootstrap = await waitForSettingsBootstrap();
        await bootstrap.importSettingsFile(file);
        dismissRecovery(dialog, 'settings');
      } catch (error) {
        status.textContent = error.message;
        fileInput.value = '';
      }
    });
    dialog.querySelector('#openManualStoryFlowSettingsBtn').addEventListener('click', () => {
      dismissRecovery(dialog, 'settings');
    });

    dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('#reconnectStoryFlowFolderBtn')?.focus());
  }

  async function leaveDevice() {
    if (loggingOut) return;
    const ok = window.confirm(
      '離開此裝置？\n\n' +
      '會清除這個瀏覽器中的 Google 登入、暫存設定與 StoryFlow 資料夾連線。\n' +
      '不會修改或刪除資料夾內的 settings.json、workspace.json 或 Markdown。'
    );
    if (!ok) return;

    loggingOut = true;
    clearBrowserState();
    await Promise.all([
      deleteDatabase(CONNECTION_DB),
      deleteDatabase(LEGACY_CONNECTION_DB)
    ]);
    location.replace(recoveryUrl());
  }

  // The legacy connection module attached direct click handlers to these buttons.
  // Capture first so logout semantics stay non-destructive and settings bootstrap is
  // definitely unloaded before the older handler can run.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#storyflowLogoutBtn,#sidebarLogoutBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    leaveDevice();
  }, true);

  function updateLogoutCopy() {
    const sidebar = document.getElementById('sidebarLogoutBtn');
    if (sidebar) {
      sidebar.title = '離開此裝置';
      sidebar.dataset.hint = '離開此裝置';
      sidebar.setAttribute('aria-label', '離開此裝置');
      const label = sidebar.querySelector('.sidebar-logout-label');
      if (label && label.textContent !== '離開此裝置') label.textContent = '離開此裝置';
    }
    const top = document.getElementById('storyflowLogoutBtn');
    if (top) {
      top.title = '離開此裝置';
      top.setAttribute('aria-label', '離開此裝置');
      top.textContent = '離開';
    }
  }

  // IMPORTANT: do not observe the whole document here. The previous implementation
  // used a subtree MutationObserver and rewrote textContent inside its own callback.
  // That generated another childList mutation, which could loop continuously and
  // consume a mobile CPU core while Google/session restoration was trying to run.
  // The logout controls are created before this script; settings-page runs next and
  // may adjust their copy once, so a zero-delay follow-up is sufficient.
  updateLogoutCopy();
  window.setTimeout(updateLogoutCopy, 0);
  window.setTimeout(showRecoveryScreen, 0);
  window.addEventListener('storyflow:view-changed', updateLogoutCopy);

  window.StoryFlowLogout = { logout: leaveDevice, leaveDevice, clearSessionState: clearBrowserState };
})();
