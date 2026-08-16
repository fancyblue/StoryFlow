// Source loading workflow: choose source -> preview normalized content -> confirm -> Smart Split.
(function () {
  let pendingSourcePreview = null;

  function ensureSourceDialogs() {
    if (!document.getElementById('sourceDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'sourceDialog';
      dialog.className = 'source-flow-dialog';
      dialog.innerHTML = `
        <div class="dialog-card source-flow-card">
          <div class="panel-head sticky-dialog-head">
            <div><p class="eyebrow">SOURCE</p><h3>載入來源</h3></div>
            <button id="closeSourceDialog" class="icon-button" type="button">×</button>
          </div>
          <p class="muted source-flow-intro">先選擇文章來源。內容會先轉成 StoryFlow 可處理的文字並預覽，確認後才加入工作區。</p>
          <div class="source-choice-grid">
            <button id="sourceGoogleBtn" class="source-choice" type="button"><strong>Google Docs</strong><span>選文件與分頁，再預覽轉換後內容</span></button>
            <button id="sourceManualBtn" class="source-choice" type="button"><strong>手動新增</strong><span>直接輸入章節標題與文章內容</span></button>
          </div>
          <div id="detachSourceArea" class="detach-source-area hidden">
            <div><strong>目前章節已有來源</strong><span id="detachSourceLabel" class="muted"></span></div>
            <button id="detachSourceBtn" class="button ghost" type="button">解除來源連結</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      document.getElementById('closeSourceDialog').onclick = () => dialog.close();
      document.getElementById('sourceGoogleBtn').onclick = () => {
        dialog.close();
        importGoogleDoc();
      };
      document.getElementById('sourceManualBtn').onclick = () => {
        dialog.close();
        openManualSourceDialog();
      };
      document.getElementById('detachSourceBtn').onclick = () => detachActiveSource();
    }

    if (!document.getElementById('manualSourceDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'manualSourceDialog';
      dialog.className = 'source-flow-dialog';
      dialog.innerHTML = `
        <div class="dialog-card source-flow-card source-editor-card">
          <div class="panel-head sticky-dialog-head">
            <div><p class="eyebrow">MANUAL SOURCE</p><h3>手動新增文章</h3></div>
            <button id="closeManualSourceDialog" class="icon-button" type="button">×</button>
          </div>
          <label class="field-label">章節標題</label>
          <input id="manualSourceTitle" class="text-input" placeholder="例如：第一章" />
          <label class="field-label">文章內容</label>
          <textarea id="manualSourceText" class="source-manual-text" placeholder="貼上或輸入文章內容……"></textarea>
          <div class="source-flow-actions">
            <button id="previewManualSourceBtn" class="button primary" type="button">預覽轉換內容</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      document.getElementById('closeManualSourceDialog').onclick = () => dialog.close();
      document.getElementById('previewManualSourceBtn').onclick = previewManualSource;
    }

    if (!document.getElementById('sourcePreviewDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'sourcePreviewDialog';
      dialog.className = 'source-flow-dialog source-preview-dialog';
      dialog.innerHTML = `
        <div class="dialog-card source-flow-card source-preview-card">
          <div class="panel-head sticky-dialog-head">
            <div><p class="eyebrow">SOURCE PREVIEW</p><h3>確認轉換後內容</h3></div>
            <button id="closeSourcePreviewDialog" class="icon-button" type="button">×</button>
          </div>
          <div id="sourcePreviewSummary" class="source-preview-summary"></div>
          <div id="sourcePreviewChapterTabs" class="source-preview-tabs"></div>
          <pre id="sourcePreviewContent" class="source-preview-content"></pre>
          <div class="source-flow-actions sticky-dialog-actions">
            <button id="cancelSourcePreviewBtn" class="button ghost" type="button">返回修改</button>
            <button id="confirmSourcePreviewBtn" class="button primary" type="button">確認並加入工作區</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      document.getElementById('closeSourcePreviewDialog').onclick = () => dialog.close();
      document.getElementById('cancelSourcePreviewBtn').onclick = () => dialog.close();
      document.getElementById('confirmSourcePreviewBtn').onclick = confirmSourcePreview;
    }
  }

  function sourceLabel(chapter) {
    if (!chapter?.source) return '';
    const source = chapter.source;
    return `${source.name || 'Google Docs'}${source.tabTitle ? ` › ${source.tabTitle}` : ''}`;
  }

  function openSourceDialog() {
    ensureSourceDialogs();
    const chapter = activeChapter();
    const area = document.getElementById('detachSourceArea');
    const label = document.getElementById('detachSourceLabel');
    const hasSource = Boolean(chapter?.source);
    area.classList.toggle('hidden', !hasSource);
    if (label) label.textContent = hasSource ? sourceLabel(chapter) : '';
    document.getElementById('sourceDialog').showModal();
  }

  function openManualSourceDialog() {
    ensureSourceDialogs();
    document.getElementById('manualSourceTitle').value = '';
    document.getElementById('manualSourceText').value = '';
    document.getElementById('manualSourceDialog').showModal();
  }

  function previewManualSource() {
    const title = document.getElementById('manualSourceTitle').value.trim() || `第${state.chapters.length + 1}章`;
    const draft = document.getElementById('manualSourceText').value.replace(/\r\n/g, '\n').trim();
    if (!draft) return notify('請先輸入文章內容', true);
    pendingSourcePreview = {
      type: 'manual',
      projectTitle: state.projectTitle,
      chapters: [{ title, draft, source: null }]
    };
    document.getElementById('manualSourceDialog').close();
    showSourcePreview();
  }

  function buildGooglePreview(tabId) {
    const doc = pendingGoogleDoc;
    const tab = doc?.tabs?.find(item => item.id === tabId);
    if (!doc || !tab) return null;
    const syncedAt = new Date().toISOString();
    return {
      type: 'google',
      doc,
      tab,
      projectTitle: doc.title,
      chapters: tab.chapters.map((chapter, index) => ({
        title: chapter.title || `第${index + 1}章`,
        draft: chapter.draft,
        source: {
          id: doc.id, name: doc.name, url: doc.url, tabId: tab.id, tabTitle: tab.title,
          headingOrdinal: chapter.headingOrdinal, headingTitle: chapter.title, syncedAt
        }
      }))
    };
  }

  function showSourcePreview() {
    ensureSourceDialogs();
    if (!pendingSourcePreview?.chapters?.length) return;
    const summary = document.getElementById('sourcePreviewSummary');
    const tabs = document.getElementById('sourcePreviewChapterTabs');
    const content = document.getElementById('sourcePreviewContent');
    const items = pendingSourcePreview.chapters;
    const total = items.reduce((sum, item) => sum + charCount(item.draft), 0);
    summary.textContent = `${pendingSourcePreview.type === 'google' ? 'Google Docs' : '手動內容'} · ${items.length} 個章節 · ${total.toLocaleString()} 字`;
    tabs.innerHTML = '';
    items.forEach((chapter, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `source-preview-tab ${index === 0 ? 'active' : ''}`;
      button.textContent = chapter.title;
      button.onclick = () => {
        tabs.querySelectorAll('.source-preview-tab').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        content.textContent = chapter.draft;
      };
      tabs.appendChild(button);
    });
    content.textContent = items[0].draft;
    document.getElementById('sourcePreviewDialog').showModal();
  }

  function confirmSourcePreview() {
    const preview = pendingSourcePreview;
    if (!preview?.chapters?.length) return;
    const imported = preview.chapters.map(chapter => ({
      id: crypto.randomUUID(),
      title: chapter.title,
      draft: chapter.draft,
      confirmedBlockCount: 0,
      parts: [],
      source: chapter.source || null
    }));
    const starter = state.chapters.length === 1 && !state.chapters[0].draft && !state.chapters[0].parts?.length && !state.chapters[0].source;
    if (starter) state.chapters = [];
    state.chapters.push(...imported);
    state.activeChapterId = imported[0].id;
    if ((!state.projectTitle || state.projectTitle === '未命名作品') && preview.projectTitle) state.projectTitle = preview.projectTitle;
    suggestion = null;
    pendingSourcePreview = null;
    saveState('來源已加入');
    document.getElementById('sourcePreviewDialog').close();
    renderAll();
    if (activeChapter().draft) suggestNextPart();
    notify('來源已確認，已進入切篇預覽');
  }

  function detachActiveSource() {
    const chapter = activeChapter();
    if (!chapter?.source) return;
    chapter.source = null;
    saveState('來源連結已解除');
    document.getElementById('sourceDialog').close();
    renderAll();
    if (chapter.draft) suggestNextPart();
    notify('已解除來源連結，現有內容保留為手動文章');
  }

  function installSourceButton() {
    const panel = document.querySelector('.source-panel');
    const head = panel?.querySelector('.panel-head');
    if (!panel || !head || document.getElementById('loadSourceBtn')) return;
    const oldPlus = document.getElementById('newChapterBtn');
    if (oldPlus) oldPlus.classList.add('hidden');
    const button = document.createElement('button');
    button.id = 'loadSourceBtn';
    button.type = 'button';
    button.className = 'button tiny primary';
    button.textContent = '載入來源';
    button.onclick = openSourceDialog;
    head.appendChild(button);
    const add = document.getElementById('addChapterBtn');
    if (add) {
      add.textContent = '＋ 手動新增文章';
      add.onclick = openManualSourceDialog;
    }
  }

  // Google tab selection now previews first; it does not immediately mutate the workspace.
  window.importSelectedTab = function importSelectedTabWithPreview(tabId) {
    const preview = buildGooglePreview(tabId);
    if (!preview) return;
    const sameTab = state.chapters.some(chapter => chapter.source?.id === preview.doc.id && chapter.source?.tabId === preview.tab.id);
    if (sameTab) {
      notify(`「${preview.tab.title}」已經在工作區`, true);
      return;
    }
    pendingSourcePreview = preview;
    els.tabDialog.close();
    showSourcePreview();
  };

  const baseRenderParts = window.renderParts;
  window.renderParts = function renderPartsSourceFlow() {
    baseRenderParts();
    if (!activeChapter().parts?.length) {
      const empty = els.partsList.querySelector('.empty-state');
      if (empty) empty.innerHTML = '<span>尚未建立已確認文章。完成來源確認後，直接在 SMART SPLIT 檢查並存成 Markdown。</span>';
    }
  };

  function cleanLegacyInstructions() {
    const empty = document.getElementById('suggestionEmpty');
    if (empty) {
      const strong = empty.querySelector('strong');
      const span = empty.querySelector('span');
      if (strong) strong.textContent = '尚未有可切篇內容';
      if (span) span.textContent = '請先從「作品與章節」載入 Google Docs 或手動新增文章；確認來源內容後會直接顯示切篇預覽。';
    }
    const editorImport = document.getElementById('importGoogleBtn');
    const sample = document.getElementById('pasteSampleBtn');
    if (editorImport) editorImport.classList.add('hidden');
    if (sample) sample.classList.add('hidden');
  }

  ensureSourceDialogs();
  installSourceButton();
  cleanLegacyInstructions();
  renderParts();
})();