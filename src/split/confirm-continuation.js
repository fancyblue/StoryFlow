// After confirming one part, keep the same chapter selected and immediately prepare the next part when content remains.
(function () {
  const button = document.getElementById('confirmBtn');
  if (!button || typeof confirmSuggestion !== 'function') return;

  const baseConfirmSuggestion = confirmSuggestion;

  button.onclick = async function confirmAndContinue() {
    if (!suggestion) return;

    const chapter = activeChapter();
    const chapterId = chapter?.id;
    const previousConfirmed = Number(chapter?.confirmedBlockCount || 0);

    await baseConfirmSuggestion();

    const current = activeChapter();
    if (!current || current.id !== chapterId) return;
    if (Number(current.confirmedBlockCount || 0) <= previousConfirmed) return;

    const blocks = parseBlocks(current.draft || '');
    const remaining = blocks.length - Number(current.confirmedBlockCount || 0);
    if (remaining <= 0) return;

    // The scene-aware suggestNextPart installed by boundary-engine.js is used here,
    // so the next default cut still lands only on a real source scene boundary.
    suggestNextPart();
  };
})();
