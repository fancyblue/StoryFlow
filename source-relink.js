// Recoverable Google source relinking.
// A detached chapter keeps its text and can later be linked back to the same
// Google Docs heading without creating a duplicate chapter or hitting a dead-end error.
(function () {
  const baseImportSelectedTab = window.importSelectedTab;
  if (typeof baseImportSelectedTab !== 'function') return;

  let pendingRelink = null;

  function normalizeTitle(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function clone(value) {
    try { return structuredClone(value); }
    catch (_) { return value ? JSON.parse(JSON.stringify(value)) : value; }
  }

  function blockSignature(block) {
    return `${block?.raw || ''}\u0000${block?.strongBoundaryAfter ? '1' : '0'}`;
  }

  function confirmedRangeChanged(chapter, nextDraft) {
    const confirmed = Number(chapter?.confirmedBlockCount || 0);
    if (!confirmed) return false;
    const before = parseBlocks(chapter.draft || '');
    const after = parseBlocks(nextDraft || '');
    if (before.length < confirmed || after.length < confirmed) return true;
    for (let index = 0; index < confirmed; index += 1) {
      if (blockSignature(before[index]) !== blockSignature(after[index])) return true;
    }
    return false;
  }

  function sourceFor(doc, tab, incoming) {
    return {
      id: doc.id,
      name: doc.name,
      url: doc.url,
      tabId: tab.id,
      tabTitle: tab.title,
      headingOrdinal: incoming.headingOrdinal,
      headingTitle: incoming.title,
      syncedAt: new Date().toISOString()
    };
  }

  function findIncomingForChapter(tab, chapter) {
    const detached = chapter?.detachedSource;
    if (detached?.headingOrdinal != null) {
      const byOrdinal = tab.chapters.find(item => item.headingOrdinal === detached.headingOrdinal);
      if (byOrdinal) return byOrdinal;
    }
    if (detached?.headingTitle) {
      const title = normalizeTitle(detached.headingTitle);
      const byOriginalTitle = tab.chapters.find(item => normalizeTitle(item.title) === title);
      if (byOriginalTitle) return byOriginalTitle;
    }
    const currentTitle = normalizeTitle(chapter?.title);
    return currentTitle ? tab.chapters.find(item => normalizeTitle(item.title) === currentTitle) || null : null;
  }

  function detachedFromTab(chapter, doc, tab) {
    const detached = chapter?.detachedSource;
    return Boolean(detached && detached.id === doc.id && detached.tabId === tab.id);
  }

  function ensureRelinkDialog() {
    let dialog = document.getElementById('sourceRelinkDialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'sourceRelinkDialog';
    dialog.className = 'source-flow-dialog source-preview-dialog';
    dialog.innerHTML = `
      <div class="dialog-card source-flow-card source-preview-card">
        <div class="panel-head sticky-dialog-head">
          <div><p class="eyebrow">SOURCE / RELINK</p><h3>重新連結 Google Docs</h3></div>
          <button id="closeSourceRelinkDialog" class="icon-button" type="button" aria-label="關閉">×</button>
        </div>
        <div id="sourceRelinkSummary" class="source-preview-summary"></div>
        <div id="sourceRelinkWarning" class="source-refresh-warning hidden"></div>
        <div class="source-refresh-compare">
          <section><div class="source-compare-head">目前工作區內容</div><pre id="sourceRelinkBefore" class="source-preview-content"></pre></section>
          <section><div class="source-compare-head">Google Docs 來源內容</div><pre id="sourceRelinkAfter" class="source-preview-content"></pre></section>
        </div>
        <div class="source-flow-actions sticky-dialog-actions">
          <button id="cancelSourceRelinkBtn" class="button ghost" type="button">取消</button>
          <button id="confirmSourceRelinkBtn" class="button primary" type="button">重新連結來源</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    const close = () => {
      pendingRelink = null;
      dialog.close();
    };
    dialog.querySelector('#closeSourceRelinkDialog').onclick = close;
    dialog.querySelector('#cancelSourceRelinkBtn').onclick = close;
    dialog.querySelector('#confirmSourceRelinkBtn').onclick = confirmRelink;
    return dialog;
  }

  function showRelinkPreview(doc, tab, chapter, incoming) {
    const dialog = ensureRelinkDialog();
    const oldDraft = String(chapter.draft || '').replace(/\r\n/g, '\n').trimEnd();
    const nextDraft = String(incoming.draft || '').replace(/\r\n/g, '\n').trimEnd();
    const changed = oldDraft !== nextDraft || normalizeTitle(chapter.title) !== normalizeTitle(incoming.title);
    const affectsConfirmed = changed && confirmedRangeChanged(chapter, nextDraft);
    const oldChars = charCount(oldDraft);
    const nextChars = charCount(nextDraft);

    pendingRelink = {
      chapterId: chapter.id,
      title: incoming.title || chapter.title,
      draft: nextDraft,
      source: sourceFor(doc, tab, incoming),
      changed,
      affectsConfirmed,
      oldChars,
      nextChars
    };

    const summary = dialog.querySelector('#sourceRelinkSummary');
    const warning = dialog.querySelector('#sourceRelinkWarning');
    const before = dialog.querySelector('#sourceRelinkBefore');
    const after = dialog.querySelector('#sourceRelinkAfter');
    const delta = nextChars - oldChars;
    const deltaText = delta === 0 ? '字數相同' : `${delta > 0 ? '+' : ''}${delta.toLocaleString()} 字`;

    summary.innerHTML = changed
      ? `<strong class="source-change-status changed">重新連結並更新</strong><span>「${escapeHtml(chapter.title)}」目前 ${oldChars.toLocaleString()} 字 → 來源 ${nextChars.toLocaleString()} 字（${deltaText}）</span>`
      : `<strong class="source-change-status unchanged">內容相同</strong><span>會重新建立來源連結，現有章節與發布進度不會重建。</span>`;

    warning.classList.toggle('hidden', !changed);
    warning.textContent = affectsConfirmed
      ? '來源內容與目前工作區不同，而且差異包含已確認範圍。重新連結會更新工作區原稿，但既有 Markdown／發布狀態保持不變。請先比較左右內容。'
      : changed
        ? '來源內容與目前手動保留的內容不同。重新連結後會以右側 Google Docs 內容作為最新工作區原稿；既有發布篇保持不變。'
        : '';

    before.textContent = oldDraft || '（目前沒有內容）';
    after.textContent = nextDraft || '（來源沒有內容）';
    document.getElementById('tabDialog')?.close();
    dialog.showModal();
  }

  function confirmRelink() {
    const preview = pendingRelink;
    if (!preview) return;
    const chapter = (state.chapters || []).find(item => item.id === preview.chapterId);
    if (!chapter) {
      pendingRelink = null;
      document.getElementById('sourceRelinkDialog')?.close();
      notify('找不到要重新連結的章節，請重新選擇章節後再試一次。', true);
      return;
    }

    if (preview.affectsConfirmed) {
      const proceed = window.confirm('這次重新連結會更新已確認範圍內的工作區原稿。\n\n既有 Markdown 與發布狀態不會自動覆寫。確定繼續？');
      if (!proceed) return;
    }

    chapter.title = preview.title || chapter.title;
    chapter.draft = preview.draft;
    chapter.source = preview.source;
    delete chapter.detachedSource;
    state.activeChapterId = chapter.id;
    suggestion = null;
    pendingRelink = null;
    saveState('來源已重新連結');
    document.getElementById('sourceRelinkDialog')?.close();
    renderAll();
    if (chapter.draft) suggestNextPart();
    notify(preview.changed
      ? '已重新連結 Google Docs，SMART SPLIT 已依最新來源重新計算'
      : '已重新連結 Google Docs，現有內容與發布進度保持不變');
  }

  // Capture the old source before source-flow.js clears it. Keeping this tiny bit
  // of provenance makes "解除連結 → 之後重新連結" deterministic.
  document.addEventListener('click', event => {
    if (!event.target.closest?.('#detachSourceBtn')) return;
    const chapter = activeChapter?.();
    if (chapter?.source) chapter.detachedSource = clone(chapter.source);
  }, true);

  const detachButton = document.getElementById('detachSourceBtn');
  if (detachButton) detachButton.textContent = '解除連結，保留內容';

  window.importSelectedTab = function importSelectedTabRecoverable(tabId) {
    const doc = pendingGoogleDoc;
    const tab = doc?.tabs?.find(item => item.id === tabId);
    if (!doc || !tab) return baseImportSelectedTab(tabId);

    const chapter = activeChapter?.();
    const incoming = chapter && !chapter.source ? findIncomingForChapter(tab, chapter) : null;
    const linked = (state.chapters || []).filter(item => item?.source?.id === doc.id && item?.source?.tabId === tab.id);
    const explicitDetachedMatch = Boolean(incoming && detachedFromTab(chapter, doc, tab));
    // For chapters detached before provenance tracking existed, infer relinking only
    // when another chapter from this exact Google Docs tab is still linked. This
    // prevents a same-titled chapter from a completely different story being relinked.
    const safeTitleMatch = Boolean(incoming && linked.length && !chapter?.source && (chapter?.draft || (chapter?.parts || []).length));

    // The user is currently on a detached/manual copy of a heading that exists in
    // the selected source. Offer a comparison + relink instead of importing a duplicate.
    if (incoming && (explicitDetachedMatch || safeTitleMatch)) {
      showRelinkPreview(doc, tab, chapter, incoming);
      return;
    }

    if (linked.length) {
      const currentTitle = normalizeTitle(chapter?.title);
      const target = linked.find(item => normalizeTitle(item.title) === currentTitle) || linked[0];
      state.activeChapterId = target.id;
      suggestion = null;
      saveState('已切換到來源章節');
      document.getElementById('tabDialog')?.close();
      renderAll();
      if (target.draft) suggestNextPart();
      notify(`「${tab.title}」已在目前作品中；已切換到「${target.title}」，可直接使用「更新來源」。`);
      return;
    }

    return baseImportSelectedTab(tabId);
  };
})();
