// StoryFlow incremental behavior patches.
(function () {
  let suggestionPreviewPlatform = '';

  function platformSettingSummary(platform) {
    if (!platform) {
      return {
        indent: state.formatting.defaultIndent,
        paragraphSpacing: state.formatting.defaultParagraphSpacing,
        sceneSeparator: state.formatting.defaultSceneSeparator,
        label: 'StoryFlow 預設格式'
      };
    }
    const options = platformOptions(platform);
    return {
      indent: options.indent,
      paragraphSpacing: options.paragraphSpacing,
      sceneSeparator: options.sceneSeparator,
      label: platform
    };
  }

  function suggestionPreviewText() {
    if (!suggestion) return '';
    return suggestionPreviewPlatform
      ? platformFormat(suggestion.raw, suggestionPreviewPlatform)
      : webFormat(suggestion.raw);
  }

  function ensureSplitPreviewControls() {
    const panel = document.querySelector('.splitter-panel');
    if (!panel) return;

    const head = panel.querySelector('.panel-head');
    if (head && !$('openSplitReviewBtn')) {
      const button = document.createElement('button');
      button.id = 'openSplitReviewBtn';
      button.type = 'button';
      button.className = 'button tiny ghost';
      button.textContent = '切篇確認';
      button.disabled = !suggestion;
      button.onclick = openReviewDialog;
      head.appendChild(button);
    }

    const card = $('suggestionCard');
    const preview = $('preview');
    if (!card || !preview || $('splitPlatformBar')) return;

    const bar = document.createElement('div');
    bar.id = 'splitPlatformBar';
    bar.className = 'suggestion-platform-bar';
    bar.innerHTML = `
      <label class="platform-select-field">
        <span>預覽格式</span>
        <select id="suggestionPlatformSelect" class="text-input"></select>
      </label>
      <div id="suggestionPlatformSettings" class="suggestion-platform-settings"></div>`;
    preview.insertAdjacentElement('beforebegin', bar);

    const select = $('suggestionPlatformSelect');
    select.add(new Option('StoryFlow 預設格式', ''));
    platforms.forEach(platform => select.add(new Option(platform, platform)));
    select.value = suggestionPreviewPlatform;
    select.onchange = () => {
      suggestionPreviewPlatform = select.value;
      renderSuggestionPlatformSettings();
      refreshSuggestionPreview();
    };
  }

  function renderSuggestionPlatformSettings() {
    const box = $('suggestionPlatformSettings');
    if (!box) return;
    const config = platformSettingSummary(suggestionPreviewPlatform);
    box.innerHTML = `
      <label><span>段首</span><select disabled><option>${config.indent === 'two' ? '全形兩格' : '不縮排'}</option></select></label>
      <label class="disabled-check"><input type="checkbox" disabled ${config.paragraphSpacing ? 'checked' : ''}><span>段落間空一行</span></label>
      <label class="disabled-check"><input type="checkbox" disabled ${config.sceneSeparator ? 'checked' : ''}><span>顯示場景分隔符</span></label>`;
  }

  function refreshSuggestionPreview() {
    if (!suggestion) return;
    const preview = $('preview');
    if (preview) preview.textContent = suggestionPreviewText();
    const name = $('suggestionName');
    if (name) name.textContent = suggestion.name;
  }

  function ensureReviewDialog() {
    if ($('reviewDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'reviewDialog';
    dialog.className = 'review-dialog';
    dialog.innerHTML = `
      <div class="dialog-card review-dialog-card">
        <div class="panel-head">
          <div><p class="eyebrow">CONTENT CHECK</p><h3>切篇確認</h3></div>
          <button id="closeReviewDialog" class="icon-button" type="button">×</button>
        </div>
        <p id="reviewDialogMeta" class="muted review-dialog-note"></p>
        <div class="review-dialog-grid">
          <article class="review-column">
            <div class="review-column-head"><span>上一篇</span><strong id="dialogReviewPreviousTitle">—</strong></div>
            <pre id="dialogReviewPrevious" class="review-content"></pre>
          </article>
          <article class="review-column current">
            <div class="review-column-head"><span>這一篇</span><strong id="dialogReviewCurrentTitle">—</strong></div>
            <pre id="dialogReviewCurrent" class="review-content"></pre>
          </article>
          <article class="review-column">
            <div class="review-column-head"><span>章節全文</span><strong id="dialogReviewFullTitle">—</strong></div>
            <pre id="dialogReviewFull" class="review-content"></pre>
          </article>
        </div>
        <div class="platform-preview-actions">
          <button id="closeReviewDialogBottom" class="button primary" type="button">確認完畢，回到切篇</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    $('closeReviewDialog').onclick = () => dialog.close();
    $('closeReviewDialogBottom').onclick = () => dialog.close();
  }

  function openReviewDialog() {
    if (!suggestion) return;
    ensureReviewDialog();
    const chapter = activeChapter();
    const previous = chapter.parts?.length ? chapter.parts[chapter.parts.length - 1] : null;
    const format = platformSettingSummary(suggestionPreviewPlatform);
    $('dialogReviewPreviousTitle').textContent = previous?.title || '沒有上一篇';
    $('dialogReviewPrevious').textContent = previous?.raw || '這是本章第一篇。';
    $('dialogReviewCurrentTitle').textContent = `${suggestion.name} · ${format.label}`;
    $('dialogReviewCurrent').textContent = suggestionPreviewText();
    $('dialogReviewFullTitle').textContent = chapter.title;
    $('dialogReviewFull').textContent = chapter.draft || '目前章節沒有內容。';
    $('reviewDialogMeta').textContent = `目前以「${format.label}」顯示這一篇；左看上一篇、右看完整章節，確認切點是否連續。`;
    $('reviewDialog').showModal();
  }

  function ensurePlatformPreviewDialog() {
    if ($('platformPreviewDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'platformPreviewDialog';
    dialog.innerHTML = `
      <div class="dialog-card platform-preview-dialog-card">
        <div class="panel-head">
          <div><p class="eyebrow">PUBLISH PREVIEW</p><h3 id="platformPreviewTitle">發布預覽</h3></div>
          <button id="closePlatformPreview" class="icon-button" type="button">×</button>
        </div>
        <p id="platformPreviewMeta" class="muted"></p>
        <pre id="platformPreviewContent" class="platform-preview-content"></pre>
        <div class="platform-preview-actions">
          <button id="confirmPlatformCopy" class="button primary" type="button">確認並複製</button>
          <button id="cancelPlatformCopy" class="button ghost" type="button">取消</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    $('closePlatformPreview').onclick = () => dialog.close();
    $('cancelPlatformCopy').onclick = () => dialog.close();
  }

  function previewPlatformCopy(part, platform) {
    ensurePlatformPreviewDialog();
    const dialog = $('platformPreviewDialog');
    const text = platformFormat(part.raw, platform);
    $('platformPreviewTitle').textContent = `${part.title} · ${platform}`;
    $('platformPreviewMeta').textContent = '以下就是按下確認後會複製到剪貼簿的內容。';
    $('platformPreviewContent').textContent = text;
    $('confirmPlatformCopy').onclick = async () => {
      await navigator.clipboard.writeText(text);
      dialog.close();
      notify(`已確認並複製 ${platform} 版本`);
    };
    dialog.showModal();
  }

  function ensureResetAction() {
    if ($('resetWorkspaceBtn')) return;
    const actions = document.querySelector('.top-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = 'resetWorkspaceBtn';
    button.type = 'button';
    button.className = 'button ghost reset-workspace-btn';
    button.textContent = '清除測試資料';
    button.onclick = () => {
      if (!confirm('要清除 StoryFlow 目前介面上的文章、切篇與發布狀態嗎？\n\nAPI Key、輸出資料夾授權與已寫出的 Markdown 不會刪除。')) return;
      ['storyflow.state.v1', 'storyflow.state.v2', 'storyflow.state.v3', 'storyflow.state.v4'].forEach(key => localStorage.removeItem(key));
      location.reload();
    };
    actions.insertBefore(button, $('saveBtn'));
  }

  window.buildSuggestion = function buildSuggestion(start, end, blocks = parseBlocks(activeChapter().draft)) {
    const chapter = activeChapter();
    const selected = blocks.slice(start, end);
    const raw = selected.map((block, index) => {
      const suffix = block.strongBoundaryAfter && index < selected.length - 1 ? '\n\n' : '\n';
      return block.raw + suffix;
    }).join('').trim();
    const chars = selected.reduce((sum, block) => sum + block.chars, 0);
    const max = Number(state.maxChars) || 3000;
    const min = Number(state.minChars) || 1000;
    let status = '建議';
    if (chars > max) status = '超過偏好';
    else if (chars < min) status = '低於偏好';
    const natural = Boolean(blocks[end - 1]?.strongBoundaryAfter);
    const wholeChapterInOnePart = chapter.parts.length === 0 && start === 0 && end === blocks.length;
    return {
      start, end, raw, formatted: webFormat(raw), chars,
      name: wholeChapterInOnePart ? chapter.title : `${chapter.title}（${chapter.parts.length + 1}）`,
      status,
      reason: end >= blocks.length
        ? (chars < min ? '已到章節最新內容，因此允許低於偏好最少字數；整章只有一篇時不加（1）。' : '目前已到章節最新內容。')
        : natural
          ? '目前切點是原稿中的空白段落，且已達偏好最少字數。仍可手動調整。'
          : '目前切點是一般段落結尾；仍可手動往前或往後調整。'
    };
  };

  const baseRenderSuggestion = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionPatched() {
    ensureSplitPreviewControls();
    baseRenderSuggestion();
    const reviewBtn = $('openSplitReviewBtn');
    if (reviewBtn) reviewBtn.disabled = !suggestion;
    renderSuggestionPlatformSettings();
    refreshSuggestionPreview();
    updateWorkspaceMode();
  };

  function updateWorkspaceMode() {
    const workspace = document.querySelector('.workspace-grid');
    const chapter = activeChapter();
    workspace?.classList.toggle('imported-source-mode', Boolean(chapter?.source));
  }

  window.importSelectedTab = function importSelectedTab(tabId) {
    const doc = pendingGoogleDoc;
    const tab = doc?.tabs?.find(item => item.id === tabId);
    if (!doc || !tab) return;
    const sameTab = state.chapters.filter(chapter => chapter.source?.id === doc.id && chapter.source?.tabId === tab.id);
    if (sameTab.length) {
      state.activeChapterId = sameTab[0].id;
      suggestion = null;
      saveState('此分頁已在工作區');
      els.tabDialog.close();
      renderAll();
      if (activeChapter().draft) suggestNextPart();
      notify(`「${tab.title}」已經匯入；已切換到現有內容。`);
      return;
    }

    const syncedAt = new Date().toISOString();
    const imported = tab.chapters.map((chapter, index) => ({
      id: crypto.randomUUID(), title: chapter.title || `第${index + 1}章`, draft: chapter.draft,
      confirmedBlockCount: 0, parts: [],
      source: { id: doc.id, name: doc.name, url: doc.url, tabId: tab.id, tabTitle: tab.title, headingOrdinal: chapter.headingOrdinal, headingTitle: chapter.title, syncedAt }
    }));
    const starter = state.chapters.length === 1 && !state.chapters[0].draft && !state.chapters[0].parts?.length && !state.chapters[0].source;
    if (starter) state.chapters = [];
    state.chapters.push(...imported);
    if (imported.length) state.activeChapterId = imported[0].id;
    if (!state.projectTitle || state.projectTitle === '未命名作品') state.projectTitle = doc.title;
    suggestion = null;
    saveState('Google Docs 分頁已加入工作區');
    els.tabDialog.close();
    renderAll();
    if (activeChapter().draft) suggestNextPart();
    if (tab.warnings?.length) alert(`StoryFlow 匯入提醒：\n\n${tab.warnings.join('\n')}`);
    notify(`已加入「${tab.title}」並直接產生切篇預覽。`);
  };

  window.renderChapters = function renderChapters() {
    els.chapterList.innerHTML = '';
    const groups = [];
    const map = new Map();
    for (const chapter of state.chapters) {
      const source = chapter.source;
      const key = source?.tabId ? `${source.id || 'doc'}::${source.tabId}` : '__manual__';
      if (!map.has(key)) {
        const group = { key, label: source?.tabTitle || '手動章節', docName: source?.name || '', chapters: [] };
        map.set(key, group);
        groups.push(group);
      }
      map.get(key).chapters.push(chapter);
    }
    for (const group of groups) {
      if (groups.length > 1 || group.key !== '__manual__') {
        const heading = document.createElement('div');
        heading.className = 'chapter-group-label';
        heading.innerHTML = `<strong>${escapeHtml(group.label)}</strong>${group.docName ? `<small>${escapeHtml(group.docName)}</small>` : ''}`;
        els.chapterList.appendChild(heading);
      }
      for (const chapter of group.chapters) {
        const button = document.createElement('button');
        button.className = `chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}`;
        button.innerHTML = `<span>${escapeHtml(chapter.title)}</span><small>${charCount(chapter.draft).toLocaleString()} 字</small>`;
        button.onclick = () => {
          state.activeChapterId = chapter.id;
          suggestion = null;
          saveState();
          renderAll();
          if (chapter.draft) suggestNextPart();
        };
        els.chapterList.appendChild(button);
      }
    }
  };

  const baseRenderParts = window.renderParts;
  window.renderParts = function renderPartsPatched() {
    baseRenderParts();
    const chapter = activeChapter();
    [...els.partsList.querySelectorAll('.part-row')].forEach((row, index) => {
      const part = chapter.parts[index];
      const select = row.querySelector('.copy-platform');
      const copyBtn = row.querySelector('.copy-btn');
      if (!part || !select || !copyBtn) return;
      copyBtn.textContent = '預覽平台版';
      copyBtn.onclick = () => previewPlatformCopy(part, select.value);
    });
  };

  $('generateBtn').onclick = suggestNextPart;
  ensureSplitPreviewControls();
  ensureReviewDialog();
  ensurePlatformPreviewDialog();
  ensureResetAction();
  renderAll();
  updateWorkspaceMode();
})();
