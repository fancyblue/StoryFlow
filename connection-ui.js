// Compact connection UX: no dedicated status row. Workspace status lives in the
// upper-right actions, while the fixed sidebar mirrors it on every app view.
(function () {
  const GOOGLE_SESSION_KEY = 'storyflow.google.session.v1';
  const FOLDER_SESSION_KEY = 'storyflow.folder.session.v1';
  const CONNECTION_DB = 'storyflow-connections-v1';

  function originalGoogleStatus() { return document.getElementById('googleStatus'); }
  function originalFolderStatus() { return document.getElementById('folderStatus'); }
  function googleConnected() { return Boolean(StoryFlowIntegrations.hasGoogleToken?.()); }
  function folderConnected() { return Boolean(document.getElementById('folderDot')?.classList.contains('connected')); }
  function googleRestoring() { return /恢復/.test(originalGoogleStatus()?.textContent || ''); }

  function hasSessionHint(key) {
    try { return sessionStorage.getItem(key) === '1'; }
    catch (_) { return false; }
  }

  function ensureTopStatus() {
    const actions = document.querySelector('.top-actions');
    if (!actions || document.getElementById('topConnectionStatus')) return;

    const group = document.createElement('div');
    group.id = 'topConnectionStatus';
    group.className = 'top-connection-status';
    group.innerHTML = `
      <button id="topGoogleConnection" class="connection-chip" type="button">
        <span class="connection-chip-dot" aria-hidden="true"></span><span class="connection-chip-label">Google</span><strong class="connection-chip-state">登入</strong>
      </button>
      <button id="topFolderConnection" class="connection-chip" type="button">
        <span class="connection-chip-dot" aria-hidden="true"></span><span class="connection-chip-label">資料夾</span><strong class="connection-chip-state">連接</strong>
      </button>
      <button id="storyflowLogoutBtn" class="button tiny ghost connection-logout" type="button">登出</button>`;

    actions.insertBefore(group, actions.firstChild);

    group.querySelector('#topGoogleConnection').addEventListener('click', () => {
      if (googleConnected() || googleRestoring()) return;
      document.getElementById('googleLoginBtn')?.click();
    });
    group.querySelector('#topFolderConnection').addEventListener('click', () => {
      document.getElementById('folderBtn')?.click();
    });
    group.querySelector('#storyflowLogoutBtn').addEventListener('click', logoutStoryFlow);
  }

  function ensureSidebarStatus() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || document.getElementById('sidebarConnectionStatus')) return;
    const note = sidebar.querySelector('.sidebar-note');
    const block = document.createElement('div');
    block.id = 'sidebarConnectionStatus';
    block.className = 'sidebar-connection-status';
    block.innerHTML = `
      <strong class="sidebar-connection-title">連線狀態</strong>
      <button id="sidebarGoogleConnection" class="sidebar-connection-row" type="button" title="Google 登入狀態">
        <span class="sidebar-status-dot" aria-hidden="true"></span>
        <span class="sidebar-connection-copy"><b>Google</b><small>尚未登入</small></span>
      </button>
      <button id="sidebarFolderConnection" class="sidebar-connection-row" type="button" title="StoryFlow 資料夾狀態">
        <span class="sidebar-status-dot" aria-hidden="true"></span>
        <span class="sidebar-connection-copy"><b>資料夾</b><small>尚未連接</small></span>
      </button>
      <button id="sidebarLogoutBtn" class="sidebar-logout" type="button" title="登出並清除連線">
        <span aria-hidden="true">↪</span><span class="sidebar-logout-label">登出並清除連線</span>
      </button>`;
    if (note) note.insertAdjacentElement('afterend', block);
    else sidebar.appendChild(block);

    block.querySelector('#sidebarGoogleConnection').addEventListener('click', () => {
      if (googleConnected() || googleRestoring()) return;
      document.getElementById('googleLoginBtn')?.click();
    });
    block.querySelector('#sidebarFolderConnection').addEventListener('click', () => {
      document.getElementById('folderBtn')?.click();
    });
    block.querySelector('#sidebarLogoutBtn').addEventListener('click', logoutStoryFlow);
  }

  function setChip(button, connected, restoring, connectedText, disconnectedText) {
    if (!button) return;
    button.classList.toggle('connected', connected);
    button.classList.toggle('restoring', restoring);
    const state = button.querySelector('.connection-chip-state');
    if (state) state.textContent = restoring ? '恢復中' : (connected ? connectedText : disconnectedText);
  }

  function setSidebarRow(button, connected, restoring, connectedText, disconnectedText) {
    if (!button) return;
    button.classList.toggle('connected', connected);
    button.classList.toggle('restoring', restoring);
    const small = button.querySelector('small');
    if (small) small.textContent = restoring ? '恢復中…' : (connected ? connectedText : disconnectedText);
  }

  function syncConnectionUi() {
    ensureTopStatus();
    ensureSidebarStatus();

    const gConnected = googleConnected();
    const gRestoring = googleRestoring();
    const fConnected = folderConnected();
    const folderText = originalFolderStatus()?.textContent || '';
    const fNeedsPermission = /重新授權|重新連接/.test(folderText);

    setChip(document.getElementById('topGoogleConnection'), gConnected, gRestoring, '已登入', '登入');
    setChip(document.getElementById('topFolderConnection'), fConnected, false, '已連接', fNeedsPermission ? '重連' : '連接');
    setSidebarRow(document.getElementById('sidebarGoogleConnection'), gConnected, gRestoring, '已登入', '尚未登入');
    setSidebarRow(document.getElementById('sidebarFolderConnection'), fConnected, false, '已連接', fNeedsPermission ? '需要重新連接' : '尚未連接');

    const showLogout = gConnected || fConnected || hasSessionHint(GOOGLE_SESSION_KEY) || hasSessionHint(FOLDER_SESSION_KEY);
    document.querySelectorAll('#storyflowLogoutBtn,#sidebarLogoutBtn').forEach(button => { button.hidden = !showLogout; });
  }

  function deleteConnectionDatabase() {
    if (!('indexedDB' in window)) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      try {
        const request = indexedDB.deleteDatabase(CONNECTION_DB);
        request.onsuccess = finish;
        request.onerror = finish;
        request.onblocked = finish;
        window.setTimeout(finish, 1200);
      } catch (_) {
        finish();
      }
    });
  }

  async function logoutStoryFlow() {
    const ok = window.confirm('登出 StoryFlow？\n\n會清除本次 Google 登入狀態與已記住的 StoryFlow 資料夾連線；不會刪除資料夾內的 workspace.json、settings.json 或 Markdown。');
    if (!ok) return;

    try { window.StoryFlowSessionAuth?.forgetSession?.(); } catch (_) {}
    try {
      sessionStorage.removeItem(GOOGLE_SESSION_KEY);
      sessionStorage.removeItem(FOLDER_SESSION_KEY);
    } catch (_) {}
    try { StoryFlowIntegrations.setPickerApiKey?.(''); } catch (_) {}

    await deleteConnectionDatabase();
    location.reload();
  }

  const observed = [
    document.getElementById('googleStatus'),
    document.getElementById('folderStatus'),
    document.getElementById('googleDot'),
    document.getElementById('folderDot')
  ].filter(Boolean);
  const observer = new MutationObserver(syncConnectionUi);
  observed.forEach(node => observer.observe(node, { childList: true, subtree: true, attributes: true, characterData: true }));
  window.addEventListener('storyflow:connection-changed', syncConnectionUi);

  ensureTopStatus();
  ensureSidebarStatus();
  syncConnectionUi();
  window.StoryFlowConnectionUi = { sync: syncConnectionUi, logout: logoutStoryFlow };
})();
