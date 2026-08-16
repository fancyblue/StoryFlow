// Primary navigation for the single-page StoryFlow workspace.
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const targets = {
    workspace: () => document.querySelector('.workspace-grid'),
    projects: () => document.querySelector('.source-panel'),
    publishing: () => document.querySelector('.publishing-panel')
  };

  let lastNonSettingsView = 'workspace';

  function setActive(view) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const active = item.dataset.view === view;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    if (view !== 'settings') lastNonSettingsView = view;
  }

  function goTo(view) {
    const getTarget = targets[view];
    const target = getTarget?.();
    if (!target) return;

    setActive(view);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Give keyboard/screen-reader users a real navigation destination without
    // permanently changing the document tab order.
    const hadTabIndex = target.hasAttribute('tabindex');
    if (!hadTabIndex) target.setAttribute('tabindex', '-1');
    window.setTimeout(() => {
      try { target.focus({ preventScroll: true }); } catch (_) {}
      if (!hadTabIndex) window.setTimeout(() => target.removeAttribute('tabindex'), 500);
    }, 350);
  }

  nav.addEventListener('click', event => {
    const button = event.target.closest('.nav-item');
    if (!button) return;
    const view = button.dataset.view;

    // Settings keeps using the existing openSettings() handler.
    if (view === 'settings') {
      setActive('settings');
      return;
    }

    event.preventDefault();
    goTo(view);
  });

  const settingsDialog = document.getElementById('settingsDialog');
  settingsDialog?.addEventListener('close', () => setActive(lastNonSettingsView));

  // Expose a tiny helper for other StoryFlow UI surfaces that may need to
  // navigate to a primary section later.
  window.StoryFlowNavigate = goTo;

  setActive(document.querySelector('.nav-item.active')?.dataset.view || 'workspace');
})();
