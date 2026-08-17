// Final workspace UX refinements: quick work switching, clearer manual-source state,
// and a cleaner Smart Split review toolbar.
(function () {
  function projectList() {
    try { return window.StoryFlowProjects?.list?.() || []; }
    catch (_) { return []; }
  }

  function activeProjectId() {
    try { return window.StoryFlowProjects?.activeId?.() || ''; }
    catch (_) { return ''; }
  }

  function hasGoogleSource() {
    return Boolean((window.state?.chapters || []).some(chapter =>
      chapter?.source?.id && chapter?.source?.tabId
    ));
  }

  function ensureQuickSwitch() {
    const panel = document.querySelector('.source-panel');
    const head = panel?.querySelector(':scope > .panel-head');
    if (!panel || !head) return;

    let actions = head.querySelector('.source-heading-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'source-heading-actions';
      const sourceActions = document.getElementById('sourcePanelActions');
      if (sourceActions && sourceActions.parentElement === head) {
        head.insertBefore(actions, sourceActions);
        actions.appendChild(sourceActions);
      } else {
        head.appendChild(actions);
      }
    }

    let button = document.getElementById('quickSwitchProjectBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'quickSwitchProjectBtn';
      button.className = 'button tiny ghost quick-switch-project-btn';
      button.type = 'button';
      button.textContent = '切換作品';
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');
      actions.insertBefore(button, actions.firstChild);
      button.addEventListener('click', event => {
        event.stopPropagation();
        toggleQuickSwitch();
      });
    }
  }

  function renderQuickSwitch() {
    const panel = document.querySelector('.source-panel');
    if (!panel) return null;
    let menu = document.getElementById('workspaceProjectQuickSwitch');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'workspaceProjectQuickSwitch';
      menu.className = 'workspace-project-quick-switch';
      menu.hidden = true;
      panel.appendChild(menu);
    }

    const projects = projectList();
    const activeId = activeProjectId();
    menu.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'workspace-project-quick-switch-title';
    title.textContent = '切換作品';
    menu.appendChild(title);

    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'workspace-project-quick-switch-empty';
      empty.textContent = '目前沒有其他作品';
      menu.appendChild(empty);
      return menu;
    }

    projects.forEach(project => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `workspace-project-quick-switch-item${project.id === activeId ? ' active' : ''}`;
      item.innerHTML = `<span>${escapeHtml(project.title || '未命名作品')}</span>${project.id === activeId ? '<small>目前</small>' : ''}`;
      item.disabled = project.id === activeId;
      item.addEventListener('click', () => {
        window.StoryFlowProjects?.switchProject?.(project.id);
        closeQuickSwitch();
      });
      menu.appendChild(item);
    });
    return menu;
  }

  function toggleQuickSwitch() {
    const menu = renderQuickSwitch();
    const button = document.getElementById('quickSwitchProjectBtn');
    if (!menu || !button) return;
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  }

  function closeQuickSwitch() {
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    const button = document.getElementById('quickSwitchProjectBtn');
    if (menu) menu.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
  }

  function syncSourceActionHint() {
    const actions = document.getElementById('sourcePanelActions');
    const refresh = document.getElementById('refreshSourceBtn');
    if (!actions || !refresh) return;

    let hint = document.getElementById('manualSourceSyncHint');
    if (!hasGoogleSource()) {
      refresh.hidden = true;
      refresh.disabled = true;
      if (!hint) {
        hint = document.createElement('span');
        hint.id = 'manualSourceSyncHint';
        hint.className = 'manual-source-sync-hint';
        hint.textContent = '手動文章沒有可同步的 Google Docs 來源';
        actions.insertBefore(hint, actions.firstChild);
      }
      hint.hidden = false;
    } else {
      if (hint) hint.hidden = true;
      refresh.hidden = false;
      refresh.disabled = false;
      refresh.title = '比較整個作品與已連結 Google Docs 的差異';
    }
  }

  function tidyReviewToolbar() {
    const dialog = document.getElementById('reviewDialog');
    if (!dialog) return;

    const formatLabel = dialog.querySelector('.review-format-bar .platform-select-field > span');
    if (formatLabel) {
      formatLabel.textContent = '';
      formatLabel.setAttribute('aria-hidden', 'true');
    }
    const select = document.getElementById('reviewPlatformSelect');
    if (select) select.setAttribute('aria-label', '預覽格式');

    const controls = document.getElementById('reviewBoundaryControls');
    const currentHead = dialog.querySelector('.review-column.current .review-column-head');
    if (controls && currentHead && controls.parentElement !== currentHead) {
      currentHead.appendChild(controls);
    }
  }

  function syncAll() {
    ensureQuickSwitch();
    syncSourceActionHint();
    tidyReviewToolbar();
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('#workspaceProjectQuickSwitch, #quickSwitchProjectBtn')) closeQuickSwitch();
    if (event.target.closest?.('#openSplitReviewBtn')) setTimeout(tidyReviewToolbar, 0);
  });
  window.addEventListener('storyflow:projects-changed', () => {
    syncAll();
    if (!document.getElementById('workspaceProjectQuickSwitch')?.hidden) renderQuickSwitch();
  });
  window.addEventListener('storyflow:connection-changed', syncSourceActionHint);

  const observer = new MutationObserver(() => {
    // Observe only for lazily created dialogs / re-rendered source actions; the work is idempotent.
    syncAll();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  syncAll();
})();
