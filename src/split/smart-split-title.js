// Smart Split title rule.
// Automatic titles follow the actual selected range everywhere:
// - whole untouched chapter => chapter title only
// - partial/multi-part range => chapter title + （part number）
// A title explicitly edited by the user is preserved instead of being overwritten.
(function () {
  let suggestionIdentity = '';
  let userEditedTitle = false;

  function currentChapter() {
    try { return activeChapter?.() || null; }
    catch (_) { return null; }
  }

  function currentBlocks() {
    const chapter = currentChapter();
    try { return parseBlocks(chapter?.draft || ''); }
    catch (_) { return []; }
  }

  function identity() {
    const chapter = currentChapter();
    if (!chapter || !suggestion) return '';
    return `${chapter.id || ''}:${Number(suggestion.start || 0)}:${(chapter.parts || []).length}`;
  }

  function canonicalTitle() {
    const chapter = currentChapter();
    if (!chapter || !suggestion) return '';
    const blocks = currentBlocks();
    const start = Number(suggestion.start || 0);
    const end = Number(suggestion.end || 0);
    const wholeChapter = start === 0
      && end === blocks.length
      && !(chapter.parts || []).length;
    if (wholeChapter) return chapter.title || '未命名章節';
    return `${chapter.title || '未命名章節'}（${(chapter.parts || []).length + 1}）`;
  }

  function syncTitle() {
    if (!suggestion) {
      suggestionIdentity = '';
      userEditedTitle = false;
      return;
    }

    const nextIdentity = identity();
    if (nextIdentity !== suggestionIdentity) {
      suggestionIdentity = nextIdentity;
      userEditedTitle = false;
    }

    const input = document.getElementById('suggestionTitleInput');
    const hiddenName = document.getElementById('suggestionName');
    const reviewTitle = document.getElementById('dialogReviewCurrentTitle');

    if (userEditedTitle) {
      const custom = String(input?.value || suggestion.name || '').trim();
      if (custom) suggestion.name = custom;
    } else {
      suggestion.name = canonicalTitle();
      if (input && document.activeElement !== input) input.value = suggestion.name;
    }

    if (hiddenName) hiddenName.textContent = suggestion.name;
    if (reviewTitle) reviewTitle.textContent = suggestion.name;
  }

  // Mark only real user typing as a custom title. Programmatic range changes do not
  // fire input events, so automatic names remain free to follow the split rule.
  document.addEventListener('input', event => {
    if (event.target?.id !== 'suggestionTitleInput') return;
    userEditedTitle = true;
    if (suggestion) suggestion.name = event.target.value;
  }, true);

  const previousRenderSuggestion = window.renderSuggestion;
  if (typeof previousRenderSuggestion === 'function' && !previousRenderSuggestion.__titleRule) {
    const wrapped = function (...args) {
      const result = previousRenderSuggestion.apply(this, args);
      syncTitle();
      return result;
    };
    wrapped.__titleRule = true;
    window.renderSuggestion = wrapped;
  }

  // Preference updates and scene +/- controls both eventually render the suggestion.
  // These hooks are only a final UI guard for any older handler that mutates the
  // suggestion and updates part of the DOM without going through renderSuggestion.
  document.addEventListener('change', event => {
    if (event.target?.id === 'minChars' || event.target?.id === 'maxChars') {
      window.setTimeout(syncTitle, 0);
    }
  }, true);

  document.addEventListener('click', event => {
    const id = event.target?.closest?.('button')?.id;
    if (['shrinkBtn', 'expandBtn', 'reviewShrinkBtn', 'reviewExpandBtn'].includes(id)) {
      window.setTimeout(syncTitle, 0);
    }
  }, true);

  window.StoryFlowSmartSplitTitleRule = {
    sync: syncTitle,
    canonical: canonicalTitle
  };

  syncTitle();
})();
