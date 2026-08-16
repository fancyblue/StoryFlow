// Source workflow: choose source -> preview normalized content -> confirm -> Smart Split.
// Existing Google Docs sources can be refreshed and reviewed before the workspace is changed.
(function () {
  let pendingSourcePreview = null;

  function normalizeText(value) {
    return String(value || '').replace(/\r\n/g, '\n').trimEnd();
  }

  function blockSignature(block) {
    return `${block?.raw || ''}\u0000${block?.strongBoundaryAfter ? '1' : '0'}`;
  }

  function confirmedRangeChanged(chapter, nextDraft) {
    const confirmed = Number(chapter?.confirmedBlockCount || 0);
    if (!confirmed) return false;
    const before = parseBlocks(chapter.draft || '');
    const after = parseBlocks(nextDraft || '');
    if (after.length < confirmed || before.length < confirmed) return true;
    for (let index = 0; index < confirmed; index += 1) {
      if (blockSignature(before[index]) !== blockSignature(after[index])) return true;
    }
    return false;
  }

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
            <div><strong>目前章節已有 Google Docs 來源</strong><span id="detachSourceLabel" class="muted"></span></div>
            <div class="source-linked-actions">
              <button id="refreshLinkedSourceBtn" class="button primary" type="button">更新來源</button>
              <button id="detachSourceBtn" class="button ghost" type="button">解除來源連結</button>
            </div>
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
      document.getElementById('refreshLinkedSourceBtn').onclick = () => {
        dialog.close();
        refreshActiveSource();
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
            <div><p class="eyebrow">SOURCE PREVIEW</p><h3 id="sourcePreviewHeading">確認轉換後內容</h3></div>
            <button id="closeSourcePreviewDialog" class="icon-button" type="button">×</button>
          </div>
          <div id="sourcePreviewSummary" class="source-preview-summary"></div>
          <div id="sourcePreviewWarning" class="source-refresh-warning hidden"></div>
          <div id="sourcePreviewChapterTabs" class="source-preview-tabs"></div>
          <pre id="sourcePreviewContent" class="source-preview-content"></pre>
          <div id="sourceRefreshCompare" class="source-refresh-compare hidden">
            <section><div class="source-compare-head">目前工作區</div><pre id="sourceRefreshBefore" class="source-preview-content"></pre></section>
            <section><div class="source-compare-head">Google Docs 最新內容</div><pre id="sourceRefreshAfter" class="source-preview-content"></pre></section>
          </div>
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

  function syncSourceButtons() {
    ensureSourceDialogs();
    const hasGoogleSource = Boolean(activeChapter()?.source?.id && activeChapter()?.source?.tabId);
    const refresh = document.getElementById('refreshSourceBtn');
    if (refresh) {
      refresh.hidden = !hasGoogleSource;
      refresh.disabled = !hasGoogleSource;
    }
  }

  function openSourceDialog() {
    ensureSourceDialogs();
    const chapter = activeChapter();
    const area = document.getElementById('detachSourceArea');
    const label = document.getElementById('detachSourceLabel');
    const hasSource = Boolean(chapter?.source?.id && chapter?.source?.tabId);
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
      mode: 'add',
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
      mode: 'add',
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

  async function refreshActiveSource() {
    ensureSourceDialogs();
    const chapter = activeChapter();
    if (!chapter?.source?.id || !chapter?.source?.tabId) {
      notify('目前章節沒有可更新的 Google Docs 來源', true);
      return;
    }

    try {
      notify('正在讀取 Google Docs 最新內容…');
      const refreshed = await StoryFlowIntegrations.refreshChapterSource(chapter.source);
      const oldDraft = normalizeText(chapter.draft);
      const nextDraft = normalizeText(refreshed.draft);
      const changed = oldDraft !== nextDraft || chapter.title !== refreshed.title;
      const confirmedChanged = changed && confirmedRangeChanged(chapter, nextDraft);
      const oldChars = charCount(oldDraft);
      const nextChars = charCount(nextDraft);
      const syncedAt = new Date().toISOString();

      pendingSourcePreview = {
        type: 'google',
        mode: 'refresh',
        projectTitle: state.projectTitle,
        targetChapterId: chapter.id,
        changed,
        confirmedChanged,
        oldChars,
        nextChars,
        warnings: refreshed.warnings || [],
        chapters: [{
          title: refreshed.title || chapter.title,
          draft: nextDraft,
          oldTitle: chapter.title,
          oldDraft,
          source: {
            ...chapter.source,
            tabTitle: refreshed.tabTitle || chapter.source.tabTitle,
            headingTitle: refreshed.title || chapter.source.headingTitle,
            syncedAt
          }
        }]
      };
      showSourcePreview();
    } catch (error) {
      notify(`來源更新失敗：${error.message}`, true);
    }
  }

  function showSourcePreview() {
    ensureSourceDialogs();
    if (!pendingSourcePreview?.chapters?.length) return;
    const summary = document.getElementById('sourcePreviewSummary');
    const warning = document.getElementById('sourcePreviewWarning');
    const tabs = document.getElementById('sourcePreviewChapterTabs');
    const content = document.getElementById('sourcePreviewContent');
    const compare = document.getElementById('sourceRefreshCompare');
    const before = document.getElementById('sourceRefreshBefore');
    const after = document.getElementById('sourceRefreshAfter');
    const heading = document.getElementById('sourcePreviewHeading');
    const confirm = document.getElementById('confirmSourcePreviewBtn');
    const cancel = document.getElementById('cancelSourcePreviewBtn');
    const items = pendingSourcePreview.chapters;
    const isRefresh = pendingSourcePreview.mode === 'refresh';

    warning.classList.add('hidden');
    warning.textContent = '';
    compare.classList.toggle('hidden', !isRefresh);
    content.classList.toggle('hidden', isRefresh);
    tabs.classList.toggle('hidden', isRefresh && items.length === 1);

    if (isRefresh) {
      const item = items[0];
      const delta = pendingSourcePreview.nextChars - pendingSourcePreview.oldChars;
      const deltaText = delta === 0 ? '字數相同' : `${delta > 0 ? '+' : ''}${delta.toLocaleString()} 字`;
      heading.textContent = '確認來源更新';
      summary.innerHTML = pendingSourcePreview.changed
        ? `<strong class="source-change-status changed">偵測到變更</strong><span>目前 ${pendingSourcePreview.oldChars.toLocaleString()} 字 → 最新 ${pendingSourcePreview.nextChars.toLocaleString()} 字（${deltaText}）</span>`
        : `<strong class="source-change-status unchanged">沒有內容變更</strong><span>Google Docs 與目前工作區內容一致，共 ${pendingSourcePreview.nextChars.toLocaleString()} 字。</span>`;
      before.textContent = item.oldDraft || '（目前沒有內容）';
      after.textContent = item.draft || '（最新來源沒有內容）';
      confirm.textContent = pendingSourcePreview.changed ? '確認並套用更新' : '完成檢查';
      cancel.textContent = '取消';
      if (pendingSourcePreview.confirmedChanged) {
        warning.classList.remove('hidden');
        warning.textContent = '注意：Google Docs 的變更包含已確認發布範圍。既有 Markdown／發布篇不會自動改寫；套用前請確認左右內容。';
      }
      if (pendingSourcePreview.warnings?.length) {
        warning.classList.remove('hidden');
        warning.textContent += `${warning.textContent ? ' ' : ''}${pendingSourcePreview.warnings.join(' ')}`;
      }
    } else {
      heading.textContent = '確認轉換後內容';
      confirm.textContent = '確認並加入工作區';
      cancel.textContent = '返回修改';
      const total = items.reduce((sum, item) => sum + charCount(item.draft), 0);
      summary.textContent = `${pendingSourcePreview.type === 'google' ? 'Google Docs' : '手動內容'} · ${items.length} 個章節 · ${total.toLocaleString()} 字`;
    }

    tabs.innerHTML = '';
    items.forEach((chapter, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `source-preview-tab ${index === 0 ? 'active' : ''}`;
      button.textContent = chapter.title;
      button.onclick = () => {
        tabs.querySelectorAll('.source-preview-tab').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        if (isRefresh) {
          before.textContent = chapter.oldDraft || '（目前沒有內容）';
          after.textContent = chapter.draft || '（最新來源沒有內容）';
        } else {
          content.textContent = chapter.draft;
          content.scrollTop = 0;
        }
      };
      tabs.appendChild(button);
    });
    if (!isRefresh) content.textContent = items[0].draft;
    document.getElementById('sourcePreviewDialog').showModal();
  }

  function confirmRefreshPreview(preview) {
    const chapter = state.chapters.find(item => item.id === preview.targetChapterId);
    const incoming = preview.chapters[0];
    if (!chapter || !incoming) return;

    if (!preview.changed) {
      chapter.source = incoming.source;
      saveState('來源已檢查');
      pendingSourcePreview = null;
      document.getElementById('sourcePreviewDialog').close();
      renderAll();
      syncSourceButtons();
      notify('Google Docs 已檢查，目前沒有內容變更');
      return;
    }

    if (preview.confirmedChanged) {
      const proceed = confirm('Google Docs 的修改包含已確認發布範圍。\n\n套用後會更新工作區原稿，但已經存出的 Markdown 與發布篇會維持原狀，不會自動覆寫。\n\n確定套用最新來源？');
      if (!proceed) return;
    }

    chapter.title = incoming.title || chapter.title;
    chapter.draft = incoming.draft;
    chapter.source = incoming.source;
    suggestion = null;
    pendingSourcePreview = null;
    saveState('來源已更新');
    document.getElementById('sourcePreviewDialog').close();
    renderAll();
    syncSourceButtons();
    if (activeChapter()?.id === chapter.id && chapter.draft) suggestNextPart();
    notify(preview.confirmedChanged
      ? '來源已更新；既有發布篇保持不變，請確認後續切篇位置'
      : '來源已更新，SMART SPLIT 已依最新內容重新計算');
  }

  function confirmSourcePreview() {
    const preview = pendingSourcePreview;
    if (!preview?.chapters?.length) return;
    if (preview.mode === 'refresh') {
      confirmRefreshPreview(preview);
      return;
    }

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
    syncSourceButtons();
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
    syncSourceButtons();
    if (chapter.draft) suggestNextPart();
    notify('已解除來源連結，現有內容保留為手動文章');
  }

  function installSourceButton() {
    const panel = document.querySelector('.source-panel');
    const head = panel?.querySelector('.panel-head');
    if (!panel || !head) return;
    const oldPlus = document.getElementById('newChapterBtn');
    if (oldPlus) oldPlus.classList.add('hidden');

    let actions = document.getElementById('sourcePanelActions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'sourcePanelActions';
      actions.className = 'source-panel-actions';
      head.appendChild(actions);
    }

    if (!document.getElementById('refreshSourceBtn')) {
      const refresh = document.createElement('button');
      refresh.id = 'refreshSourceBtn';
      refresh.type = 'button';
      refresh.className = 'button tiny ghost';
      refresh.textContent = '更新來源';
      refresh.onclick = refreshActiveSource;
      actions.appendChild(refresh);
    }

    if (!document.getElementById('loadSourceBtn')) {
      const button = document.createElement('button');
      button.id = 'loadSourceBtn';
      button.type = 'button';
      button.className = 'button tiny primary';
      button.textContent = '載入來源';
      button.onclick = openSourceDialog;
      actions.appendChild(button);
    }

    const add = document.getElementById('addChapterBtn');
    if (add) {
      add.textContent = '＋ 手動新增文章';
      add.onclick = openManualSourceDialog;
    }
    syncSourceButtons();
  }

  // Google tab selection previews first; it does not immediately mutate the workspace.
  window.importSelectedTab = function importSelectedTabWithPreview(tabId) {
    const preview = buildGooglePreview(tabId);
    if (!preview) return;
    const sameTab = state.chapters.some(chapter => chapter.source?.id === preview.doc.id && chapter.source?.tabId === preview.tab.id);
    if (sameTab) {
      notify(`「${preview.tab.title}」已經在工作區；請選擇該章節後使用「更新來源」`, true);
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
    syncSourceButtons();
  };

  const baseRenderChapters = window.renderChapters;
  window.renderChapters = function renderChaptersSourceFlow() {
    baseRenderChapters();
    syncSourceButtons();
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