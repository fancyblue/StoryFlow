// Publishing project filter.
// The publishing view can browse several works at once without repeatedly switching the app state.
// It reads workspace.json only on explicit lifecycle events, then reuses the in-memory snapshot.
(function () {
  const DB_NAME = 'storyflow-connections-v1';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'storyflow-output-directory';
  const WORKSPACE_FILE = 'workspace.json';

  let workspaceSnapshot = null;
  let selectedProjectIds = new Set();
  let currentContentType = 'all';
  let initializedSelection = false;
  let refreshTimer = null;
  let refreshEpoch = 0;

  function clone(value) {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function partKey(part, project, visual = false) {
    if (visual) return `visual:${project?.id || project?.title}:${part.id}`;
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
    // An empty project filter means "all works". This avoids a dead-end state
    // where every checkbox is cleared and the publishing list disappears.
    if (ids.length && !selectedProjectIds.size) selectedProjectIds = new Set(ids);
  }

  function entriesForProject(project) {
    const entries = [];
    if (project?.state?.contentMode === 'visual') {
      return [...(project.state.visualEntries || [])]
        .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0))
        .map((part, partIndex) => ({
          project,
          chapter: null,
          part,
          partIndex,
          contentMode: 'visual',
          key: partKey(part, project, true),
          status: statusFor(part)
        }));
    }
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
          contentMode: 'longform',
          key: partKey(part, project),
          status: statusFor(part)
        });
      }
    }
    return entries;
  }

  function selectedProjects() {
    const snapshot = mergeActiveState(workspaceSnapshot || fallbackSnapshot());
    const projects = snapshot.projects || [];
    const selected = selectedProjectIds.size
      ? selectedProjectIds
      : new Set(projects.map(project => project.id));
    return projects.filter(project => selected.has(project.id));
  }

  function activeStatusFilter() {
    return document.querySelector('#publishingFilters .publishing-filter.active')?.dataset.filter || 'all';
  }

  function updateContentTypeCounts(projects) {
    const projectModes = projects
      .map(project => entriesForProject(project)[0]?.contentMode)
      .filter(Boolean);
    const counts = {
      all: projectModes.length,
      longform: projectModes.filter(mode => mode === 'longform').length,
      visual: projectModes.filter(mode => mode === 'visual').length
    };
    document.querySelectorAll('#publishingContentTypeFilters [data-content-type]').forEach(button => {
      const key = button.dataset.contentType || 'all';
      const label = key === 'all' ? '全部類型' : key === 'longform' ? '長文' : '圖文';
      button.textContent = `${label} ${Number(counts[key] || 0).toLocaleString()}`;
      button.classList.toggle('active', key === currentContentType);
    });
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

  function syncContinuePublishing(entries) {
    const button = document.getElementById('continuePublishingBtn');
    if (!button) return;
    const target = entries.find(entry => entry.status.key !== 'complete');
    button.hidden = !target;
    button.textContent = platforms.length ? '繼續發布' : '設定發布平台';
    button.onclick = () => {
      if (!target) return;
      const platform = platforms.find(name => !target.part.platformStatus?.[name]);
      if (!platform) {
        window.StoryFlowShowSettings?.();
        return;
      }
      const api = window.StoryFlowProjects;
      if (api?.activeId?.() !== target.project.id) api?.switchProject?.(target.project.id, { quiet: true });
      window.StoryFlowNavigate?.('publishing');
      window.setTimeout(() => window.StoryFlowPublishing?.openPending?.(target.key, platform), 80);
    };
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
          <span>作品</span><strong id="publishingProjectFilterSummary">全部</strong><span class="sf-chevron publishing-project-filter-chevron" aria-hidden="true"></span>
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

    let typeFilters = document.getElementById('publishingContentTypeFilters');
    if (!typeFilters) {
      typeFilters = document.createElement('div');
      typeFilters.id = 'publishingContentTypeFilters';
      typeFilters.className = 'publishing-content-type-filters';
      typeFilters.setAttribute('role', 'group');
      typeFilters.setAttribute('aria-label', '篩選內容類型');
      typeFilters.innerHTML = `
        <button class="publishing-type-filter active" type="button" data-content-type="all">全部類型</button>
        <button class="publishing-type-filter" type="button" data-content-type="longform">長文</button>
        <button class="publishing-type-filter" type="button" data-content-type="visual">圖文</button>`;
      stack.insertBefore(typeFilters, statusFilters);
      typeFilters.addEventListener('click', event => {
        const button = event.target.closest('[data-content-type]');
        if (!button) return;
        currentContentType = button.dataset.contentType || 'all';
        window.renderParts?.();
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
    else if (!selectedProjectIds.size || selectedProjectIds.size === projects.length) summary.textContent = '全部';
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
    const visual = entry.contentMode === 'visual';
    const card = document.createElement('article');
    card.className = 'publish-list-item publishing-combined-row';
    card.dataset.projectId = project.id;
    card.dataset.partKey = key;
    const statusCount = status.total ? ` · ${status.published}/${status.total}` : '';
    card.innerHTML = `
      <div class="publish-list-summary">
        <div class="publish-list-title-block">
          <span class="publish-chapter-name"><span class="publish-content-type ${visual ? 'visual' : 'longform'}">${visual ? '圖文' : '長文'}</span>${visual ? '圖文系列' : (entry.chapter?.title || '未命名章節')}</span>
          <div class="publish-list-title-row"><strong></strong><span></span></div>
        </div>
        <div class="publish-list-meta"><span class="publish-overall-status ${status.key}">${status.label}${statusCount}</span></div>
        <div class="publish-list-actions">
          <button class="button tiny ghost default-preview-btn" type="button">預覽</button>
          <button class="button tiny ghost publish-manage-btn" type="button">管理發布</button>
          <button class="button tiny ghost publish-more-btn" type="button" aria-label="更多文章操作">⋯</button>
        </div>
      </div>`;
    card.querySelector('.publish-list-title-row strong').textContent = part.title || '未命名文章';
    card.querySelector('.publish-list-title-row span').textContent = `${Number(visual ? String(part.body || '').replace(/\s/g, '').length : part.chars || 0).toLocaleString()} 字`;
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
    const typeBadge = document.createElement('span');
    typeBadge.className = 'project-type-badge publishing-project-type-badge';
    typeBadge.textContent = project.state?.contentMode === 'visual' ? '圖文' : '長文';
    titleWrap.append(title, typeBadge);
    if (project.id === window.StoryFlowProjects?.activeId?.()) {
      const current = document.createElement('span');
      current.className = 'publishing-project-current';
      current.textContent = '目前操作中';
      titleWrap.appendChild(current);
    }
    const count = document.createElement('span');
    count.textContent = `${entries.length.toLocaleString()} 項`;
    head.append(titleWrap, count);
    group.appendChild(head);

    const chapters = new Map();
    entries.forEach(entry => {
      const chapterId = entry.contentMode === 'visual' ? 'visual' : (entry.chapter?.id || entry.chapter?.title || 'chapter');
      let chapter = chapters.get(chapterId);
      if (!chapter) {
        const section = document.createElement('section');
        section.className = 'publishing-chapter-group';
        const chapterHead = document.createElement('header');
        chapterHead.className = 'publishing-chapter-group-head';
        const chapterTitle = document.createElement('strong');
        chapterTitle.textContent = entry.contentMode === 'visual' ? '圖文清單' : (entry.chapter?.title || '未命名章節');
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
    chapters.forEach(chapter => { chapter.count.textContent = `${chapter.size.toLocaleString()} 項`; });
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

    const visibleProjects = selectedProjects();
    const selectedEntries = visibleProjects.flatMap(entriesForProject);
    updateContentTypeCounts(visibleProjects);
    const contentEntries = currentContentType === 'all'
      ? selectedEntries
      : selectedEntries.filter(entry => entry.contentMode === currentContentType);
    updateStatusCounts(contentEntries);
    syncContinuePublishing(contentEntries);
    const filter = activeStatusFilter();
    const filtered = filter === 'all' ? contentEntries : contentEntries.filter(entry => entry.status.key === filter);

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
      const allEntries = (snapshot.projects || []).flatMap(entriesForProject);
      if (!snapshot.projects?.length) {
        empty.innerHTML = '<strong>尚未建立作品</strong><span>先建立第一個作品，再載入內容並開始切篇。</span><button class="button primary" type="button">建立作品</button>';
        empty.querySelector('button').onclick = () => window.StoryFlowNavigate?.('projects');
      } else if (!allEntries.length) {
        empty.innerHTML = '<strong>尚未有已確認文章</strong><span>先回到工作台載入內容並完成第一篇切篇。</span><button class="button primary" type="button">回到工作台開始切篇</button>';
        empty.querySelector('button').onclick = () => window.StoryFlowNavigate?.('workspace');
      } else {
        empty.innerHTML = '<strong>沒有符合目前篩選的內容</strong><span>內容仍然存在，只是沒有符合目前選擇的類型或發布狀態。</span><button class="button ghost" type="button">清除篩選</button>';
        empty.querySelector('button').onclick = () => {
          currentContentType = 'all';
          document.querySelector('#publishingFilters [data-filter="all"]')?.click();
        };
      }
      fragment.appendChild(empty);
    }
    list.replaceChildren(fragment);

    const subtitle = document.querySelector('.publishing-page-subtitle');
    if (subtitle) subtitle.textContent = '依作品與發布狀態篩選，管理長文與圖文的各平台發布。';
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
  if (typeof baseRenderParts === 'function' && !baseRenderParts.__publishingProjectFilter) {
    const wrapped = function (...args) {
      const result = baseRenderParts.apply(this, args);
      renderCombinedPublishingList();
      return result;
    };
    wrapped.__publishingProjectFilter = true;
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
