// Boundary engine v3: one canonical paragraph model, one click handler, formatting only after the cut is chosen.
(function () {
  function sourceBlocks() {
    return parseBlocks(activeChapter()?.draft || '');
  }

  function reviewPlatform() {
    return document.getElementById('reviewPlatformSelect')?.value || '';
  }

  function optionsFor(platform) {
    return platform ? platformOptions(platform) : {
      indent: state.formatting.defaultIndent,
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator,
      marker: state.sceneMarker
    };
  }

  function formattedFullChapterHTML() {
    const blocks = sourceBlocks();
    if (!blocks.length) return '目前章節沒有內容。';
    const options = optionsFor(reviewPlatform());
    const start = suggestion?.start ?? -1;
    const end = suggestion?.end ?? -1;
    const out = [];

    blocks.forEach((block, index) => {
      if (index === start) out.push('<span class="range-boundary range-start">──── 這一篇開始 ────</span>\n');
      const line = escapeHtml(applyIndent(block.raw, options.indent));
      out.push(index >= start && index < end ? `<span class="current-range-highlight">${line}</span>` : line);
      if (index === end - 1) out.push('\n<span class="range-boundary">──── 這一篇結束 ────</span>');
      if (index >= blocks.length - 1) return;
      if (block.strongBoundaryAfter && options.sceneSeparator) {
        const marker = escapeHtml(options.marker || state.sceneMarker || '＊＊＊');
        out.push(options.paragraphSpacing ? `\n\n${marker}\n\n` : `\n${marker}\n`);
      } else {
        out.push(options.paragraphSpacing ? '\n\n' : '\n');
      }
    });
    return out.join('');
  }

  function refreshReview(scrollToStart = false) {
    if (!suggestion) return;
    const chapter = activeChapter();
    const platform = reviewPlatform();
    const previous = chapter.parts?.length ? chapter.parts[chapter.parts.length - 1] : null;
    const full = document.getElementById('dialogReviewFull');
    const current = document.getElementById('dialogReviewCurrent');
    const previousBox = document.getElementById('dialogReviewPrevious');
    const chars = document.getElementById('reviewCurrentChars');

    if (full) full.innerHTML = formattedFullChapterHTML();
    if (current) current.textContent = platform ? platformFormat(suggestion.raw, platform) : webFormat(suggestion.raw);
    if (previousBox) previousBox.textContent = previous
      ? (platform ? platformFormat(previous.raw, platform) : webFormat(previous.raw))
      : '這是本章第一篇。';
    if (chars) chars.textContent = `${suggestion.chars.toLocaleString()} 字`;

    if (scrollToStart && full) {
      const marker = full.querySelector('.range-start');
      if (marker) requestAnimationFrame(() => { full.scrollTop = Math.max(0, marker.offsetTop - 18); });
    }
  }

  function adjust(delta) {
    if (!suggestion) return;
    const blocks = sourceBlocks();
    const titleInput = document.getElementById('suggestionTitleInput');
    const title = titleInput?.value?.trim() || suggestion.name;
    const nextEnd = Math.max(suggestion.start + 1, Math.min(blocks.length, suggestion.end + delta));
    if (nextEnd === suggestion.end) return;

    suggestion = buildSuggestion(suggestion.start, nextEnd, blocks);
    suggestion.name = title;
    renderSuggestion();
    const restoredTitle = document.getElementById('suggestionTitleInput');
    if (restoredTitle) restoredTitle.value = title;
    suggestion.name = title;
    refreshReview(false);
  }

  function replaceAndBind(id, delta) {
    const oldButton = document.getElementById(id);
    if (!oldButton) return;

    if (oldButton.dataset.boundaryV3 === '1') {
      // Older UI layers reassign .onclick during render. Remove it every time.
      oldButton.onclick = null;
      return;
    }

    // Replacing the node drops every listener installed by older boundary patches.
    const button = oldButton.cloneNode(true);
    button.onclick = null;
    button.dataset.boundaryV3 = '1';
    oldButton.replaceWith(button);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      adjust(delta);
    }, true);
  }

  function bindControls() {
    replaceAndBind('shrinkBtn', -1);
    replaceAndBind('expandBtn', 1);
    replaceAndBind('reviewShrinkBtn', -1);
    replaceAndBind('reviewExpandBtn', 1);

    const select = document.getElementById('reviewPlatformSelect');
    if (select && select.dataset.boundaryV3 !== '1') {
      select.dataset.boundaryV3 = '1';
      select.addEventListener('change', () => refreshReview(false));
    }

    const open = document.getElementById('openSplitReviewBtn');
    if (open && open.dataset.boundaryV3 !== '1') {
      open.dataset.boundaryV3 = '1';
      open.addEventListener('click', () => setTimeout(() => refreshReview(true), 0));
    }
  }

  const previousRender = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionBoundaryV3() {
    previousRender();
    bindControls();
    if (document.getElementById('reviewDialog')?.open) refreshReview(false);
  };

  window.adjustSuggestion = adjust;
  window.StoryFlowSourceParagraphs = sourceBlocks;
  window.StoryFlowRefreshReviewFromSource = refreshReview;

  bindControls();
})();