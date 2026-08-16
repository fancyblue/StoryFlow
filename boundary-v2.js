// Boundary engine v2: source paragraphs decide cuts; publication formatting is preview-only.
(function () {
  function sourceParagraphs(chapter = activeChapter()) {
    const lines = String(chapter?.draft || '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let pendingBlank = false;

    for (const line of lines) {
      if (!line.trim()) {
        if (blocks.length) pendingBlank = true;
        continue;
      }
      if (pendingBlank && blocks.length) blocks[blocks.length - 1].strongBoundaryAfter = true;
      pendingBlank = false;
      const raw = line.trimEnd();
      blocks.push({
        id: `source-paragraph-${blocks.length + 1}`,
        raw,
        chars: charCount(raw),
        strongBoundaryAfter: false
      });
    }
    return blocks;
  }

  function selectedReviewPlatform() {
    return document.getElementById('reviewPlatformSelect')?.value || '';
  }

  function formatOptions(platform) {
    if (platform) return platformOptions(platform);
    return {
      indent: state.formatting.defaultIndent,
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator,
      marker: state.sceneMarker
    };
  }

  function formattedHighlightedChapterHTML() {
    const blocks = sourceParagraphs();
    if (!blocks.length) return '目前章節沒有內容。';
    const options = formatOptions(selectedReviewPlatform());
    const start = suggestion?.start ?? -1;
    const end = suggestion?.end ?? -1;
    const out = [];

    blocks.forEach((block, index) => {
      if (index === start) out.push('<span class="range-boundary range-start">──── 這一篇開始 ────</span>\n');
      const line = escapeHtml(applyIndent(block.raw, options.indent));
      out.push(index >= start && index < end
        ? `<span class="current-range-highlight">${line}</span>`
        : line);
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

  function refreshReviewFromSource(scrollToStart = false) {
    if (!suggestion) return;
    const full = document.getElementById('dialogReviewFull');
    const current = document.getElementById('dialogReviewCurrent');
    const previous = document.getElementById('dialogReviewPrevious');
    const chars = document.getElementById('reviewCurrentChars');
    const chapter = activeChapter();
    const platform = selectedReviewPlatform();
    const prevPart = chapter.parts?.length ? chapter.parts[chapter.parts.length - 1] : null;

    if (full) full.innerHTML = formattedHighlightedChapterHTML();
    if (current) current.textContent = platform ? platformFormat(suggestion.raw, platform) : webFormat(suggestion.raw);
    if (previous) previous.textContent = prevPart
      ? (platform ? platformFormat(prevPart.raw, platform) : webFormat(prevPart.raw))
      : '這是本章第一篇。';
    if (chars) chars.textContent = `${suggestion.chars.toLocaleString()} 字`;

    if (scrollToStart && full) {
      const marker = full.querySelector('.range-start');
      if (marker) requestAnimationFrame(() => { full.scrollTop = Math.max(0, marker.offsetTop - 18); });
    }
  }

  function adjustBySourceParagraph(delta) {
    if (!suggestion) return;
    const blocks = sourceParagraphs();
    const titleInput = document.getElementById('suggestionTitleInput');
    const title = titleInput?.value?.trim() || suggestion.name;
    const nextEnd = Math.max(suggestion.start + 1, Math.min(blocks.length, suggestion.end + delta));
    if (nextEnd === suggestion.end) return;

    suggestion = buildSuggestion(suggestion.start, nextEnd, blocks);
    suggestion.name = title;
    renderSuggestion();
    const nextTitle = document.getElementById('suggestionTitleInput');
    if (nextTitle) nextTitle.value = title;
    suggestion.name = title;
    refreshReviewFromSource(false);
  }

  function captureBoundaryButton(id, delta) {
    const button = document.getElementById(id);
    if (!button || button.dataset.boundaryV2 === '1') return;
    button.dataset.boundaryV2 = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      adjustBySourceParagraph(delta);
    }, true);
  }

  function bindAll() {
    captureBoundaryButton('shrinkBtn', -1);
    captureBoundaryButton('expandBtn', 1);
    captureBoundaryButton('reviewShrinkBtn', -1);
    captureBoundaryButton('reviewExpandBtn', 1);

    const select = document.getElementById('reviewPlatformSelect');
    if (select && select.dataset.boundaryV2 !== '1') {
      select.dataset.boundaryV2 = '1';
      select.addEventListener('change', () => setTimeout(() => refreshReviewFromSource(false), 0));
    }

    const open = document.getElementById('openSplitReviewBtn');
    if (open && open.dataset.boundaryV2 !== '1') {
      open.dataset.boundaryV2 = '1';
      open.addEventListener('click', () => setTimeout(() => refreshReviewFromSource(true), 0));
    }
  }

  const previousRender = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionBoundaryV2() {
    previousRender();
    bindAll();
    if (document.getElementById('reviewDialog')?.open) refreshReviewFromSource(false);
  };

  window.adjustSuggestion = adjustBySourceParagraph;
  window.StoryFlowSourceParagraphs = sourceParagraphs;
  window.StoryFlowRefreshReviewFromSource = refreshReviewFromSource;

  bindAll();
})();