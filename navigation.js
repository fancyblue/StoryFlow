// Primary navigation: workspace, works, publishing, and settings are separate app views.
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

  const INTEGRATION_SESSION_KEY = 'storyflow.integration-bootstrap.v1';
  let currentView = 'workspace';
  let lastInputWasKeyboard = false;
  const viewLabels = {
    workspace: '工作台',
    projects: '作品',
    publishing: '發布',
    settings: '設定'
  };

  window.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) lastInputWasKeyboard = true;
  }, true);
  window.addEventListener('pointerdown', () => { lastInputWasKeyboard = false; }, true);

  function workspaceView() { return document.getElementById('workspaceView'); }
  function projectsView() { return document.getElementById('projectsView'); }
  function publishingView() { return document.getElementById('publishingView'); }
  function settingsView() { return document.getElementById('settingsView'); }
  function prefersReducedMotion() { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; }

  function installNavHints() {
    nav.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.nav-label')?.textContent?.trim()
        || item.querySelector('span:last-child')?.textContent?.trim();
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
    const settingsButton = document.getElementById('sidebarSettingsBtn');
    settingsButton?.classList.toggle('active', view === 'settings');
    if (settingsButton) {
      if (view === 'settings') settingsButton.setAttribute('aria-current', 'page');
      else settingsButton.removeAttribute('aria-current');
    }
  }

  function hideAllViews() {
    [workspaceView(), projectsView(), publishingView(), settingsView()].forEach(view => {
      if (view) view.hidden = true;
    });
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

  function showSettings() {
    hideAllViews();
    const settings = settingsView();
    if (settings) settings.hidden = false;
    try {
      const picker = document.getElementById('pickerApiKeyInput');
      if (picker) picker.value = StoryFlowIntegrations.pickerApiKey();
      window.renderFormattingSettings?.();
      window.StoryFlowSettingsBootstrap?.sync?.();
    } catch (_) {}
  }

  function currentViewNode() {
    if (currentView === 'projects') return projectsView();
    if (currentView === 'publishing') return publishingView();
    if (currentView === 'settings') return settingsView();
    return workspaceView();
  }

  function finishViewChange() {
    document.title = `${viewLabels[currentView] || 'StoryFlow'} · StoryFlow`;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

    // Keyboard users should land at the new page heading; pointer users keep their
    // current focus so changing pages never feels like the UI unexpectedly grabs it.
    if (lastInputWasKeyboard) {
      const heading = currentViewNode()?.querySelector('h1');
      if (heading) {
        heading.tabIndex = -1;
        requestAnimationFrame(() => heading.focus({ preventScroll: true }));
      }
    }

    window.dispatchEvent(new CustomEvent('storyflow:view-changed', { detail: { view: currentView } }));
  }

  function goTo(view) {
    if (view === 'publishing') {
      currentView = 'publishing';
      showPublishing();
      setActive('publishing');
    } else if (view === 'projects') {
      currentView = 'projects';
      showProjects();
      setActive('projects');
    } else if (view === 'settings') {
      currentView = 'settings';
      showSettings();
      setActive('settings');
    } else {
      currentView = 'workspace';
      showWorkspace();
      setActive('workspace');
    }
    finishViewChange();
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

  function hasIntegrationSettings() {
    if (String(window.STORYFLOW_CONFIG?.googleClientId || '').trim()) return true;
    try {
      return Boolean(sessionStorage.getItem(INTEGRATION_SESSION_KEY));
    } catch (_) {
      return false;
    }
  }

  function closeProjectQuickSwitch() {
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    if (menu) menu.hidden = true;
    document.getElementById('quickSwitchProjectBtn')?.setAttribute('aria-expanded', 'false');
  }

  function requireSettingsForNewWork() {
    closeProjectQuickSwitch();
    const message = '請先載入 StoryFlow 設定，完成後才能新增作品。';
    if (window.StoryFlowSourceOnboarding?.showSettings) {
      window.StoryFlowSourceOnboarding.showSettings(message);
      return;
    }
    window.notify?.(message);
    goTo('settings');
  }

  function startNewWorkFlow() {
    if (!hasIntegrationSettings()) {
      requireSettingsForNewWork();
      return false;
    }

    const project = window.StoryFlowProjects?.createProject?.({ title: '未命名作品' });
    if (!project) return false;

    closeProjectQuickSwitch();
    goTo('workspace');
    requestAnimationFrame(() => {
      window.StoryFlowProjectSourceModeV2?.syncUi?.();
      window.StoryFlowSourceOnboarding?.openSourceChooser?.({ creation: true });
    });
    return true;
  }

  nav.addEventListener('click', event => {
    const button = event.target.closest('.nav-item');
    if (!button) return;
    event.preventDefault();
    goTo(button.dataset.view);
  });

  // Every user-facing "new work" entry point follows one guarded flow. Capture phase
  // prevents older per-button handlers from creating a blank work before settings exist.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || !['projectsNewWorkBtn', 'workspaceQuickNewProject', 'newProjectBtn'].includes(button.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startNewWorkFlow();
  }, true);

  window.StoryFlowNavigate = goTo;
  window.StoryFlowCurrentView = () => currentView;
  window.StoryFlowStartNewWork = startNewWorkFlow;

  installNavHints();
  ensureSidebarToggle();
  goTo('workspace');
})();
