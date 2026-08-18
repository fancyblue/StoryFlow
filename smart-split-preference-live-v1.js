// Keep Smart Split output live with its preference controls.
// Changing min/max should immediately produce a fresh automatic cut suggestion;
// changing only the scene marker should preserve the current manual cut boundary.
(function () {
  const minInput = document.getElementById('minChars');
  const maxInput = document.getElementById('maxChars');
  const markerInput = document.getElementById('sceneMarker');
  if (!minInput || !maxInput || !markerInput) return;

  let timer = 0;

  function currentChapterHasContent() {
    try { return Boolean(String(activeChapter()?.draft || '').trim()); }
    catch (_) { return false; }
  }

  function readRange({ announce = false } = {}) {
    const min = Number(minInput.value);
    const max = Number(maxInput.value);
    const validMin = Number.isFinite(min) && min >= 300;
    const validMax = Number.isFinite(max) && max >= 500;
    const validOrder = validMin && validMax && min <= max;

    minInput.setAttribute('aria-invalid', String(!(validMin && (!validMax || min <= max))));
    maxInput.setAttribute('aria-invalid', String(!(validMax && (!validMin || min <= max))));

    if (!validMin || !validMax || !validOrder) {
      if (announce && validMin && validMax && min > max) {
        window.notify?.('偏好最少字數不能大於偏好最多字數', true);
      }
      return false;
    }

    state.minChars = min;
    state.maxChars = max;
    return true;
  }

  function recomputeRange({ save = false, announce = false } = {}) {
    window.clearTimeout(timer);
    if (!readRange({ announce })) return;

    if (save) {
      try { saveState('切篇偏好已更新'); } catch (_) {}
      try { window.StoryFlowProjectPersistence?.flush?.('smart-split-preference'); } catch (_) {}
    }

    if (!currentChapterHasContent()) return;
    try {
      suggestion = null;
      suggestNextPart();
    } catch (_) {}
  }

  function recomputeMarker({ save = false } = {}) {
    state.sceneMarker = String(markerInput.value || '').trim() || '＊＊＊';
    if (save) {
      try { saveState('場景分隔符已更新'); } catch (_) {}
      try { window.StoryFlowProjectPersistence?.flush?.('smart-split-marker'); } catch (_) {}
    }

    if (!currentChapterHasContent()) return;
    try {
      if (suggestion) {
        const blocks = parseBlocks(activeChapter().draft || '');
        suggestion = buildSuggestion(suggestion.start, suggestion.end, blocks);
        renderSuggestion();
      } else {
        suggestNextPart();
      }
    } catch (_) {}
  }

  function scheduleRange() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => recomputeRange(), 120);
  }

  minInput.addEventListener('input', scheduleRange, true);
  maxInput.addEventListener('input', scheduleRange, true);
  minInput.addEventListener('change', () => recomputeRange({ save: true, announce: true }), true);
  maxInput.addEventListener('change', () => recomputeRange({ save: true, announce: true }), true);

  markerInput.addEventListener('input', () => recomputeMarker(), true);
  markerInput.addEventListener('change', () => recomputeMarker({ save: true }), true);

  window.StoryFlowSmartSplitPreferenceLive = {
    recompute: () => recomputeRange(),
    syncMarker: () => recomputeMarker()
  };
})();
