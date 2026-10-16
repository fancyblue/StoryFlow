// Workspace project UX keeps the quick-switch menu's "新增作品" action present after the renderer
// rebuilds the menu on every open. This layer also owns the empty-workspace
// onboarding hand-off so it does not depend on a source button that may be removed.
(function () {
  const INTEGRATION_SESSION_KEY = 'storyflow.integration-bootstrap.v1';

  function closeQuickSwitch() {
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    if (menu) menu.hidden = true;
    document.getElementById('quickSwitchProjectBtn')?.setAttribute('aria-expanded', 'false');
  }

  function hasIntegrationSettings() {
    if (String(window.STORYFLOW_CONFIG?.googleClientId || '').trim()) return true;
    try {
      return Boolean(sessionStorage.getItem(INTEGRATION_SESSION_KEY));
    } catch (_) {
      return false;
    }
  }

  function showSettings(message = '請先載入 StoryFlow 設定，再繼續載入來源。') {
    window.StoryFlowNewWorkFlow?.cancel?.();
    document.getElementById('sourceDialog')?.close?.();
    document.getElementById('manualSourceDialog')?.close?.();
    if (message) window.notify?.(message);
    if (typeof window.StoryFlowShowSettings === 'function') {
      window.StoryFlowShowSettings();
      return;
    }
    window.StoryFlowNavigate?.('settings');
  }

  function configureSourceDialog({ creation = false } = {}) {
    const dialog = document.getElementById('sourceDialog');
    if (!dialog) return null;

    const heading = dialog.querySelector('.sticky-dialog-head h3');
    const intro = dialog.querySelector('.source-flow-intro');
    const googleTitle = dialog.querySelector('#sourceGoogleBtn strong');
    const googleCopy = dialog.querySelector('#sourceGoogleBtn span');
    const manualTitle = dialog.querySelector('#sourceManualBtn strong');
    const manualCopy = dialog.querySelector('#sourceManualBtn span');
    const back = dialog.querySelector('#backSourceCreationBtn');

    if (heading) heading.textContent = creation ? '建立作品' : '載入來源';
    if (intro) {
      intro.textContent = creation
        ? '先選擇作品建立方式。Google Docs 會帶入文件內容；手動建立則先新增第一篇文章，完成後可在工作台修改作品名稱。'
        : '先選擇文章來源。內容會先轉成 StoryFlow 可處理的文字並預覽，確認後才加入工作區。';
    }
    if (googleTitle) googleTitle.textContent = creation ? '從 Google Docs 建立' : 'Google Docs';
    if (googleCopy) googleCopy.textContent = creation ? '帶入作品名稱與章節' : '選文件與分頁，再預覽轉換後內容';
    if (manualTitle) manualTitle.textContent = creation ? '手動建立' : '手動新增';
    if (manualCopy) manualCopy.textContent = creation ? '輸入第一篇文章的章節名稱與內容' : '直接輸入章節標題與文章內容';
    dialog.dataset.storyflowCreationMode = creation ? '1' : '0';
    if (back) back.hidden = !creation;
    return dialog;
  }

  function openSourceChooser({ allowManualBeforeSettings = false, creation = false } = {}) {
    if (!creation) window.StoryFlowNewWorkFlow?.cancel?.();
    if (!hasIntegrationSettings() && !allowManualBeforeSettings) {
      showSettings();
      return false;
    }

    const dialog = configureSourceDialog({ creation });
    if (!dialog) return false;
    if (!dialog.open) dialog.showModal();
    return true;
  }

  function openManualCreation() {
    configureSourceDialog({ creation: true });
    return Boolean(window.StoryFlowSourceFlow?.openManualSourceDialog?.({ creation: true }));
  }

  function openGoogleCreation() {
    if (!hasIntegrationSettings()) {
      showSettings('Google Docs 需要先載入 StoryFlow 設定；完成後即可建立作品。');
      return false;
    }
    configureSourceDialog({ creation: true });
    if (typeof window.importGoogleDoc !== 'function') return false;
    window.importGoogleDoc();
    return true;
  }

  function createNewProject(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    window.StoryFlowStartNewWork?.();
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
    if (!button || button.dataset.newProjectBound === '1') return;
    button.dataset.newProjectBound = '1';
    button.addEventListener('click', () => window.setTimeout(ensureNewProjectAction, 0));
  }

  function sync() {
    bindToggle();
    ensureNewProjectAction();
  }

  // The empty workspace CTA opens the source chooser directly. Without integration
  // settings, this CTA routes to Settings as the user expects.
  document.addEventListener('click', event => {
    const target = event.target.closest?.('button');
    if (!target) return;

    if (target.id === 'workspaceLoadSourceBtn') {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Manual work must remain usable without Google integration settings. The
      // Google choice itself is guarded below and routes to Settings when needed.
      openSourceChooser({ allowManualBeforeSettings: true });
      return;
    }

    if ((target.id === 'sourceGoogleBtn' || target.id === 'createProjectFromGoogle') && !hasIntegrationSettings()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showSettings('Google Docs 需要先載入 StoryFlow 設定；完成後即可回來選擇文件。');
    }
  }, true);

  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(sync, 0));
  window.addEventListener('storyflow:view-changed', () => window.setTimeout(sync, 0));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeQuickSwitch();
  });

  sync();

  window.StoryFlowSourceOnboarding = {
    hasIntegrationSettings,
    openSourceChooser,
    openManualCreation,
    openGoogleCreation,
    showSettings
  };
})();

