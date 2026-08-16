// Primary navigation for the single-page StoryFlow workspace.
(function () {
  if (!document.querySelector('link[data-storyflow-sidebar-layout]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './sidebar-layout.css';
    link.dataset.storyflowSidebarLayout = '1';
    document.head.appendChild(link);
  }

  const nav = document.querySelector('.nav');
  const sidebar = document.querySelector('.sidebar');
  const shell = document.querySelector('.app-shell');
  if (!nav || !sidebar || !shell) return;

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

    const hadTabIndex = target.hasAttribute('tabindex');
    if (!hadTabIndex) target.setAttribute('tabindex', '-1');
    window.setTimeout(() => {
      try { target.focus({ preventScroll: true }); } catch (_) {}
      if (!hadTabIndex) window.setTimeout(() => target.removeAttribute('tabindex'), 500);
    }, 350);
  }

  function ensureSidebarToggle() {
    let toggle = document.getElementById('sidebarToggle');
    if (toggle) return toggle;

    toggle = document.createElement('button');
    toggle.id = 'sidebarToggle';
    toggle.className = 'sidebar-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', '收合左側選單');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.title = '收合選單';
    toggle.innerHTML = '<span aria-hidden="true">‹</span>';
    sidebar.appendChild(toggle);

    toggle.addEventListener('click', () => {
      const collapsed = shell.classList.toggle('sidebar-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? '展開左側選單' : '收合左側選單');
      toggle.title = collapsed ? '展開選單' : '收合選單';
      toggle.innerHTML = `<span aria-hidden="true">${collapsed ? '›' : '‹'}</span>`;
    });

    return toggle;
  }

  nav.addEventListener('click', event => {
    const button = event.target.closest('.nav-item');
    if (!button) return;
    const view = button.dataset.view;

    if (view === 'settings') {
      setActive('settings');
      return;
    }

    event.preventDefault();
    goTo(view);
  });

  const settingsDialog = document.getElementById('settingsDialog');
  settingsDialog?.addEventListener('close', () => setActive(lastNonSettingsView));

  window.StoryFlowNavigate = goTo;

  ensureSidebarToggle();
  setActive(document.querySelector('.nav-item.active')?.dataset.view || 'workspace');
})();
