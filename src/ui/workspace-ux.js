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
    ensureQuickSwitch();
    const panel = document.querySelector('.source-panel');
    if (!panel) return null;
    let menu = document.getElementById('workspaceProjectQuickSwitch');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'workspaceProjectQuickSwitch';
      menu.className = 'workspace-project-quick-switch';
      menu.hidden = true;
    }
    // The menu is positioned against the button it belongs to, so it has to live beside
    // it. Hanging it off the panel meant its offset had to restate the heading's height.
    const host = panel.querySelector('.source-heading-actions') || panel;
    if (menu.parentElement !== host) host.appendChild(menu);

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

  function tidyReviewToolbar() {
    const view = document.getElementById('readingView');
    if (!view) return;

    // The select sits next to the view switch, so its visible label would read as a second
    // control name. The accessible name stays on the control itself.
    const formatLabel = view.querySelector('.reading-view-controls .platform-select-field > span');
    if (formatLabel && formatLabel.textContent) {
      formatLabel.textContent = '';
      formatLabel.setAttribute('aria-hidden', 'true');
    }
    const select = document.getElementById('readingPlatformSelect');
    if (select) select.setAttribute('aria-label', '預覽格式');
  }

  function syncAll() {
    ensureSidebarUtilityIcons();
    syncSidebarConnectionLabels();
    ensureQuickSwitch();
    tidyReviewToolbar();
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('#workspaceProjectQuickSwitch, #quickSwitchProjectBtn')) closeQuickSwitch();
    if (event.target.closest?.('#openReadingViewBtn')) setTimeout(tidyReviewToolbar, 0);
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

  // 【待補】／【待確認】 in the article being cut (REDESIGN_PROPOSAL B3). The count sits beside the
  // split status, in the same pill shape; pressing it selects the next mark in the preview, so
  // the writer lands on it instead of reading for it. It is a reminder, never a block.
  let lastMarkIndex = -1;
  function previewMarks() {
    const root = document.getElementById('preview');
    if (!root) return [];
    const marks = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const pattern = /【待(?:補|確認)[^】\n]{0,40}】?/g;
      for (let match = pattern.exec(node.data); match; match = pattern.exec(node.data)) {
        marks.push({ node, start: match.index, end: match.index + match[0].length });
      }
    }
    return marks;
  }

  // The preview redraws itself when the work is saved or its settings settle, which replaces
  // the text a selection lives in. A jump made just before that is made again on the new text,
  // for a few seconds only, so it never takes over a selection the writer makes afterwards.
  let lastJumpAt = 0;
  function selectMark(index) {
    const marks = previewMarks();
    if (!marks.length) return;
    const { node, start, end } = marks[index % marks.length];
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function jumpToNextMark() {
    const marks = previewMarks();
    if (!marks.length) return;
    lastMarkIndex = (lastMarkIndex + 1) % marks.length;
    lastJumpAt = Date.now();
    selectMark(lastMarkIndex);
    marks[lastMarkIndex].node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  const previewNode = document.getElementById('preview');
  if (previewNode) {
    new MutationObserver(() => {
      if (lastMarkIndex < 0 || Date.now() - lastJumpAt > 4000) return;
      const selection = window.getSelection();
      if (selection.rangeCount && previewNode.contains(selection.anchorNode) && String(selection)) return;
      selectMark(lastMarkIndex);
    }).observe(previewNode, { childList: true, subtree: true, characterData: true });
  }

  function syncPendingMarks() {
    const status = document.getElementById('suggestionStatus');
    if (!status) return;
    const current = typeof suggestion === 'undefined' ? null : suggestion;
    const count = current ? window.StoryFlowShared.pendingMarkCount(current.formatted || current.raw || '') : 0;
    let pill = document.getElementById('suggestionPendingMarks');
    if (!count) {
      pill?.remove();
      lastMarkIndex = -1;
      return;
    }
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'suggestionPendingMarks';
      pill.type = 'button';
      pill.className = 'pill sf-pending-pill';
      pill.addEventListener('click', jumpToNextMark);
      status.after(pill);
    }
    const label = `${count.toLocaleString()} 處待補／待確認`;
    if (pill.textContent !== label) pill.textContent = label;
    pill.title = '跳到下一處【待補】／【待確認】';
    pill.setAttribute('aria-label', `${label}，跳到下一處`);
  }

  StoryFlowRender.after('renderSuggestion', 'workspace-ux', () => { lastMarkIndex = -1; syncPendingMarks(); });
  StoryFlowRender.after('renderAll', 'workspace-ux', () => queueMicrotask(syncAll));

  syncAll();
})();
