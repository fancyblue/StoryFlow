// Source article UX v2: keep manual/Google work panels visually consistent,
// make manual article creation a direct action with optional preview, and remove
// redundant Google source labels from the chapter list.
(function () {
  function mode() {
    try { return window.StoryFlowProjectSourceModeV2?.mode?.() ?? null; }
    catch (_) { return null; }
  }

  function normalize(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function isBlankStarter() {
    if (!Array.isArray(state?.chapters) || state.chapters.length !== 1) return false;
    const chapter = state.chapters[0];
    return Boolean(chapter && !chapter.source && !chapter.detachedSource
      && !String(chapter.draft || '').trim() && !(chapter.parts || []).length);
  }

  function meaningfulManualChapter(chapter) {
    return Boolean(chapter && !chapter.source && !chapter.detachedSource
      && (String(chapter.draft || '').trim() || (chapter.parts || []).length));
  }

  function manualInput() {
    const titleInput = document.getElementById('manualSourceTitle');
    const textInput = document.getElementById('manualSourceText');
    const draft = String(textInput?.value || '').replace(/\r\n/g, '\n').trim();
    const sequence = (state?.chapters || []).filter(chapter => !isBlankStarter() || chapter !== state.chapters[0]).length + 1;
    const title = String(titleInput?.value || '').trim() || `第${sequence}章`;
    return { title, draft };
  }

  function addManualArticleDirect() {
    const { title, draft } = manualInput();
    if (!draft) {
      notify('請先輸入文章內容', true);
      document.getElementById('manualSourceText')?.focus();
      return;
    }

    if (isBlankStarter()) state.chapters = [];
    const chapter = {
      id: crypto.randomUUID(),
      title,
      draft,
      confirmedBlockCount: 0,
      parts: [],
      source: null
    };
    state.chapters.push(chapter);
    state.activeChapterId = chapter.id;
    if (!state.projectSource?.type) state.projectSource = { type: 'manual' };
    suggestion = null;
    saveState('文章已新增');
    document.getElementById('manualSourceDialog')?.close();
    renderAll();
    window.StoryFlowProjectSourceModeV2?.syncUi?.();
    if (chapter.draft) suggestNextPart();
    notify(`已新增文章：${title}`);
  }

  function prepareManualDialog() {
    const dialog = document.getElementById('manualSourceDialog');
    if (!dialog) return;
    dialog.classList.add('manual-source-dialog-v2');

    const actions = dialog.querySelector('.source-flow-actions');
    const preview = document.getElementById('previewManualSourceBtn');
    if (!actions || !preview) return;

    preview.classList.remove('primary');
    preview.classList.add('ghost');
    preview.textContent = '預覽轉換內容';

    let confirm = document.getElementById('confirmManualSourceBtn');
    if (!confirm) {
      confirm = document.createElement('button');
      confirm.id = 'confirmManualSourceBtn';
      confirm.type = 'button';
      confirm.className = 'button primary';
      confirm.textContent = '確定新增';
      confirm.addEventListener('click', addManualArticleDirect);
      actions.appendChild(confirm);
    }
    actions.classList.add('manual-source-actions-v2');
  }

  function syncManualPreviewPresentation() {
    const dialog = document.getElementById('sourcePreviewDialog');
    const summary = document.getElementById('sourcePreviewSummary');
    const tabs = document.getElementById('sourcePreviewChapterTabs');
    const heading = document.getElementById('sourcePreviewHeading');
    const confirm = document.getElementById('confirmSourcePreviewBtn');
    const cancel = document.getElementById('cancelSourcePreviewBtn');
    if (!dialog || !summary || !tabs || !heading || !confirm || !cancel) return;

    const isManual = dialog.open && /^手動內容\s*·/.test(String(summary.textContent || '').trim());
    dialog.classList.toggle('manual-single-preview-v2', isManual);
    summary.hidden = isManual;

    if (isManual) {
      tabs.hidden = true;
      heading.textContent = '預覽文章';
      confirm.textContent = '確定新增';
      cancel.textContent = '返回編輯';
    } else {
      // source-flow controls Google tab visibility through its .hidden class; remove
      // the manual-only hidden attribute so later Google previews are not suppressed.
      tabs.hidden = false;
    }
  }

  function preparePreviewDialog() {
    const dialog = document.getElementById('sourcePreviewDialog');
    const summary = document.getElementById('sourcePreviewSummary');
    const cancel = document.getElementById('cancelSourcePreviewBtn');
    if (!dialog || !summary || dialog.dataset.manualPreviewUxV2 === '1') return;
    dialog.dataset.manualPreviewUxV2 = '1';

    const observer = new MutationObserver(() => queueMicrotask(syncManualPreviewPresentation));
    observer.observe(summary, { childList: true, subtree: true, characterData: true });
    observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    document.getElementById('previewManualSourceBtn')?.addEventListener('click', () => {
      window.setTimeout(syncManualPreviewPresentation, 0);
    });
    cancel?.addEventListener('click', () => {
      const returnToEditor = dialog.classList.contains('manual-single-preview-v2');
      if (!returnToEditor) return;
      window.setTimeout(() => {
        const editor = document.getElementById('manualSourceDialog');
        if (editor && !editor.open) editor.showModal();
      }, 0);
    }, true);
  }

  function simplifyGoogleSourceOrigin() {
    if (mode() !== 'google') return;
    const label = document.querySelector('#projectSourceOrigin .project-source-origin-label');
    const name = document.getElementById('projectSourceOriginName');
    if (label) label.textContent = 'Google Docs';
    if (!name) return;

    const docName = state?.projectSource?.docName || name.textContent || 'Google Docs';
    const sameAsProject = normalize(docName) && normalize(docName) === normalize(state?.projectTitle);
    name.hidden = sameAsProject || !normalize(docName) || normalize(docName) === 'Google Docs';
    if (!name.hidden) name.textContent = `文件：${docName}`;
  }

  function simplifyChapterGroups() {
    if (mode() !== 'google') return;
    const panel = document.querySelector('.source-panel');
    if (!panel) return;

    const groups = [...panel.querySelectorAll('.chapter-group-label')];
    groups.forEach(group => group.querySelector('small')?.remove());

    const sourceTabs = new Set((state?.chapters || [])
      .map(chapter => chapter?.source || chapter?.detachedSource)
      .filter(source => source?.id && source?.tabId)
      .map(source => `${source.id}::${source.tabId}`));
    const hasManual = (state?.chapters || []).some(meaningfulManualChapter);

    // One Google tab needs no extra section card. Keep group labels only when they
    // help distinguish multiple tabs or a mixed Google/manual work.
    if (sourceTabs.size <= 1 && !hasManual) {
      groups.forEach(group => { group.hidden = true; });
    } else {
      groups.forEach(group => { group.hidden = false; });
    }
  }

  function ensureStyleLast() {
    const link = document.getElementById('storyflowSourceArticleUxV2Css');
    if (link && link.parentElement === document.head && document.head.lastElementChild !== link) {
      document.head.appendChild(link);
    }
  }

  function syncAll() {
    prepareManualDialog();
    preparePreviewDialog();
    simplifyGoogleSourceOrigin();
    simplifyChapterGroups();
    ensureStyleLast();
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function' && !baseRenderAll.__sourceArticleUxV2) {
    const wrapped = function (...args) {
      const result = baseRenderAll.apply(this, args);
      queueMicrotask(syncAll);
      return result;
    };
    wrapped.__sourceArticleUxV2 = true;
    window.renderAll = wrapped;
  }

  window.addEventListener('storyflow:projects-changed', () => queueMicrotask(syncAll));
  window.addEventListener('storyflow:view-changed', () => queueMicrotask(syncAll));
  document.addEventListener('click', event => {
    if (event.target?.closest?.('#addChapterBtn, #previewManualSourceBtn')) {
      window.setTimeout(syncAll, 0);
    }
  });

  syncAll();
})();