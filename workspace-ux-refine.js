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

  function chapters() {
    try { return typeof state !== 'undefined' ? (state.chapters || []) : []; }
    catch (_) { return []; }
  }

  function hasGoogleSource() {
    return chapters().some(chapter => chapter?.source?.id && chapter?.source?.tabId);
  }

  function ensureSidebarUtilityIcons() {
    const settings = document.getElementById('sidebarSettingsBtn');
    const logout = document.getElementById('sidebarLogoutBtn');

    const settingsIcon = settings?.querySelector(':scope > span[aria-hidden="true"]');
    if (settingsIcon && !settingsIcon.querySelector('svg')) {
      settingsIcon.className = 'sidebar-utility-icon';
      settingsIcon.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>`;
    }

    const logoutIcon = logout?.querySelector(':scope > span[aria-hidden="true"]');
    if (logoutIcon && !logoutIcon.querySelector('svg')) {
      logoutIcon.className = 'sidebar-utility-icon';
      logoutIcon.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>`;
    }
  }

  function ensureQuickSwitch() {
    const panel = document.querySelector('.source-panel');
    const head = panel?.querySelector(':scope > .panel-head');
    const titleBlock = head?.querySelector(':scope > div:first-child');
    const h2 = titleBlock?.querySelector('h2');
    if (!panel || !head || !titleBlock || !h2) return;

    let row = titleBlock.querySelector('.source-heading-title-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'source-heading-title-row';
      h2.replaceWith(row);
      row.appendChild(h2);
    }

    let button = document.getElementById('quickSwitchProjectBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'quickSwitchProjectBtn';
      button.className = 'quick-switch-project-btn';
      button.type = 'button';
      button.textContent = '切換作品';
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');
      row.appendChild(button);
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
    menu.innerHTML = '<div class="workspace-project-quick-switch-title">切換作品</div>';

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
        setTimeout(syncAll, 0);
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
        hint.textContent = '手動文章沒有可同步來源';
        hint.title = '手動新增的文章沒有連結 Google Docs，因此不需要「更新作品來源」。';
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
    if (formatLabel && formatLabel.textContent) {
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
    ensureSidebarUtilityIcons();
    ensureQuickSwitch();
    syncSourceActionHint();
    tidyReviewToolbar();
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('#workspaceProjectQuickSwitch, #quickSwitchProjectBtn')) closeQuickSwitch();
    if (event.target.closest?.('#openSplitReviewBtn')) setTimeout(tidyReviewToolbar, 0);
  });
  window.addEventListener('storyflow:projects-changed', () => setTimeout(syncAll, 0));
  window.addEventListener('storyflow:connection-changed', syncAll);

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function' && !baseRenderAll.__storyflowUxRefined) {
    const refinedRenderAll = function (...args) {
      const result = baseRenderAll.apply(this, args);
      queueMicrotask(syncAll);
      return result;
    };
    refinedRenderAll.__storyflowUxRefined = true;
    window.renderAll = refinedRenderAll;
  }

  syncAll();
})();
