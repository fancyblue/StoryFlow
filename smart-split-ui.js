// Smart Split UX: compact controls, editable title, reliable platform list, synced comparison dialog.
(function () {
  let customTitle = '';
  let suggestionIdentity = '';

  function availablePlatforms() {
    const names = [...platforms, ...Object.keys(state.formatting?.platforms || {})];
    return [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))];
  }

  function syncFormatSelect(select) {
    if (!select) return;
    const current = select.value;
    const names = availablePlatforms();
    select.innerHTML = '';
    select.add(new Option('預設格式', ''));
    names.forEach(name => select.add(new Option(name, name)));
    const values = [...select.options].map(option => option.value);
    select.value = values.includes(current) ? current : '';
  }

  function syncAllFormatSelects() {
    syncFormatSelect(document.getElementById('suggestionPlatformSelect'));
    syncFormatSelect(document.getElementById('reviewPlatformSelect'));
  }

  function currentFormatPlatform() {
    const review = document.getElementById('reviewDialog');
    if (review?.open) return document.getElementById('reviewPlatformSelect')?.value || '';
    return document.getElementById('suggestionPlatformSelect')?.value || '';
  }

  function formatText(raw, platform) {
    return platform ? platformFormat(raw, platform) : webFormat(raw);
  }

  function identityForSuggestion() {
    if (!suggestion) return '';
    return `${activeChapter()?.id || ''}:${suggestion.start}`;
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
    if (document.getElementById('reviewDialog')?.open) refreshReviewDialog(false);
  }

  function syncEditableTitle() {
    if (!suggestion) return;
    const titleRow = document.querySelector('.splitter-panel .suggestion-title-row');
    const original = document.getElementById('suggestionName');
    if (!titleRow || !original) return;

    const identity = identityForSuggestion();
    if (identity !== suggestionIdentity) {
      suggestionIdentity = identity;
      customTitle = suggestion.name;
    }
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
        customTitle = input.value;
        if (suggestion) suggestion.name = customTitle || suggestion.name;
        original.textContent = customTitle;
        const reviewTitle = document.getElementById('dialogReviewCurrentTitle');
        if (reviewTitle) reviewTitle.textContent = customTitle;
      });
      input.addEventListener('change', () => {
        if (!input.value.trim()) {
          input.value = suggestion?.name || '';
          customTitle = input.value;
        }
        if (suggestion) suggestion.name = customTitle;
        saveState('切篇標題已更新');
      });
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

  function organizeSmartSplit() {
    const panel = document.querySelector('.splitter-panel');
    const head = panel?.querySelector('.panel-head');
    const mini = document.getElementById('smartSplitMiniSettings');
    const reviewBtn = document.getElementById('openSplitReviewBtn');
    const card = document.getElementById('suggestionCard');
    const titleRow = panel?.querySelector('.suggestion-title-row');
    const formatBar = document.getElementById('splitPlatformBar');
    if (!panel || !head) return;

    // Keep a real section title. The previous compact version removed it and
    // crowded all preferences into the heading row, which made the panel read
    // like a toolbar instead of the primary editing surface.
    const titleBlock = head.querySelector(':scope > div:first-child') || head.firstElementChild;
    if (titleBlock && !titleBlock.querySelector('h2')) {
      const h2 = document.createElement('h2');
      h2.textContent = '切篇預覽';
      titleBlock.appendChild(h2);
    }

    let actions = document.getElementById('smartSplitHeaderActions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'smartSplitHeaderActions';
      actions.className = 'smart-split-header-actions';
      head.appendChild(actions);
    }
    if (reviewBtn && reviewBtn.parentElement !== actions) actions.appendChild(reviewBtn);
    if (reviewBtn) {
      reviewBtn.hidden = !suggestion;
      reviewBtn.disabled = !suggestion;
    }

    // Preferences belong to their own row below the heading, not beside it.
    if (mini) {
      if (!mini.querySelector('.smart-split-settings-label')) {
        const label = document.createElement('span');
        label.className = 'smart-split-settings-label';
        label.textContent = '切篇偏好';
        mini.prepend(label);
      }
      if (head.nextElementSibling !== mini) head.insertAdjacentElement('afterend', mini);
    }

    if (card && titleRow && formatBar && formatBar.nextElementSibling !== titleRow) {
      card.insertBefore(formatBar, titleRow);
    }
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
      if (index === start) pieces.push('<span class="range-boundary range-start">──── 這一篇開始 ────</span>\n');
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

  function scrollReviewToCurrentStart() {
    const fullBox = document.getElementById('dialogReviewFull');
    const marker = fullBox?.querySelector('.range-start');
    if (!fullBox || !marker) return;
    requestAnimationFrame(() => {
      fullBox.scrollTop = Math.max(0, marker.offsetTop - 18);
    });
  }

  function refreshReviewDialog(scrollToStart = false) {
    if (!suggestion) return;
    syncAllFormatSelects();
    const platform = document.getElementById('reviewPlatformSelect')?.value || '';
    const chapter = activeChapter();
    const previous = chapter.parts?.length ? chapter.parts[chapter.parts.length - 1] : null;
    const previousBox = document.getElementById('dialogReviewPrevious');
    const currentBox = document.getElementById('dialogReviewCurrent');
    const fullBox = document.getElementById('dialogReviewFull');
    const currentTitle = document.getElementById('dialogReviewCurrentTitle');
    const fullTitle = document.getElementById('dialogReviewFullTitle');
    const chars = document.getElementById('reviewCurrentChars');
    const meta = document.getElementById('reviewDialogMeta');

    if (previousBox) previousBox.textContent = previous ? formatText(previous.raw, platform) : '這是本章第一篇。';
    if (currentBox) currentBox.textContent = formatText(suggestion.raw, platform);
    if (fullBox) fullBox.innerHTML = reviewFullChapterHTML(platform);
    if (currentTitle) currentTitle.textContent = customTitle || suggestion.name;
    if (fullTitle) fullTitle.textContent = chapter.title;
    if (chars) chars.textContent = `${suggestion.chars.toLocaleString()} 字`;
    if (meta) meta.hidden = true;
    if (scrollToStart) scrollReviewToCurrentStart();
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
      platformSelect.addEventListener('focus', syncAllFormatSelects);
      platformSelect.addEventListener('pointerdown', syncAllFormatSelects);
      platformSelect.addEventListener('change', () => setTimeout(() => refreshReviewDialog(false), 0));
    }
  }

  function bindSuggestionPlatformSelect() {
    const select = document.getElementById('suggestionPlatformSelect');
    if (!select || select.dataset.smartSplitReliable) return;
    select.dataset.smartSplitReliable = '1';
    select.addEventListener('focus', syncAllFormatSelects);
    select.addEventListener('pointerdown', syncAllFormatSelects);
  }

  const baseRender = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionSmartSplit() {
    baseRender();
    syncAllFormatSelects();
    bindSuggestionPlatformSelect();
    organizeSmartSplit();
    if (!suggestion) {
      customTitle = '';
      suggestionIdentity = '';
      return;
    }
    syncEditableTitle();
    installPreviewOverlayControls();
    installReviewControls();
    refreshReviewDialog(false);
  };

  const reviewBtn = document.getElementById('openSplitReviewBtn');
  if (reviewBtn && !reviewBtn.dataset.smartSplitBound) {
    reviewBtn.dataset.smartSplitBound = '1';
    reviewBtn.addEventListener('click', () => setTimeout(() => {
      installReviewControls();
      refreshReviewDialog(true);
    }, 0));
  }

  syncAllFormatSelects();
  bindSuggestionPlatformSelect();
  organizeSmartSplit();
  installPreviewOverlayControls();
  installReviewControls();
  if (suggestion) syncEditableTitle();
})();