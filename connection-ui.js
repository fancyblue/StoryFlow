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
      <button id="sidebarGoogleConnection" class="sidebar-connection-row" type="button" title="Google 登入狀態" data-hint="Google：尚未登入">
        <span class="sidebar-status-dot" aria-hidden="true"></span>
        <span class="sidebar-connection-copy"><b>Google</b><small>尚未登入</small></span>
      </button>
      <button id="sidebarFolderConnection" class="sidebar-connection-row" type="button" title="StoryFlow 資料夾狀態" data-hint="資料夾：尚未連接">
        <span class="sidebar-status-dot" aria-hidden="true"></span>
        <span class="sidebar-connection-copy"><b>資料夾</b><small>尚未連接</small></span>
      </button>
      <button id="sidebarLogoutBtn" class="sidebar-logout" type="button" title="登出並清除連線" data-hint="登出並清除連線">
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
    const text = restoring ? '恢復中…' : (connected ? connectedText : disconnectedText);
    const small = button.querySelector('small');
    if (small) small.textContent = text;
    const subject = button.id === 'sidebarGoogleConnection' ? 'Google' : '資料夾';
    button.dataset.hint = `${subject}：${text}`;
    button.setAttribute('aria-label', `${subject}：${text}`);
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

    // "登出" is an authentication action, not a generic connection reset. Stale
    // session hints or an independently connected folder must never surface it.
    const showLogout = gConnected;
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

