// Work-type chooser and the placeholder for visual works while visual content is being
// redesigned (docs/REDESIGN_PROPOSAL.md, Phase A). The old visual editor is gone; the new
// one-image-per-article workspace replaces this file in Phase C.
//
// What stays here on purpose:
//   * the "選擇作品類型" dialog, because every work is created through it and the
//     longform route must not change twice. 圖文 is shown, disabled, with its reason.
//   * a read-only notice for any visual work a workspace may still hold. Nothing in it is
//     edited, converted or deleted; Publishing still lists and copies its entries.
(function () {
  const VISUAL_PAUSED_NOTE = '新版圖文製作中，完成前暫時無法建立圖文作品。';

  function isVisual() {
    return state?.contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL;
  }

  function hasLongformContent() {
    return Array.isArray(state?.chapters)
      && state.chapters.some(chapter => Boolean(String(chapter?.draft || '').trim()) || Boolean(chapter?.parts?.length));
  }

  function syncSharedWorkspaceHeader(visualMode) {
    const header = document.querySelector('#workspaceView > .topbar');
    if (!header) return;
    header.hidden = false;
    header.classList.toggle('visual-workspace-mode', visualMode);

    const title = header.querySelector('h1');
    if (title) title.textContent = visualMode ? '圖文工作台' : '內容發布工作台';

    const saveStatus = document.getElementById('saveState');
    const save = document.getElementById('saveBtn');
    const generate = document.getElementById('generateBtn');
    if (saveStatus) saveStatus.hidden = visualMode;
    if (save) save.hidden = visualMode || !hasLongformContent();
    if (generate) generate.hidden = visualMode || !hasLongformContent();
  }

  function ensureWorkspace() {
    const workspaceView = document.getElementById('workspaceView');
    if (!workspaceView) return null;
    let visual = document.getElementById('visualWorkspace');
    if (visual) return visual;
    visual = document.createElement('section');
    visual.id = 'visualWorkspace';
    visual.className = 'visual-workspace';
    visual.hidden = true;
    visual.innerHTML = `
      <div class="empty-state visual-paused-state">
        <strong id="visualPausedTitle"></strong>
        <span>新版圖文完成前，舊版圖文暫時無法在工作台編輯。作品與內容都完整保留在 StoryFlow 資料夾，「發布」仍可預覽與複製。</span>
        <button id="visualPausedWorksBtn" class="button ghost" type="button">前往作品</button>
      </div>`;
    workspaceView.appendChild(visual);
    visual.querySelector('#visualPausedWorksBtn')
      .addEventListener('click', () => window.StoryFlowNavigate?.('projects'));
    return visual;
  }

  function ensureTypeDialog() {
    let dialog = document.getElementById('visualTypeDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'visualTypeDialog';
    dialog.className = 'visual-type-dialog';
    dialog.setAttribute('aria-labelledby', 'visualTypeDialogTitle');
    // A disabled option states its reason in text beside itself (UX_FLOW W-06b), not only
    // in a title: a tooltip is unreachable on touch and on a control that cannot take focus.
    dialog.innerHTML = `<form method="dialog" class="dialog-card">
      <div class="panel-head"><div><h3 id="visualTypeDialogTitle">選擇作品類型</h3></div><button class="icon-button" value="cancel" formnovalidate aria-label="關閉">×</button></div>
      <div id="visualTypeOptions" class="visual-type-options">
        <button id="chooseLongformType" class="visual-type-option" type="button"><strong>長文作品</strong><span>Google Docs／手動來源、Smart Split、切篇確認與發布。</span></button>
        <button id="chooseVisualType" class="visual-type-option" type="button" disabled aria-describedby="visualTypePausedNote"><strong>圖文作品</strong><span id="visualTypePausedNote">${VISUAL_PAUSED_NOTE}</span></button>
      </div>
    </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#chooseLongformType').addEventListener('click', () => {
      dialog.close();
      window.StoryFlowStartNewWork?.({ contentMode: 'longform' });
    });
    return dialog;
  }

  function openTypeChooser() {
    const dialog = ensureTypeDialog();
    dialog.showModal();
    dialog.querySelector('#chooseLongformType').focus();
    return true;
  }

  function render() {
    const root = ensureWorkspace();
    if (!root || !isVisual()) return hide();
    root.querySelector('#visualPausedTitle').textContent = `「${state.projectTitle || '未命名作品'}」是舊版圖文作品`;
    root.hidden = false;
    syncSharedWorkspaceHeader(true);
    document.querySelectorAll('#workspaceView > .workspace-grid').forEach(node => {
      node.hidden = true;
      node.classList.add('visual-workspace-suppressed');
    });
  }

  function hide() {
    const root = document.getElementById('visualWorkspace');
    if (root) root.hidden = true;
    syncSharedWorkspaceHeader(false);
    document.querySelectorAll('#workspaceView > .workspace-grid').forEach(node => {
      node.hidden = false;
      node.classList.remove('visual-workspace-suppressed');
    });
  }

  // Works and Publishing offer "編輯圖文" on an old visual entry; it lands on the notice.
  function openEntry() {
    if (!isVisual()) return false;
    window.StoryFlowNavigate?.('workspace');
    queueMicrotask(render);
    return true;
  }

  window.addEventListener('storyflow:projects-changed', () => {
    if (isVisual()) queueMicrotask(render);
    else hide();
  });
  window.addEventListener('storyflow:view-changed', event => {
    if (event.detail?.view === 'workspace' && isVisual()) queueMicrotask(render);
  });

  // The empty-workspace starters offer Google/manual before a work exists; intercept them
  // so every new work still chooses its type first, and source selection stays the second
  // step for longform.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#createProjectFromGoogle, #createProjectManually');
    if (!button || !window.StoryFlowProjects?.isActivePlaceholder?.()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTypeChooser();
  }, true);

  window.StoryFlowVisualWorkspace = {
    openTypeChooser, openEntry, render, hide,
    flush: () => Promise.resolve(),
    activeEntry: () => null
  };
  if (isVisual()) render();
})();
