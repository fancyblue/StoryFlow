// StoryFlow incremental behavior patches.
// Kept separate so current published workspace state can migrate without rewriting saved data.

(function () {
  let reviewSelection = null;
  let suggestionPreviewPlatform = '';

  function reviewMarkup() {
    return `
      <div class="inline-review-head">
        <div><p class="eyebrow">CONTENT CHECK</p><h3>切篇確認</h3></div>
        <div class="inline-review-actions">
          <span class="muted">直接核對切點，再確認存成 Markdown</span>
          <button id="expandReviewBtn" class="button tiny ghost" type="button">放大對照</button>
        </div>
      </div>
      <div class="suggestion-platform-bar">
        <label>
          <span>平台預覽</span>
          <select id="suggestionPlatformSelect" class="text-input compact-select"></select>
        </label>
        <div id="suggestionPlatformSettings" class="suggestion-platform-settings"></div>
      </div>
      <div class="review-grid compact-review-grid">
        <article class="review-column">
          <div class="review-column-head"><span>上一篇</span><strong id="reviewPreviousTitle">—</strong></div>
          <pre id="reviewPrevious" class="review-content"></pre>
        </article>
        <article class="review-column current">
          <div class="review-column-head"><span id="reviewCurrentLabel">這一篇（尚未存檔）</span><strong id="reviewCurrentTitle">—</strong></div>
          <pre id="reviewCurrent" class="review-content"></pre>
        </article>
        <article class="review-column">
          <div class="review-column-head"><span>章節全文</span><strong id="reviewFullTitle">—</strong></div>
          <pre id="reviewFull" class="review-content"></pre>
        </article>
      </div>`;
  }

  function ensureReviewDialog() {
    if ($('reviewDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'reviewDialog';
    dialog.className = 'review-dialog';
    dialog.innerHTML = `
      <div class="dialog-card review-dialog-card">
        <div class="panel-head">
          <div><p class="eyebrow">CONTENT CHECK</p><h3>切篇完整對照</h3></div>
          <button id="closeReviewDialog" class="icon-button" type="button">×</button>
        </div>
        <p class="muted review-dialog-note">左：上一篇｜中：這一篇｜右：章節全文</p>
        <div class="review-dialog-grid">
          <article class="review-column">
            <div class="review-column-head"><span>上一篇</span><strong id="dialogReviewPreviousTitle">—</strong></div>
            <pre id="dialogReviewPrevious" class="review-content"></pre>
          </article>
          <article class="review-column current">
            <div class="review-column-head"><span id="dialogReviewCurrentLabel">這一篇（尚未存檔）</span><strong id="dialogReviewCurrentTitle">—</strong></div>
            <pre id="dialogReviewCurrent" class="review-content"></pre>
          </article>
          <article class="review-column">
            <div class="review-column-head"><span>章節全文</span><strong id="dialogReviewFullTitle">—</strong></div>
            <pre id="dialogReviewFull" class="review-content"></pre>
          </article>
        </div>
        <div class="platform-preview-actions">
          <button id="closeReviewDialogBottom" class="button primary" type="button">回到切篇</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    $('closeReviewDialog').onclick = () => dialog.close();
    $('closeReviewDialogBottom').onclick = () => dialog.close();
  }

  function syncReviewDialog() {
    ensureReviewDialog();
    $('dialogReviewPreviousTitle').textContent = $('reviewPreviousTitle')?.textContent || '—';
    $('dialogReviewPrevious').textContent = $('reviewPrevious')?.textContent || '';
    $('dialogReviewCurrentLabel').textContent = $('reviewCurrentLabel')?.textContent || '這一篇（尚未存檔）';
    $('dialogReviewCurrentTitle').textContent = $('reviewCurrentTitle')?.textContent || '—';
    $('dialogReviewCurrent').textContent = $('reviewCurrent')?.textContent || '';
    $('dialogReviewFullTitle').textContent = $('reviewFullTitle')?.textContent || '—';
    $('dialogReviewFull').textContent = $('reviewFull')?.textContent || '';
  }

  function openReviewDialog() {
    syncReviewDialog();
    $('reviewDialog').showModal();
  }

  function platformSettingSummary(platform) {
    if (!platform) {
      return {
        indent: state.formatting.defaultIndent,
        paragraphSpacing: state.formatting.defaultParagraphSpacing,
        sceneSeparator: state.formatting.defaultSceneSeparator,
        label: 'StoryFlow 預設'
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

  function renderSuggestionPlatformSettings() {
    const box = $('suggestionPlatformSettings');
    if (!box) return;
    const config = platformSettingSummary(suggestionPreviewPlatform);
    box.innerHTML = `
      <label><span>段首</span><select disabled><option>${config.indent === 'two' ? '全形兩格' : '不縮排'}</option></select></label>
      <label class="disabled-check"><input type="checkbox" disabled ${config.paragraphSpacing ? 'checked' : ''}><span>段落間空一行</span></label>
      <label class="disabled-check"><input type="checkbox" disabled ${config.sceneSeparator ? 'checked' : ''}><span>顯示場景分隔符</span></label>`;
  }

  function currentSuggestionPreviewText() {
    if (!suggestion) return '';
    return suggestionPreviewPlatform
      ? platformFormat(suggestion.raw, suggestionPreviewPlatform)
      : webFormat(suggestion.raw);
  }

  function ensureInlineReview() {
    if ($('inlineReview')) return;
    const card = $('suggestionCard');
    const confirmBtn = $('confirmBtn');
    if (!card || !confirmBtn) return;
    const review = document.createElement('section');
    review.id = 'inlineReview';
    review.className = 'inline-review hidden';
    review.innerHTML = reviewMarkup();
    confirmBtn.insertAdjacentElement('beforebegin', review);
    $('expandReviewBtn').onclick = openReviewDialog;

    const select = $('suggestionPlatformSelect');
    select.add(new Option('StoryFlow 預設格式', ''));
    platforms.forEach(platform => select.add(new Option(platform, platform)));
    select.value = suggestionPreviewPlatform;
    select.onchange = () => {
      suggestionPreviewPlatform = select.value;
      renderSuggestionPlatformSettings();
      showReview({ currentSuggestion: suggestion });
    };
  }

  function showReview({ currentPart = null, currentSuggestion = null } = {}) {
    ensureInlineReview();
    const review = $('inlineReview');
    if (!review) return;
    const chapter = activeChapter();
    const parts = chapter.parts || [];

    let current = currentPart;
    let previous = null;
    if (currentSuggestion) {
      current = {
        title: currentSuggestion.name,
        raw: currentSuggestion.raw,
        startBlock: currentSuggestion.start,
        endBlock: currentSuggestion.end
      };
      previous = parts.length ? parts[parts.length - 1] : null;
    } else if (currentPart) {
      const index = parts.findIndex(part => part.id === currentPart.id);
      previous = index > 0 ? parts[index - 1] : null;
    }

    $('reviewPreviousTitle').textContent = previous?.title || '沒有上一篇';
    $('reviewPrevious').textContent = previous?.raw || '這是本章第一篇。';
    $('reviewCurrentTitle').textContent = current?.title || '尚未產生';
    $('reviewCurrentLabel').textContent = suggestionPreviewPlatform
      ? `這一篇 · ${suggestionPreviewPlatform} 預覽`
      : '這一篇（尚未存檔）';
    $('reviewCurrent').textContent = currentSuggestion
      ? currentSuggestionPreviewText()
      : (current?.raw || '按「產生下一篇」後會在這裡顯示。');
    $('reviewFullTitle').textContent = chapter.title;
    $('reviewFull').textContent = chapter.draft || '目前章節沒有內容。';
    renderSuggestionPlatformSettings();
    review.classList.remove('hidden');
    reviewSelection = current?.id || (currentSuggestion ? '__suggestion__' : null);
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
    button.title = '清除文章、切篇與發布狀態；保留 Google Picker API Key 與輸出資料夾授權';
    button.onclick = () => {
      const ok = confirm('要清除 StoryFlow 目前介面上的文章、切篇與發布狀態嗎？\n\nGoogle Picker API Key 與輸出資料夾授權會保留；已經寫入 Google Drive 的 Markdown 檔不會刪除。');
      if (!ok) return;
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
    const partName = wholeChapterInOnePart ? chapter.title : `${chapter.title}（${chapter.parts.length + 1}）`;

    return {
      start, end, raw, formatted: webFormat(raw), chars, name: partName, status,
      reason: end >= blocks.length
        ? (chars < min ? '已到章節最新內容，因此允許低於偏好最少字數；整章只有一篇時不加（1）。' : '目前已到章節最新內容；可以確認，或等待原稿繼續增加。')
        : natural
          ? '目前切點是原稿中的空白段落，且已達偏好最少字數。仍可手動往前或往後調整。'
          : '目前切點是一般段落結尾。你可以把後面的段落拉進來，即使超過偏好字數。'
    };
  };

  const baseRenderSuggestion = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionPatched() {
    ensureInlineReview();
    baseRenderSuggestion();
    const workspace = document.querySelector('.workspace-grid');
    workspace?.classList.toggle('split-review-mode', Boolean(suggestion));
    if (suggestion) showReview({ currentSuggestion: suggestion });
    else $('inlineReview')?.classList.add('hidden');
  };

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
      notify(`「${tab.title}」已經匯入；已切換到現有內容，不會覆寫其他分頁。`);
      return;
    }

    const syncedAt = new Date().toISOString();
    const imported = tab.chapters.map((chapter, index) => ({
      id: crypto.randomUUID(), title: chapter.title || `第${index + 1}章`, draft: chapter.draft,
      confirmedBlockCount: 0, parts: [],
      source: { id: doc.id, name: doc.name, url: doc.url, tabId: tab.id, tabTitle: tab.title, headingOrdinal: chapter.headingOrdinal, headingTitle: chapter.title, syncedAt }
    }));

    const isUntouchedStarter = state.chapters.length === 1 && !state.chapters[0].draft && !state.chapters[0].parts?.length && !state.chapters[0].source && (state.chapters[0].title === '第一章' || state.projectTitle === '未命名作品');
    if (isUntouchedStarter) state.chapters = [];
    if (imported.length) {
      state.chapters.push(...imported);
      state.activeChapterId = imported[0].id;
    }
    if (!state.projectTitle || state.projectTitle === '未命名作品') state.projectTitle = doc.title;
    suggestion = null;
    saveState('Google Docs 分頁已加入工作區');
    els.tabDialog.close();
    renderAll();
    if (activeChapter().draft) suggestNextPart();
    if (tab.warnings?.length) alert(`StoryFlow 匯入提醒：\n\n${tab.warnings.join('\n')}`);
    notify(`已加入「${tab.title}」：${imported.length || 1} 個章節；已直接產生第一個切篇建議。`);
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
          reviewSelection = null;
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
    const rows = [...els.partsList.querySelectorAll('.part-row')];
    rows.forEach((row, index) => {
      const part = chapter.parts[index];
      if (!part) return;
      const actions = row.querySelector('.part-actions');
      const select = row.querySelector('.copy-platform');
      const copyBtn = row.querySelector('.copy-btn');
      if (!actions || !select || !copyBtn) return;
      copyBtn.textContent = '預覽平台版';
      copyBtn.onclick = () => previewPlatformCopy(part, select.value);
      row.classList.toggle('review-selected', reviewSelection === part.id);
    });
  };

  $('generateBtn').onclick = suggestNextPart;
  ensureInlineReview();
  ensureReviewDialog();
  ensurePlatformPreviewDialog();
  ensureResetAction();
  renderAll();
})();
