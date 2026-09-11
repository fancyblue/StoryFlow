// Positioning for menus that open against a row.
//
// Three menus needed this and had three different answers: the chapter rail and the
// visual entry list each carried a near-line-for-line copy of the same function, and the
// works-page menus had none at all, opening downwards unconditionally. Two bugs came out
// of that arrangement, and both are answered here rather than in any one copy.
//
// 1. The height is not settled when a menu is unhidden. manual-chapter-edit.js prepends
//    an item to the chapter menu after render — 73px before, 87px after — so a decision
//    made from the first reading put the menu below the viewport about once in twelve
//    opens. Observing the menu's own size covers that whichever module decorates it
//    first; waiting a frame only bets on the usual order.
//
// 2. Space was measured against the scroll panel alone. A panel can extend past the
//    bottom of the window, so "inside the panel" is not "on screen" — measured at a menu
//    ending 73px below a 900px viewport while still within its 972px panel. The room
//    available is the intersection of the panel and the window, and where there is no
//    scroll panel at all, the window is the only limit.
(function () {
  const ROW_SELECTOR = '.chapter-row, .visual-entry-row, .project-chapter-manager-row';
  const PANEL_SELECTOR = '.source-panel, .visual-entry-list-panel';
  const GAP = 8;
  const ANCHOR_OFFSET = 20;

  const observers = new WeakMap();

  function position(menu) {
    const row = menu?.closest(ROW_SELECTOR);
    if (!row || menu.hidden) return;
    menu.classList.remove('opens-up');

    const panel = menu.closest(PANEL_SELECTOR);
    const panelRect = panel?.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const limitTop = Math.max(panelRect ? panelRect.top : 0, 0);
    const limitBottom = Math.min(panelRect ? panelRect.bottom : viewportHeight, viewportHeight);

    const rowRect = row.getBoundingClientRect();
    const anchor = rowRect.top + rowRect.height / 2;
    const menuHeight = menu.getBoundingClientRect().height;
    const spaceBelow = limitBottom - (anchor + ANCHOR_OFFSET);
    const spaceAbove = (anchor - ANCHOR_OFFSET) - limitTop;

    if (spaceBelow < menuHeight + GAP && spaceAbove >= menuHeight + GAP) {
      menu.classList.add('opens-up');
    }
  }

  // Reposition while the menu is open: its contents, and the room around it, can both
  // change after it appears.
  function open(menu) {
    if (!menu) return;
    position(menu);
    if (typeof ResizeObserver !== 'function' || observers.has(menu)) return;
    const observer = new ResizeObserver(() => position(menu));
    observer.observe(menu);
    observers.set(menu, observer);
  }

  function close(menu) {
    const observer = observers.get(menu);
    if (!observer) return;
    observer.disconnect();
    observers.delete(menu);
  }

  window.StoryFlowAnchoredMenu = { position, open, close };
})();
