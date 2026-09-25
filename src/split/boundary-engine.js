// Canonical boundary engine: source scenes decide both initial cuts and manual adjustments; publication formatting happens only after.
(function () {
  const CONTROL_DIRECTIONS = new Map([
    ['shrinkBtn', -1],
    ['expandBtn', 1],
    ['readingShrinkBtn', -1],
    ['readingExpandBtn', 1]
  ]);
  let manualPointerDrag = null;
  let suppressManualClickUntil = 0;

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

  function charsBetween(blocks, start, end) {
    return blocks.slice(start, end).reduce((sum, block) => sum + block.chars, 0);
  }

  function isWholeChapterRange(start, end, blocks, chapter = activeChapter()) {
    return start === 0
      && end === blocks.length
      && !(chapter?.parts || []).length;
  }

  function defaultSuggestionName(start, end, blocks, chapter = activeChapter()) {
    if (isWholeChapterRange(start, end, blocks, chapter)) return chapter?.title || '未命名章節';
    return `${chapter?.title || '未命名章節'}（${(chapter?.parts || []).length + 1}）`;
  }

  function applyAutomaticSuggestionName(nextSuggestion, start, end, blocks) {
    if (!nextSuggestion) return nextSuggestion;
    nextSuggestion.name = defaultSuggestionName(start, end, blocks);
    return nextSuggestion;
  }

  // SMART SPLIT must never create its first/default cut inside a source scene.
  // Choose only among real source scene ends (or the chapter tail). Character
  // preferences rank those valid scene boundaries; they never manufacture a
  // paragraph-level cut just to get closer to the preferred length.
  function preferredSceneEnd(blocks, start) {
    const candidates = sceneEnds(blocks).filter(end => end > start);
    if (!candidates.length) return blocks.length;

    const min = Number(state.minChars) || 1000;
    const max = Number(state.maxChars) || 3000;
    const target = (min + max) / 2;
    const ranked = candidates.map(end => ({
      end,
      chars: charsBetween(blocks, start, end)
    }));

    // If all remaining content already fits the user's preferred range, keep it
    // together. Do not split early merely because an earlier scene end is closer
    // to the mathematical midpoint of the range.
    const chapterTail = ranked[ranked.length - 1];
    if (chapterTail?.end === blocks.length
      && chapterTail.chars >= min
      && chapterTail.chars <= max) {
      return chapterTail.end;
    }

    const inRange = ranked.filter(item => item.chars >= min && item.chars <= max);
    if (inRange.length) {
      inRange.sort((a, b) => Math.abs(a.chars - target) - Math.abs(b.chars - target) || a.end - b.end);
      return inRange[0].end;
    }

    const atLeastMin = ranked.filter(item => item.chars >= min);
    if (atLeastMin.length) {
      atLeastMin.sort((a, b) => Math.abs(a.chars - target) - Math.abs(b.chars - target) || a.end - b.end);
      return atLeastMin[0].end;
    }

    // The remaining chapter is shorter than the preferred minimum. The only
    // valid ending is therefore its final scene/chapter tail.
    return ranked[ranked.length - 1].end;
  }

  function suggestAtSceneBoundary() {
    const chapter = activeChapter();
    const blocks = sourceBlocks();
    const start = Math.min(Number(chapter?.confirmedBlockCount || 0), blocks.length);

    if (start >= blocks.length) {
      suggestion = null;
      renderSuggestion();
      notify(blocks.length ? '目前沒有新的未處理內容' : '請先匯入或貼上原稿');
      return;
    }

    const end = preferredSceneEnd(blocks, start);
    suggestion = applyAutomaticSuggestionName(buildSuggestion(start, end, blocks), start, end, blocks);
    renderSuggestion();
  }

  function currentReviewPlatform() {
    return document.getElementById('readingPlatformSelect')?.value || '';
  }

  function formatOptions(platform) {
    return platform ? platformOptions(platform) : {
      indent: state.formatting.defaultIndent,
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator,
      marker: state.sceneMarker
    };
  }

  // Adjusting a cut point is no longer a mode inside a dialog: it is the 接縫 view of the
  // reading surface. Everything below asks which view is showing rather than whether a
  // toggle is pressed.
  function seamViewActive() {
    return document.getElementById('readingView')?.dataset.view === 'seam';
  }

  function readingFlow() {
    return document.getElementById('readingFlow');
  }

  function boundaryTarget(end, currentEnd, sceneBoundary = false) {
    const current = end === currentEnd;
    const classes = ['manual-boundary-target'];
    if (current) classes.push('range-boundary', 'range-end', 'is-current');
    if (sceneBoundary) classes.push('is-scene-boundary');
    const accessibleLabel = current
      ? '這一篇結束 · 拖曳調整'
      : '設為本篇結尾';
    const visibleLabel = current ? '本篇結尾' : '設為結尾';
    return `<button type="button" class="${classes.join(' ')}" data-boundary-end="${end}"${current ? ' draggable="true"' : ''} aria-label="${accessibleLabel}"><span class="manual-boundary-handle" aria-hidden="true">${current ? '⠿' : ''}</span><span class="manual-boundary-label">${visibleLabel}</span></button>`;
  }

  // One continuous flow carries what three columns used to: the confirmed text before this
  // part, this part, and what is still ahead. They are told apart by ink depth, so nothing
  // has to be duplicated into a second column to be comparable.
  function blockTone(index, start, end) {
    if (index < start) return 'is-done';
    if (index < end) return 'is-current';
    return 'is-ahead';
  }

  // A scene marker sits centred in every other rendering of the manuscript — the split
  // preview, the source preview, Publishing. The reading view is a <pre>, so the marker line
  // is wrapped to be centred there too; inline-block keeps the surrounding newlines as plain
  // text, so the spacing the break string asks for is unchanged.
  function readingBreakHTML(text) {
    return escapeHtml(text).replace(/^(\n+)([^\n]+)(\n+)$/, '$1<span class="reading-scene-separator">$2</span>$3');
  }

  function formattedFullChapterHTML() {
    const blocks = sourceBlocks();
    if (!blocks.length) return '目前章節沒有內容。';
    const options = formatOptions(currentReviewPlatform());
    const start = suggestion?.start ?? -1;
    const end = suggestion?.end ?? -1;
    const seam = seamViewActive();
    const out = [];

    blocks.forEach((block, index) => {
      if (index === start) out.push('<span class="range-boundary range-start">──── 這一篇開始 ────</span>\n');
      const line = escapeHtml(applyIndent(block.raw, options.indent));
      const highlighted = index >= start && index < end;
      const classes = ['reading-block', blockTone(index, start, end)];
      if (highlighted) classes.push('current-range-highlight');
      out.push(`<span class="${classes.join(' ')}" data-block-index="${index}">${line}</span>`);
      if (seam && index >= start) out.push(boundaryTarget(index + 1, end, Boolean(block.strongBoundaryAfter)));
      else if (index === end - 1) out.push('\n<span class="range-boundary range-end">──── 這一篇結束 ────</span>');
      if (index >= blocks.length - 1) return;

      // In the 接縫 view every paragraph boundary is already represented by a full-width
      // button. Literal newlines around block elements create large anonymous line boxes
      // inside the <pre>, so spacing belongs to CSS there.
      if (!seam) out.push(readingBreakHTML(formattedBlockBreak(block, options)));
    });
    return out.join('');
  }

  function refreshReview(scrollToStart = false) {
    const view = document.getElementById('readingView');
    if (!view) return;
    const full = readingFlow();
    const chars = document.getElementById('readingCurrentChars');

    if (full) full.innerHTML = suggestion ? formattedFullChapterHTML() : '這個章節目前沒有可切篇的內容。';
    if (chars) {
      if (!suggestion) {
        chars.textContent = '';
      } else {
        const blocks = sourceBlocks();
        const remaining = charsBetween(blocks, Number(suggestion.end), blocks.length);
        chars.textContent = `本篇 ${suggestion.chars.toLocaleString()} 字 · 後續 ${remaining.toLocaleString()} 字`;
      }
    }
    window.StoryFlowReadingView?.syncHead?.();

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
      const label = direction < 0 ? '← 少一個場景' : '多一個場景 →';
      const atLimit = suggestion && (direction < 0 ? previousEnd === currentEnd : nextEnd === currentEnd);
      button.textContent = label;
      button.disabled = !suggestion || atLimit;

      // A disabled control that never says why reads as a malfunction. Name the
      // reason instead of leaving only the action description behind.
      let reason = '';
      if (!suggestion) reason = '目前沒有可調整的切篇建議';
      else if (atLimit) reason = direction < 0
        ? '這一篇已經停在第一個場景，前面沒有可退回的分隔點'
        : '這一篇已經到章節結尾，後面沒有可延伸的分隔點';

      button.title = reason || (direction < 0
        ? '將切篇結尾移到上一個原稿場景分隔點'
        : '將切篇結尾移到下一個原稿場景分隔點；後面沒有分隔點時直接到章節尾');
      if (reason) button.setAttribute('aria-label', `${label.replace(/[←→]\s*/g, '').trim()}（無法使用：${reason}）`);
      else button.removeAttribute('aria-label');
    }
  }

  function adjust(direction) {
    if (!suggestion) return;
    const blocks = sourceBlocks();
    if (!blocks.length) return;

    const nextEnd = targetEnd(direction, blocks);
    if (nextEnd == null || nextEnd === Number(suggestion.end)) {
      syncControlState();
      return;
    }

    setSuggestionEnd(nextEnd);
  }

  function setSuggestionEnd(nextEnd) {
    if (!suggestion) return false;
    const blocks = sourceBlocks();
    const start = Number(suggestion.start);
    const oldEnd = Number(suggestion.end);
    const boundedEnd = Math.max(start + 1, Math.min(blocks.length, Number(nextEnd)));
    if (!Number.isInteger(boundedEnd) || boundedEnd === oldEnd) {
      refreshReview(false);
      syncControlState();
      return false;
    }

    const titleInput = document.getElementById('suggestionTitleInput');
    const currentTitle = titleInput?.value?.trim() || suggestion.name;
    const oldDefaultTitle = defaultSuggestionName(start, oldEnd, blocks);
    const hasCustomTitle = Boolean(currentTitle && currentTitle !== oldDefaultTitle);

    suggestion = applyAutomaticSuggestionName(buildSuggestion(start, boundedEnd, blocks), start, boundedEnd, blocks);
    if (hasCustomTitle) suggestion.name = currentTitle;
    renderSuggestion();

    const restoredTitle = document.getElementById('suggestionTitleInput');
    if (restoredTitle) restoredTitle.value = suggestion.name;
    refreshReview(false);
    syncControlState();
    return true;
  }

  function alignReviewMarker(selector, focus = false) {
    const full = readingFlow();
    if (!full) return;
    const align = () => {
      const marker = full.querySelector(selector);
      if (!marker || !full.isConnected) return;
      const fullRect = full.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const centered = full.scrollTop + markerRect.top - fullRect.top - (full.clientHeight - markerRect.height) / 2;
      full.scrollTop = Math.max(0, centered);
      if (focus) marker.focus({ preventScroll: true });
    };
    requestAnimationFrame(() => requestAnimationFrame(align));
    window.setTimeout(align, 90);
  }

  function setReadingViewMode(view) {
    const surface = document.getElementById('readingView');
    if (!surface) return;
    const seam = view === 'seam';
    const changed = surface.dataset.view !== (seam ? 'seam' : 'read');
    surface.dataset.view = seam ? 'seam' : 'read';

    surface.querySelectorAll('[data-reading-view]').forEach(button => {
      const active = (button.dataset.readingView === 'seam') === seam;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const hint = document.getElementById('readingViewHint');
    if (hint) hint.hidden = !seam;

    if (!seam) {
      manualPointerDrag = null;
      clearManualDropState();
    }
    // Raw Markdown would throw away the cut-point buttons this view is made of.
    if (seam) window.StoryFlowPreviewMode?.setMode?.('reading', 'preview');
    refreshReview(false);
    if (!changed) return;
    if (seam) alignReviewMarker('.manual-boundary-target.is-current', true);
    else alignReviewMarker('.range-end');
  }

  function clearManualDropState() {
    document.querySelectorAll('.manual-boundary-target.is-drop-target').forEach(target => target.classList.remove('is-drop-target'));
    document.getElementById('readingView')?.classList.remove('manual-boundary-dragging');
  }

  function manualTargetForDrag(event) {
    const full = readingFlow();
    if (!full || !full.contains(event.target)) return null;
    const direct = event.target?.closest?.('.manual-boundary-target');
    if (direct) return direct;
    const targets = [...full.querySelectorAll('.manual-boundary-target')];
    return targets.reduce((closest, target) => {
      const rect = target.getBoundingClientRect();
      const distance = Math.abs(event.clientY - (rect.top + rect.height / 2));
      return !closest || distance < closest.distance ? { target, distance } : closest;
    }, null)?.target || null;
  }

  function manualTargetNearY(clientY) {
    const full = readingFlow();
    const targets = [...(full?.querySelectorAll('.manual-boundary-target') || [])];
    return targets.reduce((closest, target) => {
      const rect = target.getBoundingClientRect();
      const distance = Math.abs(clientY - (rect.top + rect.height / 2));
      return !closest || distance < closest.distance ? { target, distance } : closest;
    }, null)?.target || null;
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

  document.addEventListener('click', event => {
    const viewButton = event.target?.closest?.('[data-reading-view]');
    if (viewButton) {
      setReadingViewMode(viewButton.dataset.readingView);
      return;
    }
    const target = event.target?.closest?.('#readingFlow .manual-boundary-target');
    if (!target || !seamViewActive()) return;
    if (Date.now() < suppressManualClickUntil) {
      event.preventDefault();
      return;
    }
    setSuggestionEnd(Number(target.dataset.boundaryEnd));
  });

  document.addEventListener('pointerdown', event => {
    const target = event.target?.closest?.('#readingFlow .manual-boundary-target.is-current');
    if (!target || !seamViewActive() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    manualPointerDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      end: Number(target.dataset.boundaryEnd),
      moved: false
    };
    target.setPointerCapture?.(event.pointerId);
    document.getElementById('readingView')?.classList.add('manual-boundary-dragging');
    event.preventDefault();
  });

  document.addEventListener('pointermove', event => {
    if (!manualPointerDrag || event.pointerId !== manualPointerDrag.pointerId) return;
    const distance = Math.hypot(event.clientX - manualPointerDrag.startX, event.clientY - manualPointerDrag.startY);
    if (distance < 4 && !manualPointerDrag.moved) return;
    manualPointerDrag.moved = true;
    const target = manualTargetNearY(event.clientY);
    if (target) {
      document.querySelectorAll('.manual-boundary-target.is-drop-target').forEach(item => item.classList.remove('is-drop-target'));
      target.classList.add('is-drop-target');
      manualPointerDrag.end = Number(target.dataset.boundaryEnd);
    }

    const full = readingFlow();
    const rect = full?.getBoundingClientRect();
    if (full && rect) {
      if (event.clientY < rect.top + 44) full.scrollTop -= 22;
      else if (event.clientY > rect.bottom - 44) full.scrollTop += 22;
    }
    event.preventDefault();
  });

  function finishManualPointerDrag(event) {
    if (!manualPointerDrag || event.pointerId !== manualPointerDrag.pointerId) return;
    const { moved, end } = manualPointerDrag;
    manualPointerDrag = null;
    clearManualDropState();
    if (!moved) return;
    suppressManualClickUntil = Date.now() + 350;
    event.preventDefault();
    setSuggestionEnd(end);
  }

  document.addEventListener('pointerup', finishManualPointerDrag);
  document.addEventListener('pointercancel', finishManualPointerDrag);

  document.addEventListener('dragstart', event => {
    const target = event.target?.closest?.('#readingFlow .manual-boundary-target.is-current');
    if (!target || !seamViewActive()) return;
    event.dataTransfer?.setData('text/plain', target.dataset.boundaryEnd || '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    document.getElementById('readingView')?.classList.add('manual-boundary-dragging');
  });

  document.addEventListener('dragover', event => {
    const target = manualTargetForDrag(event);
    if (!target || !seamViewActive()) return;
    event.preventDefault();
    clearManualDropState();
    document.getElementById('readingView')?.classList.add('manual-boundary-dragging');
    target.classList.add('is-drop-target');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    const full = readingFlow();
    const rect = full?.getBoundingClientRect();
    if (!full || !rect) return;
    if (event.clientY < rect.top + 44) full.scrollTop -= 22;
    else if (event.clientY > rect.bottom - 44) full.scrollTop += 22;
  });

  document.addEventListener('drop', event => {
    const target = manualTargetForDrag(event);
    if (!target || !seamViewActive()) return;
    event.preventDefault();
    const end = Number(target.dataset.boundaryEnd);
    clearManualDropState();
    setSuggestionEnd(end);
  });

  document.addEventListener('dragend', clearManualDropState);

  document.addEventListener('change', event => {
    if (event.target?.id === 'readingPlatformSelect') refreshReview(false);
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#openReadingViewBtn')) {
      setTimeout(() => {
        setReadingViewMode('read');
        refreshReview(true);
        syncControlState();
      }, 0);
    }
  });

  StoryFlowRender.after('renderSuggestion', 'boundary-engine', () => syncControlState());

  // Replace the legacy character-first suggestion generator. From now on,
  // automatic/default suggestions and manual +/- adjustments share the exact
  // same source-scene model.
  window.suggestNextPart = suggestAtSceneBoundary;
  window.adjustSuggestion = adjust;
  window.StoryFlowSourceParagraphs = sourceBlocks;
  window.StoryFlowSceneEnds = () => sceneEnds(sourceBlocks());
  window.StoryFlowRefreshReviewFromSource = refreshReview;
  window.StoryFlowSetSuggestionEnd = setSuggestionEnd;
  window.StoryFlowSetReadingViewMode = setReadingViewMode;

  syncControlState();
})();
