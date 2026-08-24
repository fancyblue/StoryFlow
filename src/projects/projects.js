// Multi-project workspace UX and persistence.
// workspace.json may hold several independent works; only one work is active in the UI at a time.
(function () {
  const WORKSPACE_SCHEMA_VERSION = 2;
  let store = { activeProjectId: null, projects: [] };
  let pendingRoute = null;

  function clone(value) {
    return structuredClone(value);
  }

  function normalizeProjectState(candidate) {
    const next = candidate?.chapters?.length ? candidate : clone(defaultState);
    next.projectTitle ||= '未命名作品';
    next.chapters ||= [];
    next.chapters.forEach(chapter => {
      chapter.parts ||= [];
      chapter.source ||= null;
      if (typeof chapter.confirmedBlockCount !== 'number') chapter.confirmedBlockCount = 0;
    });
    if (!next.chapters.length) next.chapters = clone(defaultState.chapters);
    next.activeChapterId = next.chapters.some(chapter => chapter.id === next.activeChapterId)
      ? next.activeChapterId : next.chapters[0].id;
    next.formatting ||= clone(state.formatting || defaultState.formatting);
    next.sceneMarker ||= state.sceneMarker || defaultState.sceneMarker;
    next.minChars ||= state.minChars || defaultState.minChars;
    next.maxChars ||= state.maxChars || defaultState.maxChars;
    return next;
  }

  function deriveSourceDocId(candidate) {
    return (candidate?.chapters || []).find(chapter => chapter?.source?.id)?.source?.id || null;
  }

  function isBlank(candidate) {
    if (!candidate?.chapters?.length || candidate.chapters.length !== 1) return false;
    const chapter = candidate.chapters[0];
    return !chapter?.draft && !(chapter?.parts || []).length && !chapter?.source && (!candidate.projectTitle || candidate.projectTitle === '未命名作品');
  }

  function makeRecord(projectState, meta = {}) {
    const normalized = normalizeProjectState(projectState);
    const now = new Date().toISOString();
    return {
      id: meta.id || crypto.randomUUID(),
      title: normalized.projectTitle || meta.title || '未命名作品',
      sourceDocId: meta.sourceDocId || deriveSourceDocId(normalized),
      // `placeholder` is only true for StoryFlow's internal compatibility starter.
      // Existing saved records that predate this flag are real works by default.
      placeholder: meta.placeholder === true,
      createdAt: meta.createdAt || now,
      updatedAt: meta.updatedAt || now,
      state: clone(normalized)
    };
  }

  function ensureStore() {
    if (store.projects.length) return;
    const record = makeRecord(state, { placeholder: true });
    store = { activeProjectId: record.id, projects: [record] };
  }

  function activeRecord() {
    ensureStore();
    return store.projects.find(project => project.id === store.activeProjectId) || store.projects[0];
  }

  function syncActiveRecord(sourceState = state) {
    ensureStore();
    const record = activeRecord();
    if (!record) return;
    const normalized = normalizeProjectState(sourceState);
    record.title = normalized.projectTitle || '未命名作品';
    record.sourceDocId = deriveSourceDocId(normalized) || record.sourceDocId || null;
    // Once the starter acquires real project/source/article data it is no longer a placeholder.
    if (!isBlank(normalized) || normalized.projectSource?.type) record.placeholder = false;
    record.updatedAt = new Date().toISOString();
    record.state = clone(normalized);
    store.activeProjectId = record.id;
  }

  function summary(record) {
    return {
      id: record.id,
      title: record.title || record.state?.projectTitle || '未命名作品',
      sourceDocId: record.sourceDocId || deriveSourceDocId(record.state),
      chapterCount: record.state?.chapters?.length || 0,
      placeholder: record.placeholder === true,
      updatedAt: record.updatedAt || null,
      active: record.id === store.activeProjectId
    };
  }

  function dispatchChanged() {
    window.dispatchEvent(new CustomEvent('storyflow:projects-changed', {
      detail: { activeProjectId: store.activeProjectId, projects: store.projects.map(summary) }
    }));
  }

  // Upgrade root workspace.json from one current work to a multi-project container.
  const baseLoadWorkspace = StoryFlowIntegrations.loadWorkspace;
  const baseSaveWorkspace = StoryFlowIntegrations.saveWorkspace;

  StoryFlowIntegrations.loadWorkspace = async function loadMultiProjectWorkspace() {
    const saved = await baseLoadWorkspace();
    if (saved?.schemaVersion >= WORKSPACE_SCHEMA_VERSION && Array.isArray(saved.projects) && saved.projects.length) {
      const projects = saved.projects
        .filter(project => project?.state?.chapters?.length)
        .map(project => makeRecord(project.state, project));
      if (projects.length) {
        store = {
          activeProjectId: projects.some(project => project.id === saved.activeProjectId) ? saved.activeProjectId : projects[0].id,
          projects
        };
        const current = activeRecord();
        setTimeout(dispatchChanged, 0);
        // settings-sync still consumes the legacy {state} shape; feed it only the active work.
        return { schemaVersion: 1, updatedAt: saved.updatedAt, state: clone(current.state) };
      }
    }

    if (saved?.state?.chapters?.length) {
      // A legacy workspace that was actually saved is a real work, even if its first
      // article is still empty. This migrates old zero-content works correctly.
      const record = makeRecord(saved.state, { placeholder: false });
      store = { activeProjectId: record.id, projects: [record] };
      setTimeout(dispatchChanged, 0);
    }
    return saved;
  };

  StoryFlowIntegrations.saveWorkspace = async function saveMultiProjectWorkspace(workspace) {
    const currentState = workspace?.state?.chapters?.length ? workspace.state : state;
    syncActiveRecord(currentState);
    const payload = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      activeProjectId: store.activeProjectId,
      projects: store.projects.map(project => ({
        id: project.id,
        title: project.title,
        sourceDocId: project.sourceDocId || deriveSourceDocId(project.state),
        placeholder: project.placeholder === true,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        state: project.state
      }))
    };
    return baseSaveWorkspace(payload);
  };

  function listProjects() {
    syncActiveRecord();
    return store.projects.map(summary);
  }

  function switchProject(projectId, { quiet = false } = {}) {
    ensureStore();
    const target = store.projects.find(project => project.id === projectId);
    if (!target) return false;
    if (target.id === store.activeProjectId) {
      // Re-rendering the active work must still refresh Workspace surfaces. This is
      // especially important for a real empty work, whose UI differs from the internal starter.
      renderAll();
      dispatchChanged();
      return true;
    }

    syncActiveRecord();
    const sharedFormatting = clone(state.formatting);
    const sharedSceneMarker = state.sceneMarker;
    const sharedMin = state.minChars;
    const sharedMax = state.maxChars;

    store.activeProjectId = target.id;
    state = normalizeProjectState(clone(target.state));
    state.formatting = sharedFormatting;
    state.sceneMarker = sharedSceneMarker;
    state.minChars = sharedMin;
    state.maxChars = sharedMax;
    suggestion = null;
    syncActiveRecord();
    renderAll();
    if (activeChapter()?.draft) suggestNextPart();
    saveState('已切換作品');
    dispatchChanged();
    if (!quiet) notify(`已切換作品：${state.projectTitle}`);
    return true;
  }

  function createProject({ title = '未命名作品', sourceDocId = null } = {}, { quiet = false } = {}) {
    ensureStore();
    syncActiveRecord();
    const next = clone(defaultState);
    next.projectTitle = title || '未命名作品';
    next.formatting = clone(state.formatting);
    next.sceneMarker = state.sceneMarker;
    next.minChars = state.minChars;
    next.maxChars = state.maxChars;
    const normalized = normalizeProjectState(next);

    let record = activeRecord();
    if (store.projects.length === 1 && record.placeholder === true && isBlank(record.state)) {
      record.title = normalized.projectTitle;
      record.sourceDocId = sourceDocId;
      record.placeholder = false;
      record.updatedAt = new Date().toISOString();
      record.state = clone(normalized);
    } else {
      record = makeRecord(normalized, { sourceDocId, placeholder: false });
      store.projects.push(record);
    }

    store.activeProjectId = record.id;
    state = normalized;
    suggestion = null;
    syncActiveRecord();
    renderAll();
    saveState('已建立作品');
    dispatchChanged();
    if (!quiet) notify(`已建立作品：${state.projectTitle}`);
    return summary(record);
  }

  function deleteProject(projectId) {
    ensureStore();
    const index = store.projects.findIndex(project => project.id === projectId);
    if (index < 0) return false;
    const target = store.projects[index];
    const title = target.title || target.state?.projectTitle || '未命名作品';
    const hasParts = (target.state?.chapters || []).some(chapter => (chapter.parts || []).length);
    const extra = hasParts ? '\n\n這個作品仍有已確認文章；若連輸出的 Markdown 也不要，請先到「發布」逐篇刪除。' : '';
    if (!confirm(`刪除作品「${title}」？\n\n會從 StoryFlow 工作區移除這個作品、章節、切篇與發布進度。Google Docs 原稿不會刪除。${extra}`)) return false;

    store.projects.splice(index, 1);
    if (!store.projects.length) {
      const blank = makeRecord(clone(defaultState), { placeholder: true });
      store.projects = [blank];
    }

    const sharedFormatting = clone(state.formatting);
    const sharedSceneMarker = state.sceneMarker;
    const sharedMin = state.minChars;
    const sharedMax = state.maxChars;
    const next = store.projects[Math.min(index, store.projects.length - 1)] || store.projects[0];
    store.activeProjectId = next.id;
    state = normalizeProjectState(clone(next.state));
    state.formatting = sharedFormatting;
    state.sceneMarker = sharedSceneMarker;
    state.minChars = sharedMin;
    state.maxChars = sharedMax;
    suggestion = null;
    syncActiveRecord();
    renderAll();
    if (activeChapter()?.draft) suggestNextPart();
    saveState('作品已刪除');
    dispatchChanged();
    notify(`已刪除作品：${title}`);
    return true;
  }

  function findBySourceDocId(docId) {
    if (!docId) return null;
    ensureStore();
    const record = store.projects.find(project => (project.sourceDocId || deriveSourceDocId(project.state)) === docId);
    return record ? summary(record) : null;
  }

  function findSourceTab(docId, tabId) {
    if (!docId || !tabId) return null;
    ensureStore();
    for (const project of store.projects) {
      const chapter = (project.state?.chapters || []).find(item => item?.source?.id === docId && item?.source?.tabId === tabId);
      if (chapter) return { projectId: project.id, projectTitle: project.title, chapterId: chapter.id };
    }
    return null;
  }

  window.StoryFlowProjects = {
    list: listProjects,
    activeId: () => { ensureStore(); return store.activeProjectId; },
    isActivePlaceholder: () => activeRecord()?.placeholder === true,
    findBySourceDocId,
    findSourceTab,
    switchProject,
    createProject,
    deleteProject
  };

  // The old global reset is no longer needed now that works/articles can be removed individually.
  document.getElementById('resetWorkspaceBtn')?.remove();

  function ensureProjectSwitcher() {
    const panel = document.querySelector('.source-panel');
    const titleLabel = panel?.querySelector('label[for="projectTitle"]');
    if (!panel || !titleLabel || document.getElementById('projectSwitcher')) return;

    const box = document.createElement('div');
    box.id = 'projectSwitcher';
    box.className = 'project-switcher';
    box.innerHTML = `
      <label class="project-switcher-field">
        <span>目前作品</span>
        <select id="projectSwitcherSelect" class="text-input" aria-label="切換作品"></select>
      </label>
      <div class="project-switcher-actions">
        <button id="newProjectBtn" class="button tiny ghost" type="button">＋ 新作品</button>
        <button id="deleteProjectBtn" class="button tiny ghost project-delete-btn" type="button">刪除作品</button>
      </div>`;
    panel.insertBefore(box, titleLabel);

    box.querySelector('#projectSwitcherSelect').addEventListener('change', event => {
      switchProject(event.target.value);
    });
    box.querySelector('#newProjectBtn').addEventListener('click', () => {
      createProject({ title: '未命名作品' });
      const input = document.getElementById('projectTitle');
      requestAnimationFrame(() => { input?.focus(); input?.select(); });
    });
    box.querySelector('#deleteProjectBtn').addEventListener('click', () => deleteProject(store.activeProjectId));
  }

  function renderProjectSwitcher() {
    ensureProjectSwitcher();
    const select = document.getElementById('projectSwitcherSelect');
    if (!select) return;
    const projects = listProjects();
    const activeId = store.activeProjectId;
    select.innerHTML = '';
    projects.forEach(project => select.add(new Option(project.title || '未命名作品', project.id)));
    select.value = activeId;
  }

  function hasMeaningfulCurrentProject() {
    return Boolean((state.chapters || []).some(chapter => chapter?.draft || chapter?.source || (chapter?.parts || []).length));
  }

  function decorateSourcePreview(route) {
    if (!route) return;
    const dialog = document.getElementById('sourcePreviewDialog');
    if (!dialog?.open) return;
    const heading = document.getElementById('sourcePreviewHeading');
    const warning = document.getElementById('sourcePreviewWarning');
    const confirmButton = document.getElementById('confirmSourcePreviewBtn');

    if (route.kind === 'new') {
      if (heading) heading.textContent = '建立新作品';
      if (warning) {
        warning.classList.remove('hidden');
        warning.textContent = `這份 Google Docs 與目前作品不同。確認後會建立新作品「${route.title}」並切換整個工作區；目前作品會完整保留。`;
      }
      if (confirmButton) confirmButton.textContent = '建立作品並切換';
    } else if (route.kind === 'existing') {
      if (heading) heading.textContent = '切換到現有作品';
      if (warning) {
        warning.classList.remove('hidden');
        warning.textContent = `這份 Google Docs 已屬於作品「${route.title}」。確認後會切換整個工作區到該作品，再加入這個分頁。`;
      }
      if (confirmButton) confirmButton.textContent = '切換作品並加入';
    }
  }

  const baseImportSelectedTab = window.importSelectedTab;
  if (typeof baseImportSelectedTab === 'function') {
    window.importSelectedTab = function importSelectedTabProjectAware(tabId) {
      const doc = pendingGoogleDoc;
      const tab = doc?.tabs?.find(item => item.id === tabId);
      if (!doc || !tab) return baseImportSelectedTab(tabId);

      const activeId = store.activeProjectId;
      const exactExisting = findSourceTab(doc.id, tab.id);
      if (exactExisting && exactExisting.projectId !== activeId) {
        switchProject(exactExisting.projectId, { quiet: true });
        state.activeChapterId = exactExisting.chapterId;
        suggestion = null;
        saveState('已切換作品');
        els.tabDialog?.close();
        renderAll();
        if (activeChapter()?.draft) suggestNextPart();
        notify(`已切換到作品「${exactExisting.projectTitle}」的既有來源。`);
        return;
      }

      const owner = findBySourceDocId(doc.id);
      pendingRoute = null;
      if (owner && owner.id !== activeId) {
        pendingRoute = { kind: 'existing', projectId: owner.id, title: owner.title, sourceDocId: doc.id };
      } else if (!owner && hasMeaningfulCurrentProject()) {
        pendingRoute = { kind: 'new', title: doc.title || doc.name || '未命名作品', sourceDocId: doc.id };
      }

      const result = baseImportSelectedTab(tabId);
      setTimeout(() => decorateSourcePreview(pendingRoute), 0);
      return result;
    };
  }

  // Switch/create only at confirmation time. Cancelling the preview therefore leaves the current work untouched.
  document.addEventListener('click', event => {
    if (!event.target.closest?.('#confirmSourcePreviewBtn') || !pendingRoute) return;
    const route = pendingRoute;
    pendingRoute = null;
    if (route.kind === 'new') createProject({ title: route.title, sourceDocId: route.sourceDocId }, { quiet: true });
    else if (route.kind === 'existing') switchProject(route.projectId, { quiet: true });
  }, true);

  const clearRoute = () => { pendingRoute = null; };
  document.getElementById('cancelSourcePreviewBtn')?.addEventListener('click', clearRoute);
  document.getElementById('closeSourcePreviewDialog')?.addEventListener('click', clearRoute);

  window.addEventListener('storyflow:projects-changed', renderProjectSwitcher);
  document.getElementById('projectTitle')?.addEventListener('change', () => setTimeout(renderProjectSwitcher, 0));

  ensureStore();
  ensureProjectSwitcher();
  renderProjectSwitcher();
})();
