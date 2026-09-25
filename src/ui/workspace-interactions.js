// Workspace interaction dialogs and review controls.
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

  function formatTextForPlatform(raw, platform) {
    return platform ? platformFormat(raw, platform) : webFormat(raw);
  }

  function suggestionPreviewText() {
    return suggestion ? formatTextForPlatform(suggestion.raw, suggestionPreviewPlatform) : '';
  }

  function platformSettingsMarkup(platform) {
    const config = platformSettingSummary(platform);
    return `
      <label><span>段首</span><select disabled><option>${config.indent === 'two' ? '全形兩格' : '不縮排'}</option></select></label>
      <label class="disabled-check"><input type="checkbox" disabled ${config.paragraphSpacing ? 'checked' : ''}><span>段落間空一行</span></label>
      <label class="disabled-check"><input type="checkbox" disabled ${config.sceneSeparator ? 'checked' : ''}><span>顯示場景分隔符</span></label>`;
  }

  function renderSuggestionPlatformSettings() {
    const box = $('suggestionPlatformSettings');
    if (box) box.innerHTML = platformSettingsMarkup(suggestionPreviewPlatform);
  }

  function refreshSuggestionPreview() {
    if (!suggestion) return;
    if ($('preview')) $('preview').textContent = suggestionPreviewText();
    if ($('suggestionName')) $('suggestionName').textContent = suggestion.name;
  }

  function ensureSplitPreviewControls() {
    const panel = document.querySelector('.splitter-panel');
    if (!panel) return;
    const head = panel.querySelector('.panel-head');
    if (head && !$('openReadingViewBtn')) {
      const button = document.createElement('button');
      button.id = 'openReadingViewBtn';
      button.type = 'button';
      button.className = 'button tiny ghost';
      button.textContent = '讀稿檢視';
      button.disabled = !suggestion;
      button.onclick = openReadingView;
      head.appendChild(button);
    }

    const preview = $('preview');
    if (!preview || $('splitPlatformBar')) return;
    const bar = document.createElement('div');
    bar.id = 'splitPlatformBar';
    bar.className = 'suggestion-platform-bar compact-format-bar';
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

  // The reading view is a page, not a modal: 讀稿 reads the chapter and 接縫 marks the cut
  // points in that same flow. boundary-engine owns what the flow says; this only owns the
  // shell — opening it, closing it, and keeping its format select in step with the panel's.
  function readingView() {
    return $('readingView');
  }

  function ensureReadingView() {
    const view = readingView();
    if (!view || view.dataset.readingReady) return view;
    view.dataset.readingReady = '1';

    const select = $('readingPlatformSelect');
    if (select && !select.options.length) window.StoryFlowShared.fillPlatformSelect(select);
    if (select) {
      select.value = suggestionPreviewPlatform;
      select.onchange = () => {
        suggestionPreviewPlatform = select.value;
        if ($('suggestionPlatformSelect')) $('suggestionPlatformSelect').value = suggestionPreviewPlatform;
        renderSuggestionPlatformSettings();
        refreshSuggestionPreview();
      };
    }

    $('closeReadingViewBtn').onclick = closeReadingView;
    $('readingConfirmBtn').onclick = () => {
      $('confirmBtn')?.click();
      closeReadingView();
    };
    return view;
  }

  function syncReadingHead() {
    const chapter = activeChapter();
    const title = $('readingViewTitle');
    const progress = $('readingViewProgress');
    if (title) title.textContent = chapter?.title || '章節';
    if (!progress) return;
    const parts = chapter?.parts?.length || 0;
    const blocks = chapter ? parseBlocks(chapter.draft) : [];
    const done = Math.min(Number(chapter?.confirmedBlockCount || 0), blocks.length);
    progress.textContent = blocks.length
      ? `已確認 ${parts} 篇 · 原稿 ${blocks.length} 段中的第 ${Math.min(done + 1, blocks.length)} 段起還沒切`
      : '這個章節還沒有內容。';
  }

  function openReadingView() {
    const view = ensureReadingView();
    if (!view) return;
    const select = $('readingPlatformSelect');
    if (select) select.value = suggestionPreviewPlatform;
    syncReadingHead();
    view.hidden = false;
    document.body.classList.add('sf-reading-open');
    window.StoryFlowPreviewMode?.setMode?.('reading', 'preview');
    window.StoryFlowSetReadingViewMode?.('read');
    window.StoryFlowRefreshReviewFromSource?.(true);
    window.StoryFlowPreviewMode?.refresh?.();
    $('closeReadingViewBtn')?.focus?.({ preventScroll: true });
  }

  function closeReadingView() {
    const view = readingView();
    if (!view || view.hidden) return;
    view.hidden = true;
    document.body.classList.remove('sf-reading-open');
    window.StoryFlowSetReadingViewMode?.('read');
    $('openReadingViewBtn')?.focus?.({ preventScroll: true });
  }

  window.StoryFlowReadingView = {
    open: openReadingView,
    close: closeReadingView,
    isOpen: () => Boolean(readingView()) && !readingView().hidden,
    syncHead: syncReadingHead
  };

  // A page has no built-in dismissal the way a dialog does, and Escape is what a reader
  // reaches for. A modal on top owns the key first — and only a modal: settings-page.js
  // keeps `#settingsDialog` permanently `open` so it can render inline, so `dialog[open]`
  // alone would mean this key never reached the reading surface at all.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!window.StoryFlowReadingView.isOpen()) return;
    if ([...document.querySelectorAll('dialog[open]')].some(dialog => dialog.matches(':modal'))) return;
    event.preventDefault();
    closeReadingView();
  });

  // Reading is about one chapter of one work. Leaving the workbench or switching work
  // would otherwise leave the previous chapter's text on screen.
  window.addEventListener('storyflow:view-changed', event => {
    if (event.detail?.view !== 'workspace') closeReadingView();
  });
  window.addEventListener('storyflow:projects-changed', closeReadingView);

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
    const raw = selected.map((block, index) => block.raw + (block.strongBoundaryAfter && index < selected.length - 1 ? '\n\n' : '\n')).join('').trim();
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
        : natural ? '目前切點是原稿中的空白段落，且已達偏好最少字數。仍可手動調整。' : '目前切點是一般段落結尾；仍可手動往前或往後調整。'
    };
  };

  StoryFlowRender.before('renderSuggestion', 'workspace-interactions', () => ensureSplitPreviewControls());
  StoryFlowRender.after('renderSuggestion', 'workspace-interactions', () => {
    const reviewBtn = $('openReadingViewBtn');
    if (reviewBtn) reviewBtn.disabled = !suggestion;
    renderSuggestionPlatformSettings();
    refreshSuggestionPreview();
    updateWorkspaceMode();
  });

  function updateWorkspaceMode() {
    const workspace = document.querySelector('.workspace-grid');
    workspace?.classList.toggle('imported-source-mode', Boolean(activeChapter()?.source));
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
      id: crypto.randomUUID(), title: chapter.title || `第${index + 1}章`, draft: chapter.draft, confirmedBlockCount: 0, parts: [],
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

  if ($('generateBtn')) $('generateBtn').onclick = suggestNextPart;
  ensureSplitPreviewControls();
  ensureReadingView();
  ensureResetAction();
  renderAll();
  updateWorkspaceMode();
})();
