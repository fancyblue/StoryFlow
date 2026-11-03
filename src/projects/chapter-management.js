// Chapter management in the workspace rail: each chapter row's ⋯ menu, and holding the rail's
// scroll across rebuilds. Chapters are managed here only; the Works page no longer carries a
// second chapter list (docs/REDESIGN_PROPOSAL.md B1).
(function () {
  let pendingChapterRailScroll = null;

  function ensureStyles() {
    let link = document.getElementById('storyflowChapterManagementCss');
    if (!link) {
      link = document.createElement('link');
      link.id = 'storyflowChapterManagementCss';
      link.rel = 'stylesheet';
      link.href = './styles/domains/chapter-management.css?v=20260829-p33a';
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
      window.StoryFlowAnchoredMenu?.close?.(menu);
      menu.closest('.chapter-row, .platform-row-actions')?.querySelector('.chapter-more-button')?.setAttribute('aria-expanded', 'false');
    });
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
          window.StoryFlowAnchoredMenu?.open?.(menu);
          menu.querySelector('button')?.focus({ preventScroll: true });
        } else {
          window.StoryFlowAnchoredMenu?.close?.(menu);
        }
      });
    });
  }

  function syncAll() {
    ensureStylesLast();
    decorateWorkspaceChapterActions();
  }

  // Every rebuild holds the rail where it is, not only the first one after a click.
  // Selecting a chapter rebuilds the list more than once (the selection, then the split
  // suggestion it starts); a layout forced while the list is momentarily empty clamps the
  // rail's scroll, and with only the first rebuild restored, a later one left the rail
  // resting 70–100px from where the writer was. The list is never rebuilt from inside its
  // own rebuild, so one held position is enough between the two hooks.
  let railBeforeRebuild = null;
  StoryFlowRender.before('renderChapters', 'chapter-management', () => {
    const panel = document.querySelector('.source-panel');
    railBeforeRebuild = { panel, scrollTop: pendingChapterRailScroll ?? panel?.scrollTop ?? null };
    pendingChapterRailScroll = null;
  });
  StoryFlowRender.after('renderChapters', 'chapter-management', () => {
    const { panel, scrollTop } = railBeforeRebuild || {};
    railBeforeRebuild = null;
    queueMicrotask(decorateWorkspaceChapterActions);
    queueMicrotask(() => restoreChapterRailScroll(panel, scrollTop ?? null));
  });
  StoryFlowRender.after('renderAll', 'chapter-management', () => queueMicrotask(decorateWorkspaceChapterActions));

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
