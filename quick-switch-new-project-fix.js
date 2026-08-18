// Keep the quick-switch menu's "新增作品" action present after the legacy renderer
// rebuilds the menu on every open.
(function () {
  function closeQuickSwitch() {
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    if (menu) menu.hidden = true;
    document.getElementById('quickSwitchProjectBtn')?.setAttribute('aria-expanded', 'false');
  }

  function createNewProject(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    window.StoryFlowProjects?.createProject?.({ title: '未命名作品' });
    closeQuickSwitch();
    window.setTimeout(() => {
      window.StoryFlowProjectSourceModeV2?.syncUi?.();
      const input = document.getElementById('projectTitle');
      if (window.StoryFlowProjectSourceModeV2?.mode?.()) {
        input?.focus();
        input?.select();
      }
    }, 0);
  }

  function ensureNewProjectAction() {
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    if (!menu || menu.hidden) return;

    let add = document.getElementById('workspaceQuickNewProject');
    if (!add) {
      add = document.createElement('button');
      add.id = 'workspaceQuickNewProject';
      add.type = 'button';
      add.className = 'workspace-project-quick-switch-new';
      add.innerHTML = '<span aria-hidden="true">＋</span><strong>新增作品</strong>';
      add.addEventListener('click', createNewProject);
    }

    const title = menu.querySelector('.workspace-project-quick-switch-title');
    if (add.parentElement !== menu) {
      if (title) title.insertAdjacentElement('afterend', add);
      else menu.prepend(add);
    }
  }

  function bindToggle() {
    const button = document.getElementById('quickSwitchProjectBtn');
    if (!button || button.dataset.newProjectFixBound === '1') return;
    button.dataset.newProjectFixBound = '1';
    button.addEventListener('click', () => window.setTimeout(ensureNewProjectAction, 0));
  }

  function sync() {
    bindToggle();
    ensureNewProjectAction();
  }

  function loadChapterManagement() {
    if (document.getElementById('storyflowChapterManagementV2Js')) return;
    const script = document.createElement('script');
    script.id = 'storyflowChapterManagementV2Js';
    script.src = './chapter-management-v2.js?v=20260818-1538';
    script.async = false;
    document.body.appendChild(script);
  }

  function loadProjectProgressBadges() {
    if (document.getElementById('storyflowProjectProgressBadgesV1Js')) return;
    const script = document.createElement('script');
    script.id = 'storyflowProjectProgressBadgesV1Js';
    script.src = './project-progress-badges-v1.js?v=20260818-1741';
    script.async = false;
    document.body.appendChild(script);
  }

  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(sync, 0));
  window.addEventListener('storyflow:view-changed', () => window.setTimeout(sync, 0));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeQuickSwitch();
  });

  sync();
  loadChapterManagement();
  loadProjectProgressBadges();
})();