// Empty workspace UX. The core keeps one blank in-memory chapter as a compatibility
// sentinel, but it is not a real work/chapter and must not appear as one in the UI.
(function () {
  function chaptersWithContent() {
    return (state.chapters || []).filter(chapter => Boolean(
      chapter?.draft || chapter?.source || (chapter?.parts || []).length
    ));
  }

  function hasChapterContent() {
    return chaptersWithContent().length > 0;
  }

  function hasNamedProject() {
    return Boolean(String(state.projectTitle || '').trim() && state.projectTitle !== '未命名作品');
  }

  function isImplicitBlankWorkspace() {
    const projectApi = window.StoryFlowProjects;
    if (typeof projectApi?.isActivePlaceholder === 'function') {
      return Boolean(projectApi.isActivePlaceholder());
    }

    // Backward-compatible fallback for an older projects.js.
    const chapters = state.chapters || [];
    return !hasNamedProject()
      && chapters.length === 1
      && !chapters[0]?.draft
      && !chapters[0]?.source
      && !(chapters[0]?.parts || []).length;
  }

  function ensureEmptyActions() {
    const empty = document.getElementById('suggestionEmpty');
    if (!empty) return;
    let actions = document.getElementById('workspaceEmptyActions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'workspaceEmptyActions';
      actions.className = 'workspace-empty-actions';
      actions.innerHTML = `
        <button id="workspaceLoadSourceBtn" class="button primary" type="button">載入來源</button>
        <button id="workspaceChooseWorkBtn" class="button ghost" type="button">選擇作品／章節</button>`;
      empty.appendChild(actions);
      actions.querySelector('#workspaceLoadSourceBtn').addEventListener('click', () => document.getElementById('loadSourceBtn')?.click());
      actions.querySelector('#workspaceChooseWorkBtn').addEventListener('click', () => window.StoryFlowNavigate?.('projects'));
    }
  }

  function syncEmptyCopy() {
    const empty = document.getElementById('suggestionEmpty');
    if (!empty) return;
    const strong = empty.querySelector('strong');
    const text = empty.querySelector(':scope > span');
    const hasProject = !isImplicitBlankWorkspace();
    if (strong) strong.textContent = hasProject ? '這個作品還沒有可切篇的章節' : '尚未載入作品內容';
    if (text) text.textContent = hasProject
      ? '請先載入 Google Docs／手動內容，或到「作品」切換到已有章節的作品。'
      : '請先載入 Google Docs／手動內容，或到「作品」選擇已有作品與章節。';
    ensureEmptyActions();
  }

  function syncSourcePanelEmptyState(noContent) {
    const list = document.getElementById('chapterList');
    const switcher = document.getElementById('projectSwitcher');
    const projectLabel = document.querySelector('.source-panel label[for="projectTitle"]');
    const projectInput = document.getElementById('projectTitle');
    const noRealProject = isImplicitBlankWorkspace();

    if (switcher) switcher.hidden = noRealProject;
    if (projectLabel) projectLabel.hidden = noRealProject;
    if (projectInput) projectInput.hidden = noRealProject;

    if (noContent && list) {
      list.querySelectorAll('.chapter-row,.chapter-item,.chapter-group-label').forEach(node => node.remove());
      if (!list.querySelector('.workspace-source-empty')) {
        const hint = document.createElement('div');
        hint.className = 'workspace-source-empty';
        hint.textContent = noRealProject ? '尚未載入作品或章節' : '這個作品尚未載入章節';
        list.appendChild(hint);
      }
    } else {
      list?.querySelector('.workspace-source-empty')?.remove();
    }
  }

  function syncWorkspaceEmptyState() {
    const noContent = !hasChapterContent();
    const grid = document.querySelector('.workspace-grid');
    const stats = document.querySelector('.stats-grid');
    const miniSettings = document.getElementById('smartSplitMiniSettings');
    const editor = document.querySelector('.editor-panel');
    const splitter = document.querySelector('.splitter-panel');
    const generate = document.getElementById('generateBtn');
    const save = document.getElementById('saveBtn');

    grid?.classList.toggle('workspace-empty-mode', noContent);
    if (stats) stats.hidden = noContent;
    if (miniSettings) miniSettings.hidden = noContent;
    if (editor) editor.hidden = noContent;
    if (splitter) splitter.hidden = false;
    if (generate) generate.hidden = noContent;
    if (save) save.hidden = noContent;

    syncSourcePanelEmptyState(noContent);
    if (noContent) {
      suggestion = null;
      const empty = document.getElementById('suggestionEmpty');
      const card = document.getElementById('suggestionCard');
      empty?.classList.remove('hidden');
      card?.classList.add('hidden');
      syncEmptyCopy();
    } else {
      document.getElementById('workspaceEmptyActions')?.remove();
    }
  }

  // Hide only StoryFlow's internal starter record from consumers that use the public
  // project list. A real work remains visible even when its first article is still empty.
  const projectsApi = window.StoryFlowProjects;
  if (projectsApi?.list) {
    const baseList = projectsApi.list.bind(projectsApi);
    projectsApi.list = function listVisibleProjects() {
      const projects = baseList();
      if (projects.length === 1 && projects[0]?.placeholder === true) return [];
      return projects;
    };
  }

  // New-project entry points are owned by navigation.js. Keeping one flow there avoids
  // this empty-workspace layer from intercepting the Works-page button before the
  // guarded onboarding flow can open the shared 「建立作品」 chooser.

  const baseRenderChapters = window.renderChapters;
  if (typeof baseRenderChapters === 'function') {
    window.renderChapters = function renderChaptersWithoutSentinel(...args) {
      const result = baseRenderChapters.apply(this, args);
      syncWorkspaceEmptyState();
      return result;
    };
  }

  const baseRenderSuggestion = window.renderSuggestion;
  if (typeof baseRenderSuggestion === 'function') {
    window.renderSuggestion = function renderSuggestionWithEmptyWorkspace(...args) {
      const result = baseRenderSuggestion.apply(this, args);
      syncWorkspaceEmptyState();
      return result;
    };
  }

  const baseProjectsRender = window.StoryFlowRenderProjects;
  if (typeof baseProjectsRender === 'function') {
    window.StoryFlowRenderProjects = function renderProjectsWithEmptyState(...args) {
      const result = baseProjectsRender.apply(this, args);
      const list = document.getElementById('projectsLibrary');
      if (list && !window.StoryFlowProjects?.list?.().length) {
        list.innerHTML = `
          <div class="projects-empty-state">
            <strong>尚未建立作品</strong>
            <span>你可以直接回工作台「載入來源」，StoryFlow 會依文件建立作品；也可以先新增一個空作品。</span>
          </div>`;
      }
      return result;
    };
  }

  window.addEventListener('storyflow:projects-changed', () => {
    syncWorkspaceEmptyState();
    window.StoryFlowRenderProjects?.();
  });

  syncWorkspaceEmptyState();
  window.StoryFlowSyncEmptyWorkspace = syncWorkspaceEmptyState;
})();