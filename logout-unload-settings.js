// Logout is a local session reset, not a destructive settings operation.
// It unloads the imported settings.json/bootstrap state and forgets the folder handle,
// but never rewrites or deletes settings.json, workspace.json, or Markdown files.
(function () {
  const KEYS = [
    'storyflow.google.session.v1',
    'storyflow.google.access-token.v1',
    'storyflow.google.access-token.expires.v1',
    'storyflow.folder.session.v1',
    'storyflow.integration-bootstrap.v1'
  ];
  const CONNECTION_DB = 'storyflow-connections-v1';
  let loggingOut = false;

  function integrationsApi() {
    return typeof StoryFlowIntegrations !== 'undefined'
      ? StoryFlowIntegrations
      : window.StoryFlowIntegrations;
  }

  function clearSessionState() {
    try { window.StoryFlowSessionAuth?.forgetSession?.(); } catch (_) {}
    try { KEYS.forEach(key => sessionStorage.removeItem(key)); } catch (_) {}

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

  function deleteConnectionDatabase() {
    if (!('indexedDB' in window)) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
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

  async function logout() {
    if (loggingOut) return;
    const ok = window.confirm(
      '登出 StoryFlow？\n\n' +
      '會登出 Google、卸載目前載入的 settings.json，並忘記 StoryFlow 資料夾連線。\n' +
      '不會修改或刪除資料夾內的 settings.json、workspace.json 或 Markdown。'
    );
    if (!ok) return;

    loggingOut = true;
    clearSessionState();
    await deleteConnectionDatabase();
    location.reload();
  }

  // The legacy connection module attached direct click handlers to these buttons.
  // Capture first so logout semantics stay non-destructive and settings bootstrap is
  // definitely unloaded before the older handler can run.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#storyflowLogoutBtn,#sidebarLogoutBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    logout();
  }, true);

  function updateLogoutCopy() {
    const sidebar = document.getElementById('sidebarLogoutBtn');
    if (sidebar) {
      sidebar.title = '登出並卸載設定';
      sidebar.dataset.hint = '登出並卸載設定';
      sidebar.setAttribute('aria-label', '登出並卸載設定');
      const label = sidebar.querySelector('.sidebar-logout-label');
      if (label && label.textContent !== '登出並卸載設定') label.textContent = '登出並卸載設定';
    }
    const top = document.getElementById('storyflowLogoutBtn');
    if (top) {
      top.title = '登出並卸載設定';
      top.setAttribute('aria-label', '登出並卸載設定');
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
  window.addEventListener('storyflow:view-changed', updateLogoutCopy);

  window.StoryFlowLogout = { logout, clearSessionState };
})();
