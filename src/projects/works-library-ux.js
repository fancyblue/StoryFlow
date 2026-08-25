// Works library UX — performance-safe edition.
// Keep the requested labels and overflow action without observing or repeatedly moving
// card subtrees. The core Projects renderer remains the source of truth.
(function () {
  function closeOverflowMenus(except = null) {
    document.querySelectorAll('.project-library-overflow-menu').forEach(menu => {
      if (menu === except) return;
      menu.hidden = true;
      menu.closest('.project-library-actions')?.querySelector('.project-library-more-btn')?.setAttribute('aria-expanded', 'false');
    });
  }

  function refineLabels(card) {
    const open = card.querySelector('.project-open-btn');
    if (open) {
      const label = card.classList.contains('active') ? '工作台' : '開啟';
      if (open.textContent !== label) open.textContent = label;
    }

    const publish = card.querySelector('.project-publish-btn');
    if (publish && publish.textContent !== '管理發布') publish.textContent = '管理發布';

    const meta = card.querySelector('.project-library-meta');
    if (meta) {
      const text = meta.textContent || '';
      if (text.includes('手動／尚未綁定來源')) meta.textContent = text.replace('手動／尚未綁定來源', '手動建立');
    }
  }

  function ensureOverflow(card) {
    const actions = card.querySelector('.project-library-actions');
    const legacyDelete = actions?.querySelector(':scope > .project-library-delete');
    if (!actions || !legacyDelete) return;

    let more = actions.querySelector(':scope > .project-library-more-btn');
    let menu = actions.querySelector(':scope > .project-library-overflow-menu');

    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'button tiny ghost project-library-more-btn';
      more.textContent = '⋯';
      more.title = '更多作品操作';
      more.setAttribute('aria-label', '更多作品操作');
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
      actions.appendChild(more);
    }

    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'project-library-overflow-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'menu');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('role', 'menuitem');
      remove.innerHTML = '<span aria-hidden="true">×</span><span>刪除作品</span>';
      remove.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        menu.hidden = true;
        more.setAttribute('aria-expanded', 'false');
        legacyDelete.click();
      });
      menu.appendChild(remove);
      actions.appendChild(menu);
    }

    if (more.dataset.worksUxBound !== '1') {
      more.dataset.worksUxBound = '1';
      more.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = menu.hidden;
        closeOverflowMenus(opening ? menu : null);
        menu.hidden = !opening;
        more.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) menu.querySelector('button')?.focus({ preventScroll: true });
      });
    }
  }

  function decorateLibrary() {
    const library = document.getElementById('projectsLibrary');
    if (!library) return;
    library.querySelectorAll(':scope > .project-library-card').forEach(card => {
      refineLabels(card);
      ensureOverflow(card);
    });
  }

  function scheduleDecorate() {
    window.setTimeout(decorateLibrary, 0);
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('.project-library-more-btn, .project-library-overflow-menu')) closeOverflowMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOverflowMenus();
  });

  window.addEventListener('storyflow:projects-changed', scheduleDecorate);
  window.addEventListener('storyflow:view-changed', scheduleDecorate);
  window.addEventListener('load', scheduleDecorate, { once: true });

  scheduleDecorate();
})();
