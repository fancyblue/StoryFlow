// Canonical boundary engine: source scenes decide both initial cuts and manual adjustments; publication formatting happens only after.
(function () {
  const CONTROL_DIRECTIONS = new Map([
    ['shrinkBtn', -1],
    ['expandBtn', 1],
    ['reviewShrinkBtn', -1],
    ['reviewExpandBtn', 1]
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

  function manualBoundaryActive() {
    return document.getElementById('reviewManualBoundaryBtn')?.getAttribute('aria-pressed') === 'true';
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

  function formattedFullChapterHTML() {
    const blocks = sourceBlocks();
    if (!blocks.length) return '目前章節沒有內容。';
    const options = formatOptions(currentReviewPlatform());
    const start = suggestion?.start ?? -1;
    const end = suggestion?.end ?? -1;
    const manual = manualBoundaryActive();
    const out = [];

    blocks.forEach((block, index) => {
      if (index === start) out.push('<span class="range-boundary range-start">──── 這一篇開始 ────</span>\n');
      const line = escapeHtml(applyIndent(block.raw, options.indent));
      const highlighted = index >= start && index < end;
      out.push(manual
        ? `<span class="review-source-block${highlighted ? ' current-range-highlight' : ''}" data-block-index="${index}">${line}</span>`
        : highlighted ? `<span class="current-range-highlight">${line}</span>` : line);
      if (manual && index >= start) out.push(boundaryTarget(index + 1, end, Boolean(block.strongBoundaryAfter)));
      else if (index === end - 1) out.push('\n<span class="range-boundary range-end">──── 這一篇結束 ────</span>');
      if (index >= blocks.length - 1) return;

      // In manual mode every paragraph boundary is already represented by a
      // full-width button. Literal newlines around block elements create large
      // anonymous line boxes inside the <pre>, so spacing belongs to CSS there.
      if (!manual) out.push(escapeHtml(formattedBlockBreak(block, options)));
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
    if (chars) {
      const blocks = sourceBlocks();
      const remaining = charsBetween(blocks, Number(suggestion.end), blocks.length);
      chars.textContent = manualBoundaryActive()
        ? `本篇 ${suggestion.chars.toLocaleString()} 字 · 後續 ${remaining.toLocaleString()} 字`
        : `${suggestion.chars.toLocaleString()} 字`;
    }

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

  function ensureManualBoundaryControls() {
    const controls = document.getElementById('reviewBoundaryControls');
    const dialog = document.getElementById('reviewDialog');
    if (!controls || !dialog) return;

    let button = document.getElementById('reviewManualBoundaryBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'reviewManualBoundaryBtn';
      button.className = 'button tiny ghost';
      button.type = 'button';
      button.textContent = '手動微調';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('data-mobile-safe-write-control', 'true');
      button.title = '把這一篇的結尾精確移到任一段落後方';
      controls.appendChild(button);
    }

    let hint = document.getElementById('manualBoundaryHint');
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'manualBoundaryHint';
      hint.className = 'manual-boundary-hint';
      hint.hidden = true;
      hint.textContent = '點段落間細線設定結尾；藍色「本篇結尾」也可拖曳。只調整切點，不修改原稿。';
      document.querySelector('#reviewDialog .review-format-bar')?.insertAdjacentElement('afterend', hint);
    }
  }

  function alignReviewMarker(selector, focus = false) {
    const full = document.getElementById('dialogReviewFull');
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

  function setManualBoundaryMode(active) {
    ensureManualBoundaryControls();
    const button = document.getElementById('reviewManualBoundaryBtn');
    const dialog = document.getElementById('reviewDialog');
    const hint = document.getElementById('manualBoundaryHint');
    if (!button || !dialog) return;
    const wasActive = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '結束微調' : '手動微調';
    dialog.classList.toggle('manual-boundary-active', active);
    if (hint) hint.hidden = !active;
    if (!active) {
      manualPointerDrag = null;
      clearManualDropState();
    }
    if (active) window.StoryFlowPreviewMode?.setMode?.('review', 'preview');
    refreshReview(false);
    if (active) alignReviewMarker('.manual-boundary-target.is-current', true);
    else if (wasActive && dialog.open) alignReviewMarker('.range-end');
  }

  function clearManualDropState() {
    document.querySelectorAll('.manual-boundary-target.is-drop-target').forEach(target => target.classList.remove('is-drop-target'));
    document.getElementById('reviewDialog')?.classList.remove('manual-boundary-dragging');
  }

  function manualTargetForDrag(event) {
    const full = document.getElementById('dialogReviewFull');
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
    const full = document.getElementById('dialogReviewFull');
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
    if (event.target?.closest?.('#reviewManualBoundaryBtn')) {
      const active = document.getElementById('reviewManualBoundaryBtn')?.getAttribute('aria-pressed') !== 'true';
      setManualBoundaryMode(active);
      return;
    }
    const target = event.target?.closest?.('#dialogReviewFull .manual-boundary-target');
    if (!target || !manualBoundaryActive()) return;
    if (Date.now() < suppressManualClickUntil) {
      event.preventDefault();
      return;
    }
    setSuggestionEnd(Number(target.dataset.boundaryEnd));
  });

  document.addEventListener('pointerdown', event => {
    const target = event.target?.closest?.('#dialogReviewFull .manual-boundary-target.is-current');
    if (!target || !manualBoundaryActive() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    manualPointerDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      end: Number(target.dataset.boundaryEnd),
      moved: false
    };
    target.setPointerCapture?.(event.pointerId);
    document.getElementById('reviewDialog')?.classList.add('manual-boundary-dragging');
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

    const full = document.getElementById('dialogReviewFull');
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
    const target = event.target?.closest?.('#dialogReviewFull .manual-boundary-target.is-current');
    if (!target || !manualBoundaryActive()) return;
    event.dataTransfer?.setData('text/plain', target.dataset.boundaryEnd || '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    document.getElementById('reviewDialog')?.classList.add('manual-boundary-dragging');
  });

  document.addEventListener('dragover', event => {
    const target = manualTargetForDrag(event);
    if (!target || !manualBoundaryActive()) return;
    event.preventDefault();
    clearManualDropState();
    document.getElementById('reviewDialog')?.classList.add('manual-boundary-dragging');
    target.classList.add('is-drop-target');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    const full = document.getElementById('dialogReviewFull');
    const rect = full?.getBoundingClientRect();
    if (!full || !rect) return;
    if (event.clientY < rect.top + 44) full.scrollTop -= 22;
    else if (event.clientY > rect.bottom - 44) full.scrollTop += 22;
  });

  document.addEventListener('drop', event => {
    const target = manualTargetForDrag(event);
    if (!target || !manualBoundaryActive()) return;
    event.preventDefault();
    const end = Number(target.dataset.boundaryEnd);
    clearManualDropState();
    setSuggestionEnd(end);
  });

  document.addEventListener('dragend', clearManualDropState);

  document.addEventListener('change', event => {
    if (event.target?.id === 'reviewPlatformSelect') refreshReview(false);
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#openSplitReviewBtn')) {
      setTimeout(() => {
        ensureManualBoundaryControls();
        setManualBoundaryMode(false);
        refreshReview(true);
        syncControlState();
      }, 0);
    }
  });

  document.getElementById('reviewDialog')?.addEventListener('close', () => setManualBoundaryMode(false));

  const previousRenderSuggestion = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionWithSceneControls() {
    previousRenderSuggestion();
    syncControlState();
  };

  // Replace the legacy character-first suggestion generator. From now on,
  // automatic/default suggestions and manual +/- adjustments share the exact
  // same source-scene model.
  window.suggestNextPart = suggestAtSceneBoundary;
  window.adjustSuggestion = adjust;
  window.StoryFlowSourceParagraphs = sourceBlocks;
  window.StoryFlowSceneEnds = () => sceneEnds(sourceBlocks());
  window.StoryFlowRefreshReviewFromSource = refreshReview;
  window.StoryFlowSetSuggestionEnd = setSuggestionEnd;

  ensureManualBoundaryControls();
  syncControlState();
})();
