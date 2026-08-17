// Primary navigation: workspace, works, and publishing are separate app views.
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

  let currentView = 'workspace';
  let lastNonSettingsView = 'workspace';

  function workspaceView() { return document.getElementById('workspaceView'); }
  function projectsView() { return document.getElementById('projectsView'); }
  function publishingView() { return document.getElementById('publishingView'); }

  function installNavHints() {
    nav.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('span')?.textContent?.trim();
      if (!label) return;
      item.dataset.hint = label;
      item.setAttribute('aria-label', label);
    });
  }

  function setActive(view) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const active = item.dataset.view === view;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    if (view !== 'settings') lastNonSettingsView = view;
  }

  function hideAllViews() {
    const workspace = workspaceView();
    const projects = projectsView();
    const publishing = publishingView();
    if (workspace) workspace.hidden = true;
    if (projects) projects.hidden = true;
    if (publishing) publishing.hidden = true;
  }

  function showWorkspace() {
    hideAllViews();
    const workspace = workspaceView();
    if (workspace) workspace.hidden = false;
  }

  function showProjects() {
    hideAllViews();
    window.StoryFlowRenderProjects?.();
    const projects = projectsView();
    if (projects) projects.hidden = false;
  }

  function showPublishing() {
    hideAllViews();
    const publishing = publishingView();
    if (publishing) publishing.hidden = false;
    window.renderParts?.();
  }

  function goTo(view) {
    if (view === 'publishing') {
      currentView = 'publishing';
      showPublishing();
      setActive('publishing');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (view === 'projects') {
      currentView = 'projects';
      showProjects();
      setActive('projects');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    currentView = 'workspace';
    showWorkspace();
    setActive('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  window.StoryFlowCurrentView = () => currentView;

  installNavHints();
  ensureSidebarToggle();
  goTo('workspace');
})();
