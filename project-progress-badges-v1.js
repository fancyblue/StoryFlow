// Works-library progress badges.
// Surface meaningful downstream state: confirmed Smart Split outputs and anything
// published to at least one platform. The Works UX layer may move the strip beside
// 管理發布; this renderer therefore looks across the whole card, not only title content.
(function () {
  const DB_NAME = 'storyflow-connections-v1';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'storyflow-output-directory';
  const WORKSPACE_FILE = 'workspace.json';

  let statusByProject = new Map();
  let refreshGeneration = 0;
  let observedLibrary = null;
  let libraryObserver = null;

  function ensureStyles() {
    if (document.getElementById('storyflowProjectProgressBadgesV1Css')) return;
    const link = document.createElement('link');
    link.id = 'storyflowProjectProgressBadgesV1Css';
    link.rel = 'stylesheet';
    link.href = './project-progress-badges-v1.css?v=20260818-1647';
    document.head.appendChild(link);
  }

  function summarizeState(projectState) {
    let splitCount = 0;
    let publishedCount = 0;
    for (const chapter of projectState?.chapters || []) {
      for (const part of chapter?.parts || []) {
        splitCount += 1;
        const platformStates = Object.values(part?.platformStatus || {});
        const published = Boolean(part?.published) || platformStates.some(Boolean);
        if (published) publishedCount += 1;
      }
    }
    return { splitCount, publishedCount };
  }

  function openConnectionDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
    });
  }

  async function rememberedFolderHandle() {
    try {
      const db = await openConnectionDb();
      if (!db) return null;
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return handle;
    } catch (_) {
      return null;
    }
  }

  async function readWorkspaceWithoutPrompt() {
    const handle = await rememberedFolderHandle();
    if (!handle) return null;
    try {
      const readPermission = await handle.queryPermission({ mode: 'read' });
      if (readPermission !== 'granted') {
        const writePermission = await handle.queryPermission({ mode: 'readwrite' });
        if (writePermission !== 'granted') return null;
      }
      const fileHandle = await handle.getFileHandle(WORKSPACE_FILE);
      const file = await fileHandle.getFile();
      return JSON.parse(await file.text());
    } catch (_) {
      return null;
    }
  }

  function mapPersistedStatuses(workspace) {
    const next = new Map();
    if (workspace?.schemaVersion >= 2 && Array.isArray(workspace.projects)) {
      workspace.projects.forEach(project => {
        if (project?.id) next.set(project.id, summarizeState(project.state));
      });
    }
    return next;
  }

  function projectListInCardOrder() {
    const api = window.StoryFlowProjects;
    if (!api) return [];
    const activeId = api.activeId?.();
    return [...(api.list?.() || [])].sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant');
    });
  }

  function mergeCurrentProjectStatus(map) {
    try {
      const activeId = window.StoryFlowProjects?.activeId?.();
      if (activeId && state?.chapters) map.set(activeId, summarizeState(state));
    } catch (_) {}
    return map;
  }

  function badge(className, text, ariaLabel) {
    const item = document.createElement('span');
    item.className = `project-progress-badge ${className}`;
    item.textContent = text;
    item.setAttribute('aria-label', ariaLabel || text);
    return item;
  }

  function decorateCards() {
    const library = document.getElementById('projectsLibrary');
    if (!library) return;
    const projects = projectListInCardOrder();
    const cards = [...library.querySelectorAll(':scope > .project-library-card')];
    if (!cards.length || cards.length !== projects.length) return;

    cards.forEach((card, index) => {
      const project = projects[index];
      if (!project) return;
      card.dataset.projectId = project.id;

      const main = card.querySelector('.project-library-main');
      const titleRow = main?.querySelector('.project-library-title-row');
      if (!main || !titleRow) return;

      // The strip may have been moved into the publishing action cluster by Works UX.
      let strip = card.querySelector('.project-progress-badges');
      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'project-progress-badges';
        strip.setAttribute('aria-label', '作品進度');
        titleRow.insertAdjacentElement('afterend', strip);
      }

      const status = statusByProject.get(project.id) || { splitCount: 0, publishedCount: 0 };
      strip.replaceChildren();
      if (status.splitCount > 0) {
        strip.appendChild(badge('split', `已切篇 ${status.splitCount.toLocaleString()} 篇`, `已產出 ${status.splitCount.toLocaleString()} 篇切篇結果`));
      }
      if (status.publishedCount > 0) {
        strip.appendChild(badge('published', `✓ 已發布 ${status.publishedCount.toLocaleString()} 篇`, `已有 ${status.publishedCount.toLocaleString()} 篇至少發布到一個平台`));
      }
      strip.hidden = strip.childElementCount === 0;
      card.classList.toggle('has-published-progress', status.publishedCount > 0);
    });
  }

  function bindLibraryObserver() {
    const library = document.getElementById('projectsLibrary');
    if (!library || library === observedLibrary) return;
    libraryObserver?.disconnect();
    observedLibrary = library;
    libraryObserver = new MutationObserver(() => queueMicrotask(decorateCards));
    libraryObserver.observe(library, { childList: true });
  }

  async function refreshStatuses() {
    const generation = ++refreshGeneration;
    const workspace = await readWorkspaceWithoutPrompt();
    if (generation !== refreshGeneration) return;
    statusByProject = mergeCurrentProjectStatus(mapPersistedStatuses(workspace));
    bindLibraryObserver();
    decorateCards();
  }

  function scheduleRefresh(delay = 0) {
    window.setTimeout(refreshStatuses, delay);
  }

  ensureStyles();
  window.addEventListener('storyflow:projects-changed', () => scheduleRefresh(40));
  window.addEventListener('storyflow:workspace-persisted', () => scheduleRefresh(0));
  window.addEventListener('storyflow:view-changed', () => scheduleRefresh(0));
  window.addEventListener('load', () => scheduleRefresh(300), { once: true });
  bindLibraryObserver();
  scheduleRefresh(0);
})();
