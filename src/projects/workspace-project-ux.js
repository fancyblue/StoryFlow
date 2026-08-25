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
    return dialog;
  }

  function openSourceChooser({ allowManualBeforeSettings = false, creation = false } = {}) {
    if (!creation) window.StoryFlowNewWorkFlow?.cancel?.();
    if (!hasIntegrationSettings() && !allowManualBeforeSettings) {
      showSettings();
      return false;
    }

    const dialog = configureSourceDialog({ creation });
    if (dialog) {
      if (!dialog.open) dialog.showModal();
      return true;
    }

    // source-flow normally creates the dialog at boot. Keep a defensive fallback for
    // slower script loading, but never depend on this button as the primary path.
    const legacy = document.getElementById('loadSourceBtn');
    if (legacy) {
      legacy.click();
      return true;
    }
    return false;
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

  // Empty workspace CTA used to click #loadSourceBtn, but the project source controller
  // intentionally removes that legacy action row. Intercept the real user action and
  // invoke the source chooser directly. Without integration settings, this CTA routes
  // to Settings as the user expects.
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

    if (target.id === 'loadSourceBtn' && !hasIntegrationSettings()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showSettings();
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
      toggle.innerHTML = '<span>切篇偏好</span><span class="sf-chevron" aria-hidden="true"></span>';
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
  if (typeof baseRenderAll === 'function' && !baseRenderAll.__storyflowHierarchy) {
    const refinedRenderAll = function (...args) {
      const result = baseRenderAll.apply(this, args);
      queueMicrotask(syncHierarchy);
      return result;
    };
    refinedRenderAll.__storyflowHierarchy = true;
    window.renderAll = refinedRenderAll;
  }

  const observer = new MutationObserver(() => queueMicrotask(syncHierarchy));
  const splitter = document.querySelector('.splitter-panel');
  if (splitter) observer.observe(splitter, { childList:true, subtree:true });

  syncHierarchy();
})();
