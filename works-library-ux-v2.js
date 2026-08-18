// Works library UX v2.
// Refines the Works page around task hierarchy without creating DOM-observer feedback loops.
(function () {
  let observedLibrary = null;
  let observer = null;
  let syncQueued = false;

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

  function ensurePublishingCluster(card, actions, statusRow) {
    if (!card || !actions || !statusRow) return;

    let publish = actions.querySelector(':scope > .project-publish-btn')
      || card.querySelector('.project-publishing-cluster > .project-publish-btn');
    if (!publish) return;

    let cluster = statusRow.querySelector(':scope > .project-publishing-cluster');
    if (!cluster) {
      cluster = document.createElement('div');
      cluster.className = 'project-publishing-cluster';
      statusRow.appendChild(cluster);
    }

    // Keep progress + 管理發布 together, but inside project-library-main. The progress
    // renderer can therefore keep finding/reusing the same strip without recreating it.
    const badges = card.querySelector('.project-progress-badges');
    if (badges && badges.parentElement !== cluster) cluster.appendChild(badges);
    if (publish.parentElement !== cluster) cluster.appendChild(publish);
    if (publish.textContent !== '管理發布') publish.textContent = '管理發布';
    cluster.classList.toggle('no-progress', !badges || badges.hidden);
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

    // CSS keeps ⋯ visually last. Do not append existing nodes on every sync: moving an
    // existing child fires MutationObserver again and previously caused an infinite loop.
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
    const statusRow = ensureStatusRow(card);
    refineLabels(card);
    const actions = card.querySelector('.project-library-actions');
    ensurePublishingCluster(card, actions, statusRow);
    ensureOverflow(actions, card);
  }

  function refineLibrary() {
    const library = document.getElementById('projectsLibrary');
    if (!library) return;
    [...library.querySelectorAll(':scope > .project-library-card')].forEach(refineCard);
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      bindObserver();
      refineLibrary();
    });
  }

  function bindObserver() {
    const library = document.getElementById('projectsLibrary');
    if (!library || library === observedLibrary) return;
    observer?.disconnect();
    observedLibrary = library;
    observer = new MutationObserver(scheduleSync);
    // Only watch card replacement/add/remove. Internal decoration is intentionally not
    // observed, preventing self-triggered mutation loops on slower/mobile browsers.
    observer.observe(library, { childList: true });
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('.project-library-more-btn, .project-library-overflow-menu')) closeOverflowMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOverflowMenus();
  });
  window.addEventListener('storyflow:projects-changed', scheduleSync);
  window.addEventListener('storyflow:view-changed', scheduleSync);
  window.addEventListener('storyflow:workspace-persisted', scheduleSync);
  window.addEventListener('storyflow:project-progress-rendered', scheduleSync);
  window.addEventListener('load', scheduleSync, { once: true });

  scheduleSync();
})();
