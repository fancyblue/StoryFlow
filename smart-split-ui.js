// Smart Split UX refinement: editable title, compact metadata, overlay boundary controls, synced review controls.
(function () {
  let customTitle = '';

  function currentFormatPlatform() {
    return document.getElementById('reviewPlatformSelect')?.value
      ?? document.getElementById('suggestionPlatformSelect')?.value
      ?? '';
  }

  function formatText(raw, platform) {
    return platform ? platformFormat(raw, platform) : webFormat(raw);
  }

  function preserveTitleAdjust(delta) {
    if (!suggestion) return;
    const previousTitle = customTitle || suggestion.name;
    const blocks = parseBlocks(activeChapter().draft);
    const end = Math.max(suggestion.start + 1, Math.min(blocks.length, suggestion.end + delta));
    suggestion = buildSuggestion(suggestion.start, end, blocks);
    suggestion.name = previousTitle;
    customTitle = previousTitle;
    renderSuggestion();
    syncEditableTitle();
    if (document.getElementById('reviewDialog')?.open) refreshReviewDialog();
  }

  function syncEditableTitle() {
    if (!suggestion) return;
    const titleRow = document.querySelector('.splitter-panel .suggestion-title-row');
    const original = document.getElementById('suggestionName');
    if (!titleRow || !original) return;

    if (!customTitle) customTitle = suggestion.name;
    suggestion.name = customTitle;
    original.textContent = customTitle;
    original.classList.add('suggestion-name-hidden');

    let input = document.getElementById('suggestionTitleInput');
    if (!input) {
      input = document.createElement('input');
      input.id = 'suggestionTitleInput';
      input.className = 'suggestion-title-input';
      input.type = 'text';
      input.setAttribute('aria-label', '切篇標題');
      original.insertAdjacentElement('afterend', input);
      input.addEventListener('input', () => {
        customTitle = input.value || suggestion.name;
        if (suggestion) suggestion.name = customTitle;
        original.textContent = customTitle;
        const reviewTitle = document.getElementById('dialogReviewCurrentTitle');
        if (reviewTitle) reviewTitle.textContent = customTitle;
      });
      input.addEventListener('change', () => saveState('切篇標題已更新'));
    }
    if (document.activeElement !== input) input.value = customTitle;
  }

  function installPreviewOverlayControls() {
    const preview = document.getElementById('preview');
    const controls = document.querySelector('.splitter-panel .boundary-control');
    if (!preview || !controls) return;

    let shell = document.getElementById('splitPreviewShell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'splitPreviewShell';
      shell.className = 'split-preview-shell';
      preview.parentNode.insertBefore(shell, preview);
      shell.appendChild(preview);
    }
    controls.classList.add('preview-boundary-controls');
    shell.appendChild(controls);
    document.getElementById('shrinkBtn').onclick = () => preserveTitleAdjust(-1);
    document.getElementById('expandBtn').onclick = () => preserveTitleAdjust(1);
  }

  function reviewFullChapterHTML(platform) {
    const chapter = activeChapter();
    const blocks = parseBlocks(chapter.draft);
    if (!blocks.length) return '目前章節沒有內容。';
    const options = platform ? platformOptions(platform) : {
      indent: state.formatting.defaultIndent,
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator,
      marker: state.sceneMarker
    };
    const start = suggestion?.start ?? -1;
    const end = suggestion?.end ?? -1;
    const pieces = [];

    blocks.forEach((block, index) => {
      if (index === start) pieces.push('<span class="range-boundary">──── 這一篇開始 ────</span>\n');
      const line = escapeHtml(applyIndent(block.raw, options.indent));
      pieces.push(index >= start && index < end ? `<span class="current-range-highlight">${line}</span>` : line);
      if (index === end - 1) pieces.push('\n<span class="range-boundary">──── 這一篇結束 ────</span>');
      if (index < blocks.length - 1) {
        if (block.strongBoundaryAfter && options.sceneSeparator) {
          const marker = escapeHtml(options.marker || state.sceneMarker);
          pieces.push(options.paragraphSpacing ? `\n\n${marker}\n\n` : `\n${marker}\n`);
        } else {
          pieces.push(options.paragraphSpacing ? '\n\n' : '\n');
        }
      }
    });
    return pieces.join('');
  }

  function refreshReviewDialog() {
    if (!suggestion) return;
    const platform = currentFormatPlatform();
    const chapter = activeChapter();
    const previous = chapter.parts?.length ? chapter.parts[chapter.parts.length - 1] : null;
    const previousBox = document.getElementById('dialogReviewPrevious');
    const currentBox = document.getElementById('dialogReviewCurrent');
    const fullBox = document.getElementById('dialogReviewFull');
    const currentTitle = document.getElementById('dialogReviewCurrentTitle');
    const fullTitle = document.getElementById('dialogReviewFullTitle');
    const chars = document.getElementById('reviewCurrentChars');

    if (previousBox) previousBox.textContent = previous ? formatText(previous.raw, platform) : '這是本章第一篇。';
    if (currentBox) currentBox.textContent = formatText(suggestion.raw, platform);
    if (fullBox) fullBox.innerHTML = reviewFullChapterHTML(platform);
    if (currentTitle) currentTitle.textContent = customTitle || suggestion.name;
    if (fullTitle) fullTitle.textContent = chapter.title;
    if (chars) chars.textContent = `${suggestion.chars.toLocaleString()} 字`;
  }

  function installReviewControls() {
    const dialog = document.getElementById('reviewDialog');
    if (!dialog) return;
    const formatBar = dialog.querySelector('.review-format-bar');
    if (formatBar && !document.getElementById('reviewBoundaryControls')) {
      const controls = document.createElement('div');
      controls.id = 'reviewBoundaryControls';
      controls.className = 'review-boundary-controls';
      controls.innerHTML = `
        <span id="reviewCurrentChars" class="review-current-chars"></span>
        <button id="reviewShrinkBtn" class="button tiny ghost" type="button">← 少一段</button>
        <button id="reviewExpandBtn" class="button tiny ghost" type="button">多一段 →</button>`;
      formatBar.appendChild(controls);
      document.getElementById('reviewShrinkBtn').onclick = () => preserveTitleAdjust(-1);
      document.getElementById('reviewExpandBtn').onclick = () => preserveTitleAdjust(1);
    }

    const platformSelect = document.getElementById('reviewPlatformSelect');
    if (platformSelect && !platformSelect.dataset.smartSplitBound) {
      platformSelect.dataset.smartSplitBound = '1';
      platformSelect.addEventListener('change', () => setTimeout(refreshReviewDialog, 0));
    }
  }

  function compactHeader() {
    const panel = document.querySelector('.splitter-panel');
    const head = panel?.querySelector('.panel-head');
    const mini = document.getElementById('smartSplitMiniSettings');
    if (!head) return;
    const h2 = head.querySelector('h2');
    if (h2) h2.remove();
    if (mini && mini.parentElement !== head) head.appendChild(mini);
  }

  const baseRender = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionSmartSplit() {
    baseRender();
    if (!suggestion) {
      customTitle = '';
      return;
    }
    if (!customTitle || !document.getElementById('suggestionTitleInput')) customTitle = suggestion.name;
    suggestion.name = customTitle;
    compactHeader();
    syncEditableTitle();
    installPreviewOverlayControls();
    installReviewControls();
    refreshReviewDialog();
  };

  const reviewBtn = document.getElementById('openSplitReviewBtn');
  if (reviewBtn && !reviewBtn.dataset.smartSplitBound) {
    reviewBtn.dataset.smartSplitBound = '1';
    reviewBtn.addEventListener('click', () => setTimeout(() => {
      installReviewControls();
      refreshReviewDialog();
    }, 0));
  }

  compactHeader();
  installPreviewOverlayControls();
  installReviewControls();
  if (suggestion) {
    customTitle = suggestion.name;
    syncEditableTitle();
  }
})();