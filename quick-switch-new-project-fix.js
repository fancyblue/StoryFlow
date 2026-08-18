// Keep the quick-switch menu's "新增作品" action present after the legacy renderer
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
        ? '先選擇作品建立方式。Google Docs 會帶入文件內容；手動建立則可直接輸入作品名稱與第一篇文章。'
        : '先選擇文章來源。內容會先轉成 StoryFlow 可處理的文字並預覽，確認後才加入工作區。';
    }
    if (googleTitle) googleTitle.textContent = creation ? '從 Google Docs 建立' : 'Google Docs';
    if (googleCopy) googleCopy.textContent = creation ? '帶入作品名稱與章節' : '選文件與分頁，再預覽轉換後內容';
    if (manualTitle) manualTitle.textContent = creation ? '手動建立' : '手動新增';
    if (manualCopy) manualCopy.textContent = creation ? '輸入作品名稱與第一篇文章' : '直接輸入章節標題與文章內容';
    dialog.dataset.storyflowCreationMode = creation ? '1' : '0';
    return dialog;
  }

  function openSourceChooser({ allowManualBeforeSettings = false, creation = false } = {}) {
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

  function manualProjectTitleNeeded() {
    try {
      return !String(state?.projectTitle || '').trim() || state.projectTitle === '未命名作品';
    } catch (_) {
      return true;
    }
  }

  function ensureManualProjectTitleField({ focus = false } = {}) {
    const dialog = document.getElementById('manualSourceDialog');
    const card = dialog?.querySelector('.source-editor-card');
    const chapterLabel = card?.querySelector('label.field-label');
    if (!dialog || !card || !chapterLabel) return;

    let label = document.getElementById('manualSourceProjectTitleLabel');
    let input = document.getElementById('manualSourceProjectTitle');
    if (!label || !input) {
      label = document.createElement('label');
      label.id = 'manualSourceProjectTitleLabel';
      label.className = 'field-label';
      label.htmlFor = 'manualSourceProjectTitle';
      label.textContent = '作品名稱';

      input = document.createElement('input');
      input.id = 'manualSourceProjectTitle';
      input.className = 'text-input';
      input.placeholder = '例如：我的作品';

      chapterLabel.insertAdjacentElement('beforebegin', label);
      label.insertAdjacentElement('afterend', input);
    }

    const needed = manualProjectTitleNeeded();
    label.hidden = !needed;
    input.hidden = !needed;
    if (needed) {
      input.value = String(state?.projectTitle || '').trim() === '未命名作品'
        ? ''
        : String(state?.projectTitle || '').trim();
      const heading = dialog.querySelector('.sticky-dialog-head h3');
      if (heading) heading.textContent = '手動建立作品';
      if (focus) requestAnimationFrame(() => input.focus());
    }
  }

  function applyPendingManualProjectTitle() {
    const input = document.getElementById('manualSourceProjectTitle');
    if (!input || input.hidden) return;
    const value = input.value.trim() || '未命名作品';
    try {
      state.projectTitle = value;
      const projectInput = document.getElementById('projectTitle');
      if (projectInput) projectInput.value = value;
    } catch (_) {}
  }

  function createNewProject(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    window.StoryFlowProjects?.createProject?.({ title: '未命名作品' });
    closeQuickSwitch();
    window.StoryFlowNavigate?.('workspace');

    window.setTimeout(() => {
      window.StoryFlowProjectSourceModeV2?.syncUi?.();
      ensureManualProjectTitleField();
      openSourceChooser({ allowManualBeforeSettings: true, creation: true });
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
    ensureManualProjectTitleField();
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

  // Empty workspace CTA used to click #loadSourceBtn, but project-source-mode-v2
  // intentionally removes that legacy action row. Intercept the real user action and
  // invoke the source chooser directly. Without integration settings, this CTA routes
  // to Settings as the user expects.
  document.addEventListener('click', event => {
    const target = event.target.closest?.('button');
    if (!target) return;

    if (target.id === 'workspaceLoadSourceBtn') {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSourceChooser();
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
      return;
    }

    if (target.id === 'sourceManualBtn') {
      window.setTimeout(() => ensureManualProjectTitleField({ focus: true }), 0);
      return;
    }

    if (target.id === 'previewManualSourceBtn') {
      applyPendingManualProjectTitle();
    }
  }, true);

  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(sync, 0));
  window.addEventListener('storyflow:view-changed', () => window.setTimeout(sync, 0));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeQuickSwitch();
  });

  sync();
  loadChapterManagement();
  loadProjectProgressBadges();

  window.StoryFlowSourceOnboarding = {
    hasIntegrationSettings,
    openSourceChooser,
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

// Source-diff rows should identify the chapter first. project-source-mode-v2 keeps
// diff data private, so enrich the rendered rows from the stable workspace state.
(function () {
  function countChars(text) {
    try {
      if (typeof charCount === 'function') return charCount(text || '');
    } catch (_) {}
    return Array.from(String(text || '').replace(/\s/g, '')).length;
  }

  function chapterSource(chapter) {
    return chapter?.source || chapter?.detachedSource || null;
  }

  function parseContext(text) {
    const sourceText = String(text || '').split(' · ')[0].trim();
    const parts = sourceText.split(' › ').map(item => item.trim());
    return { docName: parts[0] || '', tabTitle: parts[1] || '' };
  }

  function oldCharCount(text) {
    const match = String(text || '').match(/內容\s+([\d,]+)\s*→/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  }

  function titleFromDetail(text) {
    const match = String(text || '').match(/標題：(.+?)\s*→/);
    return match?.[1]?.trim() || '';
  }

  function findChapterForRow(detailText) {
    let chapters = [];
    try { chapters = Array.isArray(state?.chapters) ? state.chapters : []; }
    catch (_) { return null; }

    const { docName, tabTitle } = parseContext(detailText);
    const previousChars = oldCharCount(detailText);
    const previousTitle = titleFromDetail(detailText);
    let candidates = chapters.filter(chapter => {
      const source = chapterSource(chapter);
      if (!source) return false;
      const sourceName = String(source.name || 'Google Docs');
      const sourceTab = String(source.tabTitle || '未命名分頁');
      return sourceName === docName && sourceTab === tabTitle;
    });

    if (previousTitle) {
      const titleMatch = candidates.find(chapter => String(chapter.title || '').trim() === previousTitle);
      if (titleMatch) return titleMatch;
    }
    if (previousChars != null) {
      const charMatches = candidates.filter(chapter => countChars(chapter.draft) === previousChars);
      if (charMatches.length === 1) return charMatches[0];
      if (charMatches.length) candidates = charMatches;
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  function enrichDiffRows() {
    document.querySelectorAll('#projectSourceDiffListV2 .project-source-diff-row').forEach(row => {
      const strong = row.querySelector('.project-source-diff-copy > strong');
      const detail = row.querySelector('.project-source-diff-copy > span');
      if (!strong || !detail || strong.dataset.chapterNamed === '1') return;
      if (strong.textContent.trim() !== '來源內容有更新') return;

      const chapter = findChapterForRow(detail.textContent);
      if (!chapter?.title) return;
      strong.textContent = `章節「${chapter.title}」有更新`;
      strong.dataset.chapterNamed = '1';
    });
  }

  const observer = new MutationObserver(() => queueMicrotask(enrichDiffRows));
  observer.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('storyflow:view-changed', () => queueMicrotask(enrichDiffRows));
  enrichDiffRows();
})();
