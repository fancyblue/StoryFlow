// Chapter management: avoid empty destructive-action columns in the workspace and
// let manual articles be fully edited from the Works page without conflating source titles
// with Smart Split output titles.
(function () {
  const expandedProjects = new Set();
  let pendingChapterRailScroll = null;

  function ensureStyles() {
    let link = document.getElementById('storyflowChapterManagementCss');
    if (!link) {
      link = document.createElement('link');
      link.id = 'storyflowChapterManagementCss';
      link.rel = 'stylesheet';
      link.href = './styles/domains/chapter-management.css?v=20260828-p23a';
      document.head.appendChild(link);
    }
    return link;
  }

  function ensureStylesLast() {
    const link = ensureStyles();
    if (link.parentElement === document.head && document.head.lastElementChild !== link) {
      document.head.appendChild(link);
    }
  }

  function closeChapterMenus(except = null) {
    document.querySelectorAll('.chapter-row-action-menu').forEach(menu => {
      if (menu === except) return;
      menu.hidden = true;
      menu.closest('.chapter-row')?.querySelector('.chapter-more-button')?.setAttribute('aria-expanded', 'false');
    });
  }

  function positionChapterMenu(menu) {
    const row = menu?.closest('.chapter-row');
    const panel = menu?.closest('.source-panel');
    if (!row || !panel || menu.hidden) return;
    menu.classList.remove('opens-up');
    const panelRect = panel.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const menuHeight = menu.getBoundingClientRect().height;
    const spaceBelow = panelRect.bottom - (rowRect.top + rowRect.height / 2 + 20);
    const spaceAbove = rowRect.top + rowRect.height / 2 - 20 - panelRect.top;
    if (spaceBelow < menuHeight + 8 && spaceAbove >= menuHeight + 8) {
      menu.classList.add('opens-up');
    }
  }

  function restoreChapterRailScroll(panel, scrollTop) {
    if (!panel || !Number.isFinite(scrollTop)) return;
    panel.scrollTop = scrollTop;
    requestAnimationFrame(() => { panel.scrollTop = scrollTop; });
  }

  function decorateWorkspaceChapterActions() {
    document.querySelectorAll('#chapterList .chapter-row').forEach(row => {
      const legacyDelete = row.querySelector(':scope > .chapter-delete-button');
      if (!legacyDelete || legacyDelete.dataset.chapterMenuBound === '1') return;
      legacyDelete.dataset.chapterMenuBound = '1';

      const deleteHandler = legacyDelete.onclick;
      legacyDelete.onclick = null;
      legacyDelete.classList.add('chapter-more-button');
      legacyDelete.textContent = '⋯';
      legacyDelete.title = '章節操作';
      legacyDelete.setAttribute('aria-label', '章節操作');
      legacyDelete.setAttribute('aria-haspopup', 'menu');
      legacyDelete.setAttribute('aria-expanded', 'false');

      const menu = document.createElement('div');
      menu.className = 'chapter-row-action-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'menu');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chapter-row-delete-menu-item';
      remove.setAttribute('role', 'menuitem');
      remove.innerHTML = '<span aria-hidden="true">×</span><span>刪除章節</span>';
      remove.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        menu.hidden = true;
        legacyDelete.setAttribute('aria-expanded', 'false');
        if (typeof deleteHandler === 'function') deleteHandler.call(legacyDelete, event);
      });
      menu.appendChild(remove);
      row.appendChild(menu);

      legacyDelete.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = menu.hidden;
        closeChapterMenus(opening ? menu : null);
        menu.hidden = !opening;
        legacyDelete.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) {
          positionChapterMenu(menu);
          menu.querySelector('button')?.focus({ preventScroll: true });
        }
      });
    });
  }

  function projectsInLibraryOrder() {
    const api = window.StoryFlowProjects;
    if (!api) return [];
    const activeId = api.activeId?.();
    return [...(api.list?.() || [])].sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant');
    });
  }

  function isManualChapter(chapter) {
    return Boolean(chapter && !chapter.source && !chapter.detachedSource);
  }

  function activeChapterMetadata() {
    try {
      return (state?.chapters || []).map(chapter => ({
        id: chapter.id,
        title: String(chapter.title || '未命名章節'),
        manual: isManualChapter(chapter),
        chars: typeof charCount === 'function' ? charCount(chapter.draft || '') : String(chapter.draft || '').length
      }));
    } catch (_) {
      return [];
    }
  }

  function activeVisualMetadata() {
    try {
      return (state?.visualEntries || []).map(entry => ({
        id: entry.id,
        title: String(entry.title || '未命名圖文'),
        status: entry.status === 'ready' ? '可發布' : '草稿',
        chars: typeof charCount === 'function' ? charCount(entry.body || '') : String(entry.body || '').length,
        images: Array.isArray(entry.images) ? entry.images.length : 0
      }));
    } catch (_) {
      return [];
    }
  }

  function editVisualEntry(entryId) {
    window.StoryFlowNavigate?.('workspace');
    window.setTimeout(() => {
      if (!window.StoryFlowVisualWorkspace?.openEntry?.(entryId)) {
        window.notify?.('找不到這則圖文，請重新整理後再試。', true);
      }
    }, 0);
  }

  function persistRename() {
    try { saveState('章節名稱已更新'); } catch (_) {}
    try { window.StoryFlowProjectPersistence?.flush?.('chapter-rename'); } catch (_) {}
  }

  function renameManualChapter(chapterId, nextTitle) {
    const title = String(nextTitle || '').trim();
    if (!title) {
      window.notify?.('章節名稱不能留白', true);
      return false;
    }

    const chapter = (state?.chapters || []).find(item => item.id === chapterId);
    if (!chapter || !isManualChapter(chapter)) {
      window.notify?.('Google Docs 章節名稱由來源維護；只有手動文章可以重新命名。', true);
      return false;
    }
    if (chapter.title === title) return true;

    chapter.title = title;
    suggestion = null;
    persistRename();
    try { renderAll(); } catch (_) {}
    try { window.renderChapters?.(); } catch (_) {}
    try { window.StoryFlowRenderProjects?.(); } catch (_) {}
    window.setTimeout(() => {
      decorateProjectsView();
      window.notify?.(`已更新章節名稱：${title}`);
    }, 0);
    return true;
  }

  function startInlineRename(row, chapter) {
    if (!row || row.dataset.editing === '1') return;
    row.dataset.editing = '1';
    const titleCell = row.querySelector('.project-chapter-title');
    const actionCell = row.querySelector('.project-chapter-actions');
    if (!titleCell || !actionCell) return;

    const input = document.createElement('input');
    input.className = 'text-input project-chapter-rename-input';
    input.value = chapter.title;
    input.setAttribute('aria-label', `重新命名章節「${chapter.title}」`);
    titleCell.replaceChildren(input);

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button tiny primary project-chapter-save';
    save.textContent = '儲存';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button tiny ghost project-chapter-cancel';
    cancel.textContent = '取消';
    actionCell.replaceChildren(cancel, save);

    const finishCancel = () => decorateProjectsView(true);
    const finishSave = () => {
      if (!renameManualChapter(chapter.id, input.value)) {
        input.focus();
        input.select();
      }
    };
    save.addEventListener('click', finishSave);
    cancel.addEventListener('click', finishCancel);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); finishSave(); }
      if (event.key === 'Escape') { event.preventDefault(); finishCancel(); }
    });
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  function editManualChapter(row, chapter) {
    const editor = window.StoryFlowManualArticleEditor?.open;
    if (typeof editor === 'function') {
      editor(chapter.id);
      return;
    }
    // Compatibility fallback for an older cached editor layer: at minimum keep
    // title editing available instead of leaving the control inert.
    startInlineRename(row, chapter);
  }

  function buildChapterManager(projectId, visual = false) {
    const manager = document.createElement('section');
    manager.className = 'project-chapter-manager';
    manager.dataset.projectId = projectId;

    if (visual) {
      const head = document.createElement('div');
      head.className = 'project-chapter-manager-head';
      head.innerHTML = '<div><strong>圖文</strong><span>查看系列中的圖文標題、狀態、字數與圖片數；需要修改時可直接進入圖文工作台。</span></div>';
      manager.appendChild(head);

      const entries = activeVisualMetadata();
      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'project-chapter-manager-empty';
        empty.textContent = '目前還沒有圖文。';
        manager.appendChild(empty);
        return manager;
      }

      const list = document.createElement('div');
      list.className = 'project-chapter-manager-list';
      entries.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'project-chapter-manager-row project-visual-entry-row';
        row.dataset.entryId = entry.id;

        const title = document.createElement('div');
        title.className = 'project-chapter-title';
        const name = document.createElement('strong');
        name.textContent = entry.title;
        const meta = document.createElement('small');
        meta.textContent = `${Number(entry.chars || 0).toLocaleString()} 字 · ${Number(entry.images || 0).toLocaleString()} 張圖片`;
        title.append(name, meta);

        const status = document.createElement('span');
        status.className = `project-chapter-source visual ${entry.status === '可發布' ? 'ready' : 'draft'}`;
        status.textContent = entry.status;

        const actions = document.createElement('div');
        actions.className = 'project-chapter-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'button tiny ghost project-visual-entry-edit';
        edit.textContent = '編輯圖文';
        edit.setAttribute('aria-label', `編輯圖文「${entry.title}」`);
        edit.addEventListener('click', () => editVisualEntry(entry.id));
        actions.appendChild(edit);

        row.append(title, status, actions);
        list.appendChild(row);
      });
      manager.appendChild(list);
      return manager;
    }

    const head = document.createElement('div');
    head.className = 'project-chapter-manager-head';
    head.innerHTML = '<div><strong>章節</strong><span>手動文章可以編輯章節標題與內容；Google Docs 章節由來源同步維護。</span></div>';
    manager.appendChild(head);

    const chapters = activeChapterMetadata();
    if (!chapters.length) {
      const empty = document.createElement('div');
      empty.className = 'project-chapter-manager-empty';
      empty.textContent = '目前還沒有文章。';
      manager.appendChild(empty);
      return manager;
    }

    const list = document.createElement('div');
    list.className = 'project-chapter-manager-list';
    chapters.forEach(chapter => {
      const row = document.createElement('div');
      row.className = 'project-chapter-manager-row';
      row.dataset.chapterId = chapter.id;

      const title = document.createElement('div');
      title.className = 'project-chapter-title';
      const name = document.createElement('strong');
      name.textContent = chapter.title;
      const chars = document.createElement('small');
      chars.textContent = `${Number(chapter.chars || 0).toLocaleString()} 字`;
      title.append(name, chars);

      const source = document.createElement('span');
      source.className = `project-chapter-source ${chapter.manual ? 'manual' : 'google'}`;
      source.textContent = chapter.manual ? '手動' : 'Google Docs';

      const actions = document.createElement('div');
      actions.className = 'project-chapter-actions';
      if (chapter.manual) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'button tiny ghost project-chapter-rename project-chapter-edit';
        edit.textContent = '編輯章節';
        edit.setAttribute('aria-label', `編輯章節「${chapter.title}」的標題與內容`);
        edit.addEventListener('click', () => editManualChapter(row, chapter));
        actions.appendChild(edit);
      } else {
        const locked = document.createElement('span');
        locked.className = 'project-chapter-source-note';
        locked.textContent = '由來源同步';
        actions.appendChild(locked);
      }

      row.append(title, source, actions);
      list.appendChild(row);
    });
    manager.appendChild(list);
    return manager;
  }

  function decorateProjectsView() {
    const library = document.getElementById('projectsLibrary');
    if (!library) return;
    const projects = projectsInLibraryOrder();
    const cards = [...library.querySelectorAll(':scope > .project-library-card')];
    if (!cards.length || cards.length !== projects.length) return;

    const activeId = window.StoryFlowProjects?.activeId?.();
    cards.forEach((card, index) => {
      const project = projects[index];
      if (!project) return;
      card.dataset.projectId = project.id;

      const actions = card.querySelector('.project-library-actions');
      if (!actions) return;
      let manage = actions.querySelector('.project-manage-chapters-btn');
      if (!manage) {
        manage = document.createElement('button');
        manage.type = 'button';
        manage.className = 'button tiny ghost project-manage-chapters-btn';
        const deleteButton = actions.querySelector('.project-library-delete');
        actions.insertBefore(manage, deleteButton || null);
      }

      const visual = project.contentMode === 'visual';
      const expanded = expandedProjects.has(project.id) && project.id === activeId;
      manage.textContent = expanded ? (visual ? '收合圖文' : '收合章節') : (visual ? '查看圖文' : '管理章節');
      manage.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      manage.onclick = () => {
        if (project.id !== window.StoryFlowProjects?.activeId?.()) {
          expandedProjects.add(project.id);
          window.StoryFlowProjects?.switchProject?.(project.id, { quiet: true });
          window.setTimeout(() => {
            window.StoryFlowRenderProjects?.();
            window.setTimeout(decorateProjectsView, 0);
          }, 0);
          return;
        }
        if (expandedProjects.has(project.id)) expandedProjects.delete(project.id);
        else expandedProjects.add(project.id);
        decorateProjectsView();
      };

      card.querySelector(':scope > .project-chapter-manager')?.remove();
      if (expanded) card.appendChild(buildChapterManager(project.id, visual));
      card.classList.toggle('chapters-expanded', expanded);
    });
  }

  function syncAll() {
    ensureStylesLast();
    decorateWorkspaceChapterActions();
    decorateProjectsView();
  }

  const baseRenderChapters = window.renderChapters;
  if (typeof baseRenderChapters === 'function' && !baseRenderChapters.__chapterManagement) {
    const wrapped = function (...args) {
      const panel = document.querySelector('.source-panel');
      const scrollTop = pendingChapterRailScroll;
      pendingChapterRailScroll = null;
      const result = baseRenderChapters.apply(this, args);
      queueMicrotask(decorateWorkspaceChapterActions);
      queueMicrotask(() => restoreChapterRailScroll(panel, scrollTop));
      return result;
    };
    wrapped.__chapterManagement = true;
    window.renderChapters = wrapped;
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function' && !baseRenderAll.__chapterManagement) {
    const wrapped = function (...args) {
      const result = baseRenderAll.apply(this, args);
      queueMicrotask(() => {
        decorateWorkspaceChapterActions();
        decorateProjectsView();
      });
      return result;
    };
    wrapped.__chapterManagement = true;
    window.renderAll = wrapped;
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('#chapterList .chapter-main-button')) {
      pendingChapterRailScroll = document.querySelector('.source-panel')?.scrollTop ?? null;
    }
    if (!event.target.closest?.('.chapter-more-button, .chapter-row-action-menu')) closeChapterMenus();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeChapterMenus();
  });
  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(syncAll, 0));
  window.addEventListener('storyflow:view-changed', () => window.setTimeout(syncAll, 0));
  window.addEventListener('load', () => window.setTimeout(syncAll, 650), { once: true });

  syncAll();
})();
