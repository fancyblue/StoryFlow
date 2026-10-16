// Rail width: the boundary between the rail on the ground and the work on the paper can be
// dragged. How wide the rail should be depends on the screen and on how long the chapter
// titles run, so the choice belongs to this browser, not to a work, and is kept in
// localStorage like the sidebar collapse and 閱讀設定. Storage can be unavailable (private
// windows, blocked site data); then the choice lasts for the session.
//
// Only the wish is set here, as --sf-rail-user on <html> with [data-rail-width] marking that
// there is one. desktop-responsive.css turns it into --sf-rail-width and keeps the work column
// usable whatever the window does later, so a width chosen on a wide screen never squeezes a
// narrow one. Nothing here touches work data. Double-click or Home goes back to the default.
(function () {
  const STORAGE_KEY = 'storyflow.ui.railWidth';
  const MIN = 240;
  const MAX = 640;
  const STEP = 16;

  let wish = read();
  let drag = null;

  function clamp(value) {
    return Math.min(MAX, Math.max(MIN, Math.round(value)));
  }

  function read() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? clamp(value) : null;
    } catch (_) { return null; }
  }

  function remember() {
    try {
      if (wish === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(wish));
    } catch (_) {}
  }

  function railOf(handle) {
    return handle.parentElement && handle.parentElement.querySelector(':scope > .source-panel');
  }

  function describe(handle) {
    const rail = railOf(handle);
    const width = rail ? Math.round(rail.getBoundingClientRect().width) : wish || 0;
    handle.setAttribute('aria-valuenow', String(width));
  }

  function apply() {
    const root = document.documentElement;
    if (wish === null) {
      root.style.removeProperty('--sf-rail-user');
      root.removeAttribute('data-rail-width');
    } else {
      root.style.setProperty('--sf-rail-user', `${wish}px`);
      root.setAttribute('data-rail-width', '');
    }
    document.querySelectorAll('.sf-rail-resizer').forEach(describe);
  }

  function set(value) {
    wish = value === null ? null : clamp(value);
    apply();
  }

  function currentWidth(handle) {
    const rail = railOf(handle);
    return rail ? rail.getBoundingClientRect().width : (wish || MIN);
  }

  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest && event.target.closest('.sf-rail-resizer');
    if (!handle || event.button !== 0) return;
    const grid = handle.parentElement;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    drag = { handle, left: grid.getBoundingClientRect().left };
    document.body.classList.add('sf-rail-resizing');
  });

  document.addEventListener('pointermove', event => {
    if (!drag) return;
    set(event.clientX - drag.left);
  });

  function endDrag() {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('sf-rail-resizing');
    remember();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  document.addEventListener('dblclick', event => {
    if (!event.target.closest || !event.target.closest('.sf-rail-resizer')) return;
    set(null);
    remember();
  });

  document.addEventListener('keydown', event => {
    const handle = event.target.closest && event.target.closest('.sf-rail-resizer');
    if (!handle) return;
    const step = event.shiftKey ? STEP * 4 : STEP;
    if (event.key === 'ArrowLeft') set(currentWidth(handle) - step);
    else if (event.key === 'ArrowRight') set(currentWidth(handle) + step);
    else if (event.key === 'Home') set(null);
    else return;
    event.preventDefault();
    remember();
  });

  // Visual workspace builds its layout later; describe each handle when it first gets focus
  // so a screen reader hears the current width, and once now for the ones already there.
  document.addEventListener('focusin', event => {
    if (event.target.classList && event.target.classList.contains('sf-rail-resizer')) describe(event.target);
  });

  apply();
  window.StoryFlowRailWidth = Object.freeze({
    get: () => wish,
    set: value => { set(value); remember(); },
    reset: () => { set(null); remember(); }
  });
})();
