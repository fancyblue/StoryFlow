// Works library UX v2.
// Refines the Works page around task hierarchy: work identity stays on the left,
// publishing progress sits beside its management action, and destructive actions
// stay behind a final overflow button.
(function () {
  let observedLibrary = null;
  let observer = null;

  function closeOverflowMenus(except = null) {
    document.querySelectorAll('.project-library-overflow-menu').forEach(menu => {
      if (menu === except) return;
      menu.hidden = true;
      menu.closest('.project-library-actions')?.querySelector('.project-library-more-btn')?.setAttribute('aria-expanded', 'false');
    });
  }

  function ensureStatusRow(card) {
    const main = card.querySelector('.project-library-main');
    const meta = main?.querySelector('.project-library-meta');
    if (!main || !meta) return null;

    let row = main.querySelector('.project-library-status-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'project-library-status-row';
      meta.insertAdjacentElement('beforebegin', row);
    }
    if (meta.parentElement !== row) row.appendChild(meta);
    return row;
  }

  function ensurePublishingCluster(card, actions) {
    if (!card || !actions) return;

    const main = card.querySelector('.project-library-main');
    const manageChapters = actions.querySelector(':scope > .project-manage-chapters-btn');
    const open = actions.querySelector(':scope > .project-open-btn');
    let publish = actions.querySelector(':scope > .project-publish-btn')
      || actions.querySelector('.project-publishing-cluster > .project-publish-btn');
    if (!publish) return;

    let cluster = actions.querySelector(':scope > .project-publishing-cluster');
    if (!cluster) {
      cluster = document.createElement('div');
      cluster.className = 'project-publishing-cluster';
      const anchor = manageChapters || open;
      if (anchor) anchor.insertAdjacentElement('afterend', cluster);
      else actions.prepend(cluster);
    }

    // Progress explains what "管理發布" is managing, so keep both in one visual group.
    const badges = card.querySelector('.project-progress-badges');
    if (badges && badges.parentElement !== cluster) cluster.appendChild(badges);
    if (publish.parentElement !== cluster) cluster.appendChild(publish);
    if (publish.textContent !== '管理發布') publish.textContent = '管理發布';

    // If a later renderer recreates the progress strip under the title, the subtree
    // observer will bring it back here without duplicating the publishing action.
    if (!badges && main) cluster.classList.add('no-progress');
    else cluster.classList.remove('no-progress');
  }

  function ensureOverflow(actions, card) {
    if (!actions || !card) return;
    const legacyDelete = actions.querySelector(':scope > .project-library-delete');
    if (!legacyDelete) return;

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
    }

    // Keep the visible overflow trigger as the final control in every card.
    actions.appendChild(more);
    actions.appendChild(menu);

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

  function refineCard(card) {
    if (!(card instanceof HTMLElement)) return;
    ensureStatusRow(card);
    refineLabels(card);
    const actions = card.querySelector('.project-library-actions');
    ensurePublishingCluster(card, actions);
    ensureOverflow(actions, card);
  }

  function refineLibrary() {
    const library = document.getElementById('projectsLibrary');
    if (!library) return;
    [...library.querySelectorAll(':scope > .project-library-card')].forEach(refineCard);
  }

  function bindObserver() {
    const library = document.getElementById('projectsLibrary');
    if (!library || library === observedLibrary) return;
    observer?.disconnect();
    observedLibrary = library;
    observer = new MutationObserver(() => queueMicrotask(refineLibrary));
    observer.observe(library, { childList: true, subtree: true });
  }

  function sync() {
    bindObserver();
    refineLibrary();
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('.project-library-more-btn, .project-library-overflow-menu')) closeOverflowMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOverflowMenus();
  });
  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(sync, 0));
  window.addEventListener('storyflow:view-changed', () => window.setTimeout(sync, 0));
  window.addEventListener('storyflow:workspace-persisted', () => window.setTimeout(sync, 0));
  window.addEventListener('load', () => window.setTimeout(sync, 250), { once: true });

  sync();
})();
