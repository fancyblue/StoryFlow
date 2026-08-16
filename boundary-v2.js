// Canonical boundary engine: exactly one click path, source draft decides cuts, formatting happens only after.
(function () {
  const CONTROL_DELTAS = new Map([
    ['shrinkBtn', -1],
    ['expandBtn', 1],
    ['reviewShrinkBtn', -1],
    ['reviewExpandBtn', 1]
  ]);

  function sourceBlocks() {
    return parseBlocks(activeChapter()?.draft || '');
  }

  function currentReviewPlatform() {
    return document.getElementById('reviewPlatformSelect')?.value || '';
  }

  function formatOptions(platform) {
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
    const options = formatOptions(currentReviewPlatform());
    const start = suggestion?.start ?? -1;
    const end = suggestion?.end ?? -1;
    const out = [];

    blocks.forEach((block, index) => {
      if (index === start) out.push('<span class="range-boundary range-start">──── 這一篇開始 ────</span>\n');
      const line = escapeHtml(applyIndent(block.raw, options.indent));
      out.push(index >= start && index < end
        ? `<span class="current-range-highlight">${line}</span>`
        : line);
      if (index === end - 1) out.push('\n<span class="range-boundary range-end">──── 這一篇結束 ────</span>');
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
    const platform = currentReviewPlatform();
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
    if (!blocks.length) return;

    const start = Number(suggestion.start);
    const oldEnd = Number(suggestion.end);
    const nextEnd = Math.max(start + 1, Math.min(blocks.length, oldEnd + delta));
    if (nextEnd === oldEnd) return;

    const titleInput = document.getElementById('suggestionTitleInput');
    const title = titleInput?.value?.trim() || suggestion.name;
    suggestion = buildSuggestion(start, nextEnd, blocks);
    suggestion.name = title;
    renderSuggestion();

    const restoredTitle = document.getElementById('suggestionTitleInput');
    if (restoredTitle) restoredTitle.value = title;
    suggestion.name = title;
    refreshReview(false);
  }

  // Capture before every older target-level handler. Each click changes source end index exactly once.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button) return;
    const delta = CONTROL_DELTAS.get(button.id);
    if (!delta) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    adjust(delta);
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'reviewPlatformSelect') refreshReview(false);
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#openSplitReviewBtn')) setTimeout(() => refreshReview(true), 0);
  });

  window.adjustSuggestion = adjust;
  window.StoryFlowSourceParagraphs = sourceBlocks;
  window.StoryFlowRefreshReviewFromSource = refreshReview;
})();