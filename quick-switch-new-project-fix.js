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

// Final hierarchy pass: keep context compact and move infrequent Smart Split preferences
// behind an explicit disclosure instead of competing with the article preview.
(function () {
  function hasSplitContent() {
    try {
      return Array.isArray(state?.chapters) && state.chapters.some(chapter => Boolean(chapter?.draft));
    } catch (_) {
      return Boolean(document.getElementById('draft')?.value);
    }
  }

  function markProgressPriority() {
    document.querySelectorAll('.stat-card').forEach(card => {
      card.classList.toggle('stat-card-primary', Boolean(card.querySelector('#remainingChars')));
    });
  }

  function ensureSplitPreferencesToggle() {
    const panel = document.querySelector('.splitter-panel');
    const head = panel?.querySelector(':scope > .panel-head');
    const settings = document.getElementById('smartSplitMiniSettings');
    if (!panel || !head || !settings) return;

    let actions = head.querySelector('.smart-split-header-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'smart-split-header-actions';
      head.appendChild(actions);
    }

    let toggle = document.getElementById('splitPreferencesToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'splitPreferencesToggle';
      toggle.type = 'button';
      toggle.textContent = '切篇偏好';
      toggle.setAttribute('aria-controls', 'smartSplitMiniSettings');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const open = !panel.classList.contains('split-preferences-open');
        panel.classList.toggle('split-preferences-open', open);
        toggle.setAttribute('aria-expanded', String(open));
      });
    }

    const review = document.getElementById('openSplitReviewBtn');
    if (toggle.parentElement !== actions) {
      if (review?.parentElement === actions) actions.insertBefore(toggle, review);
      else actions.prepend(toggle);
    } else if (review?.parentElement === actions && toggle.nextElementSibling !== review) {
      actions.insertBefore(toggle, review);
    }

    const available = hasSplitContent();
    toggle.hidden = !available;
    if (!available) {
      panel.classList.remove('split-preferences-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function syncHierarchy() {
    markProgressPriority();
    ensureSplitPreferencesToggle();
  }

  window.addEventListener('storyflow:projects-changed', () => queueMicrotask(syncHierarchy));
  window.addEventListener('storyflow:view-changed', () => queueMicrotask(syncHierarchy));

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function' && !baseRenderAll.__storyflowHierarchyRefined) {
    const refinedRenderAll = function (...args) {
      const result = baseRenderAll.apply(this, args);
      queueMicrotask(syncHierarchy);
      return result;
    };
    refinedRenderAll.__storyflowHierarchyRefined = true;
    window.renderAll = refinedRenderAll;
  }

  const observer = new MutationObserver(() => queueMicrotask(syncHierarchy));
  const splitter = document.querySelector('.splitter-panel');
  if (splitter) observer.observe(splitter, { childList:true, subtree:true });

  syncHierarchy();
})();
