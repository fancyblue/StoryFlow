// Manual chapter editing: manual articles can update both chapter title and source text.
// Reuses the same manual editor used for creation so add/edit follow one UI pattern.
(function () {
  let editingChapterId = null;
  let warnedChapterId = null;

  function isManualChapter(chapter) {
    return Boolean(chapter && !chapter.source && !chapter.detachedSource);
  }

  function chapterById(chapterId) {
    return (state?.chapters || []).find(chapter => chapter.id === chapterId) || null;
  }

  function dialogParts() {
    const dialog = document.getElementById('manualSourceDialog');
    return {
      dialog,
      title: document.getElementById('manualSourceTitle'),
      text: document.getElementById('manualSourceText'),
      heading: dialog?.querySelector('.sticky-dialog-head h3'),
      eyebrow: dialog?.querySelector('.sticky-dialog-head .eyebrow'),
      preview: document.getElementById('previewManualSourceBtn'),
      confirm: document.getElementById('confirmManualSourceBtn'),
      actions: dialog?.querySelector('.manual-source-actions-v2, .source-flow-actions')
    };
  }

  function setEditFooterMode(editing) {
    const { actions } = dialogParts();
    if (!actions) return;
    actions.classList.toggle('sticky-dialog-actions', editing);
    actions.classList.toggle('manual-chapter-edit-actions', editing);
  }

  function ensureCancelButton() {
    const { actions, confirm } = dialogParts();
    if (!actions) return null;
    let cancel = document.getElementById('cancelManualChapterEditBtn');
    if (!cancel) {
      cancel = document.createElement('button');
      cancel.id = 'cancelManualChapterEditBtn';
      cancel.type = 'button';
      cancel.className = 'button ghost';
      cancel.textContent = '取消';
      cancel.hidden = true;
      cancel.addEventListener('click', () => document.getElementById('manualSourceDialog')?.close());
      actions.insertBefore(cancel, confirm || actions.firstChild);
    }
    return cancel;
  }

  function resetDialogToAddMode() {
    if (editingChapterId) return;
    const { dialog, heading, eyebrow, preview, confirm } = dialogParts();
    if (!dialog) return;
    delete dialog.dataset.editChapterId;
    setEditFooterMode(false);
    if (heading) heading.textContent = '手動新增文章';
    if (eyebrow) eyebrow.textContent = 'MANUAL SOURCE';
    if (preview) preview.hidden = false;
    if (confirm) confirm.textContent = '確定新增';
    const cancel = ensureCancelButton();
    if (cancel) cancel.hidden = true;
  }

  function closeEditMode() {
    editingChapterId = null;
    warnedChapterId = null;
    resetDialogToAddMode();
  }

  function openEditor(chapterId) {
    const chapter = chapterById(chapterId);
    if (!chapter || !isManualChapter(chapter)) {
      window.notify?.('Google Docs 章節由來源維護；只有手動章節可以編輯。', true);
      return false;
    }

    const { dialog, title, text, heading, eyebrow, preview, confirm } = dialogParts();
    if (!dialog || !title || !text || !confirm) {
      window.notify?.('手動文章編輯器尚未準備完成，請重新整理後再試一次。', true);
      return false;
    }

    editingChapterId = chapter.id;
    warnedChapterId = null;
    dialog.dataset.editChapterId = chapter.id;
    setEditFooterMode(true);
    title.value = chapter.title || '';
    text.value = chapter.draft || '';
    if (heading) heading.textContent = '編輯章節';
    if (eyebrow) eyebrow.textContent = 'MANUAL ARTICLE';
    if (preview) preview.hidden = true;
    confirm.textContent = '儲存修改';
    const cancel = ensureCancelButton();
    if (cancel) cancel.hidden = false;

    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => {
      title.focus();
      title.select();
    });
    return true;
  }

  function saveEdit() {
    const chapter = chapterById(editingChapterId);
    const { dialog, title, text } = dialogParts();
    if (!chapter || !dialog || !isManualChapter(chapter)) {
      closeEditMode();
      return;
    }

    const nextTitle = String(title?.value || '').trim();
    const nextDraft = String(text?.value || '').replace(/\r\n/g, '\n').trim();
    if (!nextTitle) {
      window.notify?.('章節標題不能留白', true);
      title?.focus();
      return;
    }
    if (!nextDraft) {
      window.notify?.('文章內容不能留白', true);
      text?.focus();
      return;
    }

    const contentChanged = nextDraft !== String(chapter.draft || '').trim();
    const hasPublishedOutput = Number(chapter.confirmedBlockCount || 0) > 0 || (chapter.parts || []).length > 0;
    if (contentChanged && hasPublishedOutput && warnedChapterId !== chapter.id) {
      const proceed = window.confirm(
        '這個章節已有已確認／已建立的發布篇。\n\n修改章節內容會更新工作區原稿與後續 SMART SPLIT，但既有 Markdown／發布篇不會自動改寫。\n\n確定儲存修改？'
      );
      if (!proceed) return;
      warnedChapterId = chapter.id;
    }

    chapter.title = nextTitle;
    chapter.draft = nextDraft;
    suggestion = null;
    try { saveState('章節已更新'); } catch (_) {}
    try { window.StoryFlowProjectPersistence?.flush?.('manual-chapter-edit'); } catch (_) {}

    dialog.close();
    editingChapterId = null;
    warnedChapterId = null;
    try { renderAll(); } catch (_) {}
    try { window.renderChapters?.(); } catch (_) {}
    try { window.StoryFlowRenderProjects?.(); } catch (_) {}
    if (state?.activeChapterId === chapter.id && chapter.draft) {
      try { suggestNextPart(); } catch (_) {}
    }
    window.setTimeout(() => window.notify?.(`已更新章節：${nextTitle}`), 0);
  }

  function workspaceChapterOrder() {
    const groups = [];
    const map = new Map();
    for (const chapter of state?.chapters || []) {
      const source = chapter.source;
      const key = source?.tabId ? `${source.id || 'doc'}::${source.tabId}` : '__manual__';
      if (!map.has(key)) {
        const group = [];
        map.set(key, group);
        groups.push(group);
      }
      map.get(key).push(chapter);
    }
    return groups.flat();
  }

  function decorateWorkspaceMenus() {
    const rows = [...document.querySelectorAll('#chapterList .chapter-row')];
    const chapters = workspaceChapterOrder();
    rows.forEach((row, index) => {
      const chapter = chapters[index];
      if (!chapter) return;
      row.dataset.chapterId = chapter.id;
      const menu = row.querySelector('.chapter-row-action-menu');
      if (!menu) return;

      let edit = menu.querySelector('.chapter-row-edit-menu-item');
      if (!isManualChapter(chapter)) {
        edit?.remove();
        return;
      }
      if (!edit) {
        edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'chapter-row-edit-menu-item';
        edit.setAttribute('role', 'menuitem');
        edit.innerHTML = '<span aria-hidden="true">✎</span><span>編輯章節</span>';
        edit.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          menu.hidden = true;
          row.querySelector('.chapter-more-button')?.setAttribute('aria-expanded', 'false');
          openEditor(row.dataset.chapterId);
        });
        menu.prepend(edit);
      }
    });
  }

  function decorateWorksManager() {
    document.querySelectorAll('.project-chapter-manager-row').forEach(row => {
      const chapterId = row.dataset.chapterId;
      const chapter = chapterById(chapterId);
      const button = row.querySelector('.project-chapter-rename');
      if (!button || !chapter || !isManualChapter(chapter)) return;
      button.textContent = '編輯章節';
      button.setAttribute('aria-label', `編輯章節「${chapter.title}」`);
    });
  }

  function sync() {
    ensureCancelButton();
    if (!editingChapterId) resetDialogToAddMode();
    decorateWorkspaceMenus();
    decorateWorksManager();
  }

  // The existing Works-page rename button has its own target listener. Capture first
  // and route it into the full title+content editor instead of the old title-only edit.
  document.addEventListener('click', event => {
    const worksEdit = event.target.closest?.('.project-chapter-rename');
    if (worksEdit) {
      const row = worksEdit.closest('.project-chapter-manager-row');
      const chapterId = row?.dataset.chapterId;
      if (chapterId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openEditor(chapterId);
      }
      return;
    }

    const confirm = event.target.closest?.('#confirmManualSourceBtn');
    const dialog = document.getElementById('manualSourceDialog');
    if (confirm && dialog?.dataset.editChapterId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveEdit();
    }
  }, true);

  document.getElementById('manualSourceDialog')?.addEventListener('close', closeEditMode);
  document.getElementById('addChapterBtn')?.addEventListener('click', () => {
    editingChapterId = null;
    warnedChapterId = null;
    window.setTimeout(resetDialogToAddMode, 0);
  }, true);

  const baseRenderChapters = window.renderChapters;
  if (typeof baseRenderChapters === 'function' && !baseRenderChapters.__manualChapterEditV1) {
    const wrapped = function (...args) {
      const result = baseRenderChapters.apply(this, args);
      queueMicrotask(decorateWorkspaceMenus);
      return result;
    };
    wrapped.__manualChapterEditV1 = true;
    window.renderChapters = wrapped;
  }

  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(sync, 0));
  window.addEventListener('storyflow:view-changed', () => window.setTimeout(sync, 0));
  window.StoryFlowManualArticleEditor = { open: openEditor };
  sync();
})();
