// Publishing project filter v1.
// The publishing view can browse several works at once without repeatedly switching the app state.
// It reads workspace.json only on explicit lifecycle events, then reuses the in-memory snapshot.
(function () {
  const DB_NAME = 'storyflow-connections-v1';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'storyflow-output-directory';
  const WORKSPACE_FILE = 'workspace.json';

  let workspaceSnapshot = null;
  let selectedProjectIds = new Set();
  let initializedSelection = false;
  let refreshTimer = null;
  let refreshEpoch = 0;

  function clone(value) {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function partKey(part) {
    return part?.id || `${part?.title || 'part'}:${part?.startBlock ?? ''}:${part?.endBlock ?? ''}`;
  }

  function statusFor(part) {
    const names = Array.isArray(window.platforms) ? window.platforms : (typeof platforms !== 'undefined' ? platforms : []);
    const status = part?.platformStatus || {};
    const total = names.length;
    const published = names.filter(name => Boolean(status[name])).length;
    if (!total || published === 0) return { key: 'pending', label: '待發布', published, total };
    if (published === total) return { key: 'complete', label: '已完成', published, total };
    return { key: 'partial', label: '部分發布', published, total };
  }

  function openConnectionDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readSavedDirectoryHandle() {
    const db = await openConnectionDb();
    if (!db) return null;
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function readWorkspaceFile() {
    try {
      const handle = await readSavedDirectoryHandle();
      if (!handle) return null;
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return null;
      const fileHandle = await handle.getFileHandle(WORKSPACE_FILE, { create: false });
      const file = await fileHandle.getFile();
      const parsed = JSON.parse(await file.text());
      return parsed?.schemaVersion >= 2 && Array.isArray(parsed.projects) ? parsed : null;
    } catch (error) {
      if (error?.name !== 'NotFoundError') console.warn('StoryFlow publishing project filter could not read workspace.json', error);
      return null;
    }
  }

  function fallbackSnapshot() {
    const api = window.StoryFlowProjects;
    const activeId = api?.activeId?.() || 'active';
    const summaries = api?.list?.() || [];
    const activeSummary = summaries.find(project => project.id === activeId);
    return {
      schemaVersion: 2,
      activeProjectId: activeId,
      projects: [{
        id: activeId,
        title: activeSummary?.title || state?.projectTitle || '未命名作品',
        state: clone(state)
      }]
    };
  }

  function mergeActiveState(snapshot) {
    if (!snapshot?.projects?.length) return fallbackSnapshot();
    const activeId = window.StoryFlowProjects?.activeId?.() || snapshot.activeProjectId;
    snapshot.activeProjectId = activeId;
    const active = snapshot.projects.find(project => project.id === activeId);
    if (active && typeof state !== 'undefined') {
      active.title = state.projectTitle || active.title || '未命名作品';
      active.state = clone(state);
    }
    return snapshot;
  }

  function syncSelection(projects) {
    const ids = projects.map(project => project.id).filter(Boolean);
    if (!initializedSelection) {
      selectedProjectIds = new Set(ids);
      initializedSelection = true;
      return;
    }
    const valid = new Set(ids);
    selectedProjectIds = new Set([...selectedProjectIds].filter(id => valid.has(id)));
    // A newly created work joins an existing "all works" selection automatically.
    if (selectedProjectIds.size === Math.max(0, ids.length - 1)) {
      ids.forEach(id => selectedProjectIds.add(id));
    }
  }

  function entriesForProject(project) {
    const entries = [];
    const chapters = project?.state?.chapters || [];
    for (let chapterIndex = chapters.length - 1; chapterIndex >= 0; chapterIndex -= 1) {
      const chapter = chapters[chapterIndex];
      const parts = chapter?.parts || [];
      for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = parts[partIndex];
        entries.push({
          project,
          chapter,
          part,
          partIndex,
          key: partKey(part),
          status: statusFor(part)
        });
      }
    }
    return entries;
  }

  function allSelectedEntries() {
    const snapshot = mergeActiveState(workspaceSnapshot || fallbackSnapshot());
    return (snapshot.projects || [])
      .filter(project => selectedProjectIds.has(project.id))
      .flatMap(entriesForProject);
  }

  function activeStatusFilter() {
    return document.querySelector('#publishingFilters .publishing-filter.active')?.dataset.filter || 'all';
  }

  function updateStatusCounts(entries) {
    const counts = { all: entries.length, pending: 0, partial: 0, complete: 0 };
    entries.forEach(entry => { counts[entry.status.key] += 1; });
    document.querySelectorAll('#publishingFilters .publishing-filter').forEach(button => {
      const key = button.dataset.filter || 'all';
      const label = key === 'all' ? '全部' : key === 'pending' ? '待發布' : key === 'partial' ? '部分發布' : '已完成';
      button.textContent = `${label} ${Number(counts[key] || 0).toLocaleString()}`;
    });
  }

  function ensureFilterUi() {
    const toolbar = document.querySelector('.publishing-toolbar');
    const statusFilters = document.getElementById('publishingFilters');
    if (!toolbar || !statusFilters) return null;

    let stack = toolbar.querySelector('.publishing-filter-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'publishing-filter-stack';
      toolbar.insertBefore(stack, statusFilters);
      stack.appendChild(statusFilters);
    }

    let control = document.getElementById('publishingProjectFilterControl');
    if (!control) {
      control = document.createElement('div');
      control.id = 'publishingProjectFilterControl';
      control.className = 'publishing-project-filter-control';
      control.innerHTML = `
        <button id="publishingProjectFilterBtn" class="publishing-project-filter-btn" type="button" aria-haspopup="true" aria-expanded="false">
          <span>作品</span><strong id="publishingProjectFilterSummary">全部</strong><span class="publishing-project-filter-chevron" aria-hidden="true">⌄</span>
        </button>
        <div id="publishingProjectFilterMenu" class="publishing-project-filter-menu" hidden>
          <div class="publishing-project-filter-menu-head"><strong>篩選作品</strong><button type="button" data-project-filter-all>全選</button></div>
          <div class="publishing-project-filter-options"></div>
        </div>`;
      stack.insertBefore(control, statusFilters);

      const button = control.querySelector('#publishingProjectFilterBtn');
      const menu = control.querySelector('#publishingProjectFilterMenu');
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = menu.hidden;
        menu.hidden = !opening;
        button.setAttribute('aria-expanded', opening ? 'true' : 'false');
      });
      control.querySelector('[data-project-filter-all]').addEventListener('click', event => {
        event.preventDefault();
        const projects = workspaceSnapshot?.projects || [];
        selectedProjectIds = new Set(projects.map(project => project.id));
        renderProjectFilterOptions();
        renderCombinedPublishingList();
      });
    }
    return control;
  }

  function closeProjectFilter() {
    const menu = document.getElementById('publishingProjectFilterMenu');
    const button = document.getElementById('publishingProjectFilterBtn');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function renderProjectFilterOptions() {
    const control = ensureFilterUi();
    const options = control?.querySelector('.publishing-project-filter-options');
    const summary = control?.querySelector('#publishingProjectFilterSummary');
    if (!options || !summary) return;

    const projects = workspaceSnapshot?.projects || [];
    options.replaceChildren();
    projects.forEach(project => {
      const label = document.createElement('label');
      label.className = 'publishing-project-filter-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selectedProjectIds.has(project.id);
      input.value = project.id;
      const name = document.createElement('span');
      name.textContent = project.title || project.state?.projectTitle || '未命名作品';
      label.append(input, name);
      input.addEventListener('change', () => {
        if (input.checked) selectedProjectIds.add(project.id);
        else selectedProjectIds.delete(project.id);
        renderProjectFilterOptions();
        renderCombinedPublishingList();
      });
      options.appendChild(label);
    });

    if (!projects.length) summary.textContent = '無作品';
    else if (selectedProjectIds.size === projects.length) summary.textContent = '全部';
    else if (selectedProjectIds.size === 1) {
      const only = projects.find(project => selectedProjectIds.has(project.id));
      summary.textContent = only?.title || only?.state?.projectTitle || '1 個';
    } else summary.textContent = `${selectedProjectIds.size}/${projects.length}`;
  }

  function activateAndInvoke(projectId, key, selector) {
    const api = window.StoryFlowProjects;
    if (!api) return;
    if (api.activeId?.() !== projectId) api.switchProject?.(projectId, { quiet: true });
    window.StoryFlowNavigate?.('publishing');
    requestAnimationFrame(() => {
      const cards = [...document.querySelectorAll('.publish-list-item')];
      const card = cards.find(node => node.dataset.projectId === projectId && node.dataset.partKey === key && !node.classList.contains('publishing-combined-row'));
      card?.querySelector(selector)?.click();
    });
  }

  function createCombinedRow(entry) {
    const { project, part, status, key } = entry;
    const card = document.createElement('article');
    card.className = 'publish-list-item publishing-combined-row';
    card.dataset.projectId = project.id;
    card.dataset.partKey = key;
    const statusCount = status.total ? ` · ${status.published}/${status.total}` : '';
    card.innerHTML = `
      <div class="publish-list-summary">
        <div class="publish-list-title-block">
          <div class="publish-list-title-row"><strong></strong><span></span></div>
        </div>
        <div class="publish-list-meta"><span class="publish-overall-status ${status.key}">${status.label}${statusCount}</span></div>
        <div class="publish-list-actions">
          <button class="button tiny ghost default-preview-btn" type="button">預覽預設設定</button>
          <button class="button tiny ghost publish-manage-btn" type="button">管理發布</button>
          <button class="button tiny ghost publish-more-btn" type="button" aria-label="更多文章操作">⋯</button>
        </div>
      </div>`;
    card.querySelector('.publish-list-title-row strong').textContent = part.title || '未命名文章';
    card.querySelector('.publish-list-title-row span').textContent = `${Number(part.chars || 0).toLocaleString()} 字`;
    card.querySelector('.default-preview-btn').addEventListener('click', () => activateAndInvoke(project.id, key, '.default-preview-btn'));
    card.querySelector('.publish-manage-btn').addEventListener('click', () => activateAndInvoke(project.id, key, '.publish-manage-btn'));
    card.querySelector('.publish-more-btn').addEventListener('click', () => activateAndInvoke(project.id, key, '.publish-more-btn'));
    return card;
  }

  function buildProjectGroup(project, entries, nativeCards) {
    const group = document.createElement('section');
    group.className = 'publishing-project-group publishing-multi-project-group';
    group.dataset.projectId = project.id;

    const head = document.createElement('header');
    head.className = 'publishing-project-group-head';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'publishing-project-group-title';
    const title = document.createElement('strong');
    title.textContent = project.title || project.state?.projectTitle || '未命名作品';
    titleWrap.appendChild(title);
    if (project.id === window.StoryFlowProjects?.activeId?.()) {
      const current = document.createElement('span');
      current.className = 'publishing-project-current';
      current.textContent = '目前操作中';
      titleWrap.appendChild(current);
    }
    const count = document.createElement('span');
    count.textContent = `${entries.length.toLocaleString()} 篇`;
    head.append(titleWrap, count);
    group.appendChild(head);

    const chapters = new Map();
    entries.forEach(entry => {
      const chapterId = entry.chapter?.id || entry.chapter?.title || 'chapter';
      let chapter = chapters.get(chapterId);
      if (!chapter) {
        const section = document.createElement('section');
        section.className = 'publishing-chapter-group';
        const chapterHead = document.createElement('header');
        chapterHead.className = 'publishing-chapter-group-head';
        const chapterTitle = document.createElement('strong');
        chapterTitle.textContent = entry.chapter?.title || '未命名章節';
        const chapterCount = document.createElement('span');
        chapterCount.className = 'publishing-chapter-group-count';
        chapterHead.append(chapterTitle, chapterCount);
        const rows = document.createElement('div');
        rows.className = 'publishing-chapter-group-rows';
        section.append(chapterHead, rows);
        chapter = { section, rows, count: chapterCount, size: 0 };
        chapters.set(chapterId, chapter);
        group.appendChild(section);
      }

      let row = null;
      if (project.id === window.StoryFlowProjects?.activeId?.()) row = nativeCards.get(entry.key) || null;
      if (!row) row = createCombinedRow(entry);
      row.dataset.projectId = project.id;
      row.dataset.partKey = entry.key;
      chapter.rows.appendChild(row);
      chapter.size += 1;
    });
    chapters.forEach(chapter => { chapter.count.textContent = `${chapter.size.toLocaleString()} 篇`; });
    return group;
  }

  function renderCombinedPublishingList() {
    const list = document.getElementById('partsList');
    if (!list) return;
    const snapshot = mergeActiveState(workspaceSnapshot || fallbackSnapshot());
    workspaceSnapshot = snapshot;
    syncSelection(snapshot.projects || []);
    ensureFilterUi();
    renderProjectFilterOptions();

    const nativeCards = new Map();
    list.querySelectorAll('.publish-list-item:not(.publishing-combined-row)').forEach(card => {
      if (card.dataset.partKey) nativeCards.set(card.dataset.partKey, card);
    });

    const selectedEntries = allSelectedEntries();
    updateStatusCounts(selectedEntries);
    const filter = activeStatusFilter();
    const filtered = filter === 'all' ? selectedEntries : selectedEntries.filter(entry => entry.status.key === filter);

    const fragment = document.createDocumentFragment();
    const byProject = new Map();
    filtered.forEach(entry => {
      if (!byProject.has(entry.project.id)) byProject.set(entry.project.id, []);
      byProject.get(entry.project.id).push(entry);
    });

    (snapshot.projects || []).forEach(project => {
      const entries = byProject.get(project.id);
      if (entries?.length) fragment.appendChild(buildProjectGroup(project, entries, nativeCards));
    });

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state publishing-empty publishing-filter-empty';
      empty.innerHTML = '<strong>沒有符合目前篩選的文章</strong><span>調整作品或發布狀態篩選後再查看。</span>';
      fragment.appendChild(empty);
    }
    list.replaceChildren(fragment);

    const subtitle = document.querySelector('.publishing-page-subtitle');
    if (subtitle) subtitle.textContent = '依作品與發布狀態篩選，再按章節管理文章。';
  }

  async function refreshWorkspaceSnapshot() {
    const epoch = ++refreshEpoch;
    const loaded = await readWorkspaceFile();
    if (epoch !== refreshEpoch) return;
    workspaceSnapshot = mergeActiveState(loaded || fallbackSnapshot());
    syncSelection(workspaceSnapshot.projects || []);
    renderCombinedPublishingList();
  }

  function scheduleSnapshotRefresh(delay = 60) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshWorkspaceSnapshot, delay);
  }

  const baseRenderParts = window.renderParts;
  if (typeof baseRenderParts === 'function' && !baseRenderParts.__publishingProjectFilterV1) {
    const wrapped = function (...args) {
      const result = baseRenderParts.apply(this, args);
      renderCombinedPublishingList();
      return result;
    };
    wrapped.__publishingProjectFilterV1 = true;
    window.renderParts = wrapped;
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('.publishing-project-filter-control')) closeProjectFilter();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeProjectFilter();
  });
  window.addEventListener('storyflow:view-changed', event => {
    if (!event.detail?.view || event.detail.view === 'publishing') scheduleSnapshotRefresh(20);
  });
  window.addEventListener('storyflow:workspace-persisted', () => scheduleSnapshotRefresh(40));
  window.addEventListener('storyflow:projects-changed', () => scheduleSnapshotRefresh(40));

  ensureFilterUi();
  scheduleSnapshotRefresh(20);
})();
