// Publishing lightbox: the frame 管理發布 opens an article in (docs/UI_SYSTEM.md, 「管理發布」).
//
// The lightbox is still the expanded row's own element, built by publishing-flow.js inside
// createArticleRow(); this module owns what outlives one build of it — its size, kept as a
// habit of this browser, and what the person was looking at across a renderParts() rebuild —
// and the Esc that closes it. It loads just before publishing-flow.js so its render hooks keep
// their place in the renderParts pipeline.
(function () {
  // 管理發布 opens the selected article in a lightbox over the queue rather than unfolding it
  // inside the list: a whole chapter of preview between two rows made the queue a page several
  // screens long, and the platforms and 複製內容 scrolled away with it. The lightbox is still the
  // expanded row's own element, so everything that looks inside the row keeps finding it. Its
  // size is a habit of this browser, kept like the sidebar collapse.
  const LIGHTBOX_SIZE_KEY = 'storyflow.ui.publishLightboxMaximized';
  let lightboxMaximized = (() => {
    try { return localStorage.getItem(LIGHTBOX_SIZE_KEY) === '1'; } catch (_) { return false; }
  })();
  // renderParts() rebuilds the row, lightbox included, on every change made inside it. What the
  // person was looking at — how far down the manuscript and the rail, and which control had
  // focus — is carried across the rebuild so a save or a platform switch does not jump.
  let lightboxMemory = null;

  // The rows of the active work, in the order the queue shows them. Rows of other works are
  // stand-ins that switch work first, so stepping stays inside the work that is open.
  function lightboxOrder() {
    return [...(els.partsList?.querySelectorAll('.publish-list-item:not(.publishing-combined-row)') || [])]
      .map(card => card.dataset.partKey)
      .filter(Boolean);
  }

  function setLightboxMaximized(value) {
    lightboxMaximized = Boolean(value);
    try { localStorage.setItem(LIGHTBOX_SIZE_KEY, lightboxMaximized ? '1' : '0'); } catch (_) {}
    const label = lightboxMaximized ? '縮小視窗' : '放大視窗';
    els.partsList?.querySelectorAll('.publish-lightbox').forEach(box => {
      box.classList.toggle('is-maximized', lightboxMaximized);
      const button = box.querySelector('.publish-lightbox-size');
      button?.setAttribute('aria-pressed', String(lightboxMaximized));
      button?.setAttribute('aria-label', label);
      if (button) button.title = label;
    });
  }

  function openLightbox() {
    const box = els.partsList?.querySelector('.publish-lightbox:not([hidden])');
    return box && box.getClientRects().length ? box : null;
  }

  function focusSelectorWithin(box) {
    const active = document.activeElement;
    if (!active || active === box || !box.contains(active)) return '';
    if (active.id) return `#${CSS.escape(active.id)}`;
    if (active.dataset.step) return `.publish-lightbox-step[data-step="${active.dataset.step}"]`;
    const name = [...active.classList].find(item => item.startsWith('publish-'));
    if (!name) return '';
    const row = active.closest('.publish-platform-row');
    return row
      ? `.publish-platform-row[data-platform="${CSS.escape(row.dataset.platform || '')}"] .${name}`
      : `.${name}`;
  }

  StoryFlowRender.before('renderParts', 'publishing-lightbox-memory', () => {
    const box = openLightbox();
    if (!box) {
      lightboxMemory = null;
      return;
    }
    lightboxMemory = {
      key: box.closest('.publish-list-item')?.dataset.partKey || '',
      platform: box.querySelector('.publish-platform-row.is-current')?.dataset.platform || '',
      mainTop: box.querySelector('.publish-manuscript-column')?.scrollTop || 0,
      railTop: box.querySelector('.publish-platform-rail')?.scrollTop || 0,
      detailsTop: box.querySelector('.publish-platform-details')?.scrollTop || 0,
      focus: focusSelectorWithin(box)
    };
  });

  // Runs once the whole render has finished, after the project filter has regrouped the rows.
  function syncLightbox() {
    const box = openLightbox();
    document.documentElement.classList.toggle('sf-publish-lightbox-open', Boolean(box));
    const memory = lightboxMemory;
    lightboxMemory = null;
    if (!box) return;
    const key = box.closest('.publish-list-item')?.dataset.partKey || '';
    const order = lightboxOrder();
    const index = order.indexOf(key);
    box.querySelector('.publish-lightbox-step[data-step="-1"]').disabled = index <= 0;
    box.querySelector('.publish-lightbox-step[data-step="1"]').disabled = index < 0 || index >= order.length - 1;
    if (!memory) return;
    // The same version of the same article keeps its place; another one starts at the top.
    if (memory.key === key && memory.platform === (box.querySelector('.publish-platform-row.is-current')?.dataset.platform || '')) {
      const column = box.querySelector('.publish-manuscript-column');
      const rail = box.querySelector('.publish-platform-rail');
      const details = box.querySelector('.publish-platform-details');
      if (column) column.scrollTop = memory.mainTop;
      if (rail) rail.scrollTop = memory.railTop;
      if (details) details.scrollTop = memory.detailsTop;
    }
    if (memory.focus) {
      const target = box.querySelector(memory.focus);
      (target && !target.disabled ? target : box.querySelector('.publish-lightbox-close'))?.focus({ preventScroll: true });
    }
  }

  StoryFlowRender.after('renderParts', 'publishing-lightbox-sync', () => queueMicrotask(syncLightbox));
  window.addEventListener('storyflow:view-changed', () => queueMicrotask(syncLightbox));

  // Esc closes the lightbox, unless a dialog opened from inside it is the one on top.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const box = openLightbox();
    if (!box || document.querySelector('dialog:modal')) return;
    event.preventDefault();
    box.querySelector('.publish-lightbox-close')?.click();
  });

  window.StoryFlowPublishingLightbox = {
    isMaximized: () => lightboxMaximized,
    setMaximized: setLightboxMaximized,
    order: lightboxOrder
  };
})();
