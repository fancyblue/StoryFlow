// Boundary adjustment must always use the normalized source draft, never publication-formatted preview text.
(function () {
  function rawSourceBlocks(chapter = activeChapter()) {
    const lines = String(chapter?.draft || '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];

    for (const line of lines) {
      if (!line.trim()) {
        // Only a true blank paragraph in the source is a strong boundary.
        if (blocks.length) blocks[blocks.length - 1].strongBoundaryAfter = true;
        continue;
      }

      const raw = line.trimEnd();
      blocks.push({
        id: `source-block-${blocks.length + 1}`,
        raw,
        chars: charCount(raw),
        strongBoundaryAfter: false
      });
    }

    return blocks;
  }

  function adjustFromRawSource(delta) {
    if (!suggestion) return;

    const titleInput = document.getElementById('suggestionTitleInput');
    const preservedTitle = titleInput?.value?.trim() || suggestion.name;
    const blocks = rawSourceBlocks();
    const nextEnd = Math.max(
      suggestion.start + 1,
      Math.min(blocks.length, suggestion.end + delta)
    );

    // buildSuggestion receives source paragraphs only. Formatting is applied later for preview/output.
    suggestion = buildSuggestion(suggestion.start, nextEnd, blocks);
    suggestion.name = preservedTitle;
    renderSuggestion();

    const nextTitleInput = document.getElementById('suggestionTitleInput');
    if (nextTitleInput) nextTitleInput.value = preservedTitle;
    suggestion.name = preservedTitle;
  }

  function bindRawBoundaryButtons() {
    const bindings = [
      ['shrinkBtn', -1],
      ['expandBtn', 1],
      ['reviewShrinkBtn', -1],
      ['reviewExpandBtn', 1]
    ];

    for (const [id, delta] of bindings) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.onclick = () => adjustFromRawSource(delta);
      button.dataset.boundarySource = 'raw';
    }
  }

  const baseRenderSuggestion = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionWithRawBoundaryControls() {
    baseRenderSuggestion();
    bindRawBoundaryButtons();
  };

  // Keep the public helper consistent with the same rule.
  window.adjustSuggestion = adjustFromRawSource;

  bindRawBoundaryButtons();
})();