// Final hierarchy pass: the split panel's infrequent settings — 閱讀設定 and 切篇偏好 — sit behind
// one 設定 disclosure instead of a 閱讀設定 icon and a 切篇偏好 button of their own. Two settings
// controls beside the format select and 讀稿檢視 made five controls of equal weight in one row,
// and both are changed far less often than the preview is read. The panel opens as a layer
// under the panel's actions, never in the panel's flow, so opening it moves nothing.
(function () {
  function hasSplitContent() {
    try {
      return Array.isArray(state?.chapters) && state.chapters.some(chapter => Boolean(chapter?.draft));
    } catch (_) {
      return Boolean(document.getElementById('draft')?.value);
    }
  }

  function isOpen() {
    const sheet = document.getElementById('splitSettingsPanel');
    return Boolean(sheet && !sheet.hidden);
  }

  function setOpen(open, { restoreFocus = false } = {}) {
    const toggle = document.getElementById('splitSettingsToggle');
    const sheet = document.getElementById('splitSettingsPanel');
    if (!toggle || !sheet) return;
    sheet.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) sheet.querySelector('button:not(:disabled), input')?.focus({ preventScroll: true });
    else if (restoreFocus) toggle.focus({ preventScroll: true });
  }

  function buildSheet() {
    const sheet = document.createElement('div');
    sheet.id = 'splitSettingsPanel';
    sheet.className = 'split-settings-panel';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', '設定');
    sheet.hidden = true;
    sheet.innerHTML = `
      <section class="split-settings-section">
        <h3 id="splitSettingsReadingTitle">閱讀設定</h3>
        <div id="splitSettingsReading" class="split-settings-reading" role="group" aria-labelledby="splitSettingsReadingTitle"></div>
      </section>
      <section class="split-settings-section">
        <h3 id="splitSettingsSplitTitle">切篇偏好</h3>
      </section>`;
    sheet.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false, { restoreFocus: true });
    });
    return sheet;
  }

  function ensureSplitSettings() {
    const panel = document.querySelector('.splitter-panel');
    const head = panel?.querySelector(':scope > .panel-head');
    const preferences = document.getElementById('smartSplitMiniSettings');
    if (!panel || !head || !preferences) return;

    let actions = head.querySelector('.smart-split-header-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'smart-split-header-actions';
      head.appendChild(actions);
    }

    let toggle = document.getElementById('splitSettingsToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'splitSettingsToggle';
      toggle.type = 'button';
      toggle.className = 'button tiny ghost sf-quiet';
      toggle.innerHTML = '<span>設定</span><span class="sf-chevron" aria-hidden="true"></span>';
      toggle.setAttribute('aria-haspopup', 'dialog');
      toggle.setAttribute('aria-controls', 'splitSettingsPanel');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => setOpen(!isOpen()));
    }

    let sheet = document.getElementById('splitSettingsPanel');
    if (!sheet) sheet = buildSheet();

    // 設定 sits immediately before 讀稿檢視; the panel is the actions' last child, so it lays out
    // against the actions box rather than taking a place in the row.
    const review = document.getElementById('openReadingViewBtn');
    if (review?.parentElement === actions) {
      if (toggle.nextElementSibling !== review) actions.insertBefore(toggle, review);
    } else if (toggle.parentElement !== actions) {
      actions.appendChild(toggle);
    }
    if (sheet.parentElement !== actions || sheet.nextElementSibling) actions.appendChild(sheet);

    window.StoryFlowReadingSettings?.mount(document.getElementById('splitSettingsReading'));
    const splitSection = sheet.querySelector('#splitSettingsSplitTitle').parentElement;
    if (preferences.parentElement !== splitSection) splitSection.appendChild(preferences);
    if (preferences.getAttribute('aria-labelledby') !== 'splitSettingsSplitTitle') {
      preferences.setAttribute('role', 'group');
      preferences.setAttribute('aria-labelledby', 'splitSettingsSplitTitle');
    }

    const available = hasSplitContent();
    toggle.hidden = !available;
    if (!available && isOpen()) setOpen(false);
  }

  document.addEventListener('click', event => {
    if (!isOpen() || event.target.closest('#splitSettingsPanel, #splitSettingsToggle')) return;
    setOpen(false);
  });
  window.addEventListener('storyflow:view-changed', () => setOpen(false));

  function syncHierarchy() {
    ensureSplitSettings();
  }

  window.addEventListener('storyflow:projects-changed', () => queueMicrotask(syncHierarchy));
  window.addEventListener('storyflow:view-changed', () => queueMicrotask(syncHierarchy));

  StoryFlowRender.after('renderAll', 'workspace-project-ux', () => queueMicrotask(syncHierarchy));

  const observer = new MutationObserver(() => queueMicrotask(syncHierarchy));
  const splitter = document.querySelector('.splitter-panel');
  if (splitter) observer.observe(splitter, { childList:true, subtree:true });

  syncHierarchy();
})();
