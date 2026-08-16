// Canonical boundary engine: source scenes decide manual adjustments; publication formatting happens only after.
(function () {
  const CONTROL_DIRECTIONS = new Map([
    ['shrinkBtn', -1],
    ['expandBtn', 1],
    ['reviewShrinkBtn', -1],
    ['reviewExpandBtn', 1]
  ]);

  function sourceBlocks() {
    return parseBlocks(activeChapter()?.draft || '');
  }

  // A source scene ends at a true source blank paragraph. parseBlocks represents
  // that as strongBoundaryAfter on the preceding block. The final scene always
  // ends at the chapter tail even when there is no trailing blank paragraph.
  function sceneEnds(blocks) {
    const ends = [];
    blocks.forEach((block, index) => {
      if (block.strongBoundaryAfter) ends.push(index + 1);
    });
    if (blocks.length && ends[ends.length - 1] !== blocks.length) ends.push(blocks.length);
    return ends;
  }

  function nextSceneEnd(start, currentEnd, blocks) {
    const ends = sceneEnds(blocks);
    return ends.find(end => end > currentEnd) ?? blocks.length;
  }

  function previousSceneEnd(start, currentEnd, blocks) {
    const ends = sceneEnds(blocks).filter(end => end > start && end < currentEnd);
    return ends.length ? ends[ends.length - 1] : currentEnd;
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

  function targetEnd(direction, blocks) {
    if (!suggestion || !blocks.length) return null;
    const start = Number(suggestion.start);
    const currentEnd = Number(suggestion.end);
    if (direction > 0) return nextSceneEnd(start, currentEnd, blocks);
    return previousSceneEnd(start, currentEnd, blocks);
  }

  function syncControlState() {
    const blocks = sourceBlocks();
    const start = Number(suggestion?.start ?? 0);
    const currentEnd = Number(suggestion?.end ?? 0);
    const previousEnd = suggestion ? previousSceneEnd(start, currentEnd, blocks) : currentEnd;
    const nextEnd = suggestion ? nextSceneEnd(start, currentEnd, blocks) : currentEnd;

    for (const [id, direction] of CONTROL_DIRECTIONS) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.textContent = direction < 0 ? '← 少一個場景' : '多一個場景 →';
      button.disabled = !suggestion || (direction < 0 ? previousEnd === currentEnd : nextEnd === currentEnd);
      button.title = direction < 0
        ? '將切篇結尾移到上一個原稿場景分隔點'
        : '將切篇結尾移到下一個原稿場景分隔點；後面沒有分隔點時直接到章節尾';
    }
  }

  function adjust(direction) {
    if (!suggestion) return;
    const blocks = sourceBlocks();
    if (!blocks.length) return;

    const start = Number(suggestion.start);
    const oldEnd = Number(suggestion.end);
    const nextEnd = targetEnd(direction, blocks);
    if (nextEnd == null || nextEnd === oldEnd) {
      syncControlState();
      return;
    }

    const titleInput = document.getElementById('suggestionTitleInput');
    const title = titleInput?.value?.trim() || suggestion.name;
    suggestion = buildSuggestion(start, nextEnd, blocks);
    suggestion.name = title;
    renderSuggestion();

    const restoredTitle = document.getElementById('suggestionTitleInput');
    if (restoredTitle) restoredTitle.value = title;
    suggestion.name = title;
    refreshReview(false);
    syncControlState();
  }

  // Capture before every older target-level handler. One click means one source scene move.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button) return;
    const direction = CONTROL_DIRECTIONS.get(button.id);
    if (!direction) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    adjust(direction);
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'reviewPlatformSelect') refreshReview(false);
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#openSplitReviewBtn')) {
      setTimeout(() => {
        refreshReview(true);
        syncControlState();
      }, 0);
    }
  });

  const previousRenderSuggestion = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionWithSceneControls() {
    previousRenderSuggestion();
    syncControlState();
  };

  window.adjustSuggestion = adjust;
  window.StoryFlowSourceParagraphs = sourceBlocks;
  window.StoryFlowSceneEnds = () => sceneEnds(sourceBlocks());
  window.StoryFlowRefreshReviewFromSource = refreshReview;

  syncControlState();
})();