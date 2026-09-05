// Workspace UX: quick work switching, clearer manual-source state,
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

  function sourceScopes() {
    try { return typeof state !== 'undefined' && Array.isArray(state.sourceScopes) ? state.sourceScopes : []; }
    catch (_) { return []; }
  }

  function hasGoogleSource() {
    if (sourceScopes().some(scope => scope?.docId && scope?.tabId)) return true;
    return chapters().some(chapter => [chapter?.source, chapter?.detachedSource]
      .some(source => source?.id && source?.tabId));
  }

  function ensureSidebarUtilityIcons() {
    const logout = document.getElementById('sidebarLogoutBtn');

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

  // The status dot carries the state; the visible text only names the service.
  // Keep the full signed-in / connected wording in aria-label/title from connection-ui.
  function syncSidebarConnectionLabels() {
    const labels = [
      ['sidebarGoogleConnection', 'Google'],
      ['sidebarFolderConnection', '資料夾']
    ];
    labels.forEach(([id, label]) => {
      const button = document.getElementById(id);
      const small = button?.querySelector('small');
      if (small && small.textContent !== label) small.textContent = label;
    });
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
      button.innerHTML = '<span>切換作品</span><span class="sf-chevron" aria-hidden="true"></span>';
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', event => {
        event.stopPropagation();
        toggleQuickSwitch();
      });
    }

    // Header utilities belong to the same row. Keeping the legacy + button as a
    // sibling of panel-head forced it onto a separate grid row and made the card
    // look broken whenever the source actions were also present.
    let actions = row.querySelector('.source-heading-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'source-heading-actions';
      row.appendChild(actions);
    }
    if (button.parentElement !== actions) actions.appendChild(button);

    const addChapter = document.getElementById('newChapterBtn');
    if (addChapter) {
      addChapter.classList.add('source-heading-add-btn');
      addChapter.title = '新增章節';
      addChapter.setAttribute('aria-label', '新增章節');
      if (addChapter.parentElement !== actions) actions.appendChild(addChapter);
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

    const linked = hasGoogleSource();
    let hint = document.getElementById('manualSourceSyncHint');
    actions.classList.toggle('has-linked-source', linked);
    actions.classList.toggle('manual-only-source', !linked);

    if (!linked) {
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
      hint?.remove();
      refresh.hidden = false;
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
    syncSidebarConnectionLabels();
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

  // connection-ui also reacts to these four source nodes. Watch only the same narrow
  // signals so its status-copy refresh cannot leave the visible service names stale.
  const connectionSignals = [
    document.getElementById('googleStatus'),
    document.getElementById('folderStatus'),
    document.getElementById('googleDot'),
    document.getElementById('folderDot')
  ].filter(Boolean);
  const connectionLabelObserver = new MutationObserver(() => queueMicrotask(syncSidebarConnectionLabels));
  connectionSignals.forEach(node => connectionLabelObserver.observe(node, {
    childList:true, subtree:true, attributes:true, characterData:true
  }));

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function' && !baseRenderAll.__storyflowWorkspaceUx) {
    const refinedRenderAll = function (...args) {
      const result = baseRenderAll.apply(this, args);
      queueMicrotask(syncAll);
      return result;
    };
    refinedRenderAll.__storyflowWorkspaceUx = true;
    window.renderAll = refinedRenderAll;
  }

  syncAll();
})();
