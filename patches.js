// StoryFlow incremental behavior patches.
// Kept separate so current published workspace state can migrate without rewriting saved data.

(function () {
  let reviewSelection = null;

  function ensureReviewPanel() {
    if ($('reviewPanel')) return;
    const workspace = document.querySelector('.workspace-grid');
    if (!workspace) return;
    const section = document.createElement('section');
    section.id = 'reviewPanel';
    section.className = 'panel review-panel hidden';
    section.innerHTML = `
      <div class="panel-head review-head">
        <div><p class="eyebrow">CONTENT CHECK</p><h2>內容對照</h2></div>
        <div class="review-head-actions">
          <span class="muted">上一篇／這一篇／章節全文並排核對</span>
          <button id="closeReviewBtn" class="button tiny ghost" type="button">收起</button>
        </div>
      </div>
      <div class="review-grid">
        <article class="review-column">
          <div class="review-column-head"><span>上一篇</span><strong id="reviewPreviousTitle">—</strong></div>
          <pre id="reviewPrevious" class="review-content"></pre>
        </article>
        <article class="review-column current">
          <div class="review-column-head"><span>這一篇</span><strong id="reviewCurrentTitle">—</strong></div>
          <pre id="reviewCurrent" class="review-content"></pre>
        </article>
        <article class="review-column">
          <div class="review-column-head"><span>章節全文</span><strong id="reviewFullTitle">—</strong></div>
          <pre id="reviewFull" class="review-content"></pre>
        </article>
      </div>`;
    workspace.insertAdjacentElement('afterend', section);
    $('closeReviewBtn').onclick = () => section.classList.add('hidden');
  }

  function showReview({ currentPart = null, currentSuggestion = null } = {}) {
    ensureReviewPanel();
    const panel = $('reviewPanel');
    if (!panel) return;
    const chapter = activeChapter();
    const parts = chapter.parts || [];

    let current = currentPart;
    let previous = null;
    if (currentSuggestion) {
      current = {
        title: currentSuggestion.name,
        raw: currentSuggestion.raw,
        startBlock: currentSuggestion.start,
        endBlock: currentSuggestion.end
      };
      previous = parts.length ? parts[parts.length - 1] : null;
    } else if (currentPart) {
      const index = parts.findIndex(part => part.id === currentPart.id);
      previous = index > 0 ? parts[index - 1] : null;
    } else if (parts.length) {
      current = parts[parts.length - 1];
      previous = parts.length > 1 ? parts[parts.length - 2] : null;
    }

    $('reviewPreviousTitle').textContent = previous?.title || '沒有上一篇';
    $('reviewPrevious').textContent = previous?.raw || '這是本章第一篇。';
    $('reviewCurrentTitle').textContent = current?.title || '尚未產生';
    $('reviewCurrent').textContent = current?.raw || '按「產生下一篇」後會在這裡顯示。';
    $('reviewFullTitle').textContent = chapter.title;
    $('reviewFull').textContent = chapter.draft || '目前章節沒有內容。';
    panel.classList.remove('hidden');
    reviewSelection = current?.id || (currentSuggestion ? '__suggestion__' : null);
  }

  // 1) If the entire chapter is emitted as one part, keep the chapter title as-is.
  window.buildSuggestion = function buildSuggestion(start, end, blocks = parseBlocks(activeChapter().draft)) {
    const chapter = activeChapter();
    const selected = blocks.slice(start, end);
    const raw = selected.map((block, index) => {
      const suffix = block.strongBoundaryAfter && index < selected.length - 1 ? '\n\n' : '\n';
      return block.raw + suffix;
    }).join('').trim();
    const chars = selected.reduce((sum, block) => sum + block.chars, 0);
    const max = Number(state.maxChars) || 3000;
    const min = Number(state.minChars) || 1000;
    let status = '建議';
    if (chars > max) status = '超過偏好';
    else if (chars < min) status = '低於偏好';

    const natural = Boolean(blocks[end - 1]?.strongBoundaryAfter);
    const wholeChapterInOnePart = chapter.parts.length === 0 && start === 0 && end === blocks.length;
    const partName = wholeChapterInOnePart
      ? chapter.title
      : `${chapter.title}（${chapter.parts.length + 1}）`;

    return {
      start,
      end,
      raw,
      formatted: webFormat(raw),
      chars,
      name: partName,
      status,
      reason: end >= blocks.length
        ? (chars < min
          ? '已到章節最新內容，因此允許低於偏好最少字數；整章只有一篇時不加（1）。'
          : '目前已到章節最新內容；可以確認，或等待原稿繼續增加。')
        : natural
          ? '目前切點是原稿中的空白段落，且已達偏好最少字數。仍可手動往前或往後調整。'
          : '目前切點是一般段落結尾。你可以把後面的段落拉進來，即使超過偏好字數。'
    };
  };

  // Make the review panel follow the current smart-split suggestion automatically.
  const baseRenderSuggestion = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionPatched() {
    baseRenderSuggestion();
    if (suggestion) showReview({ currentSuggestion: suggestion });
  };

  // 2) Treat each Google Docs tab as a separate managed section instead of replacing all chapters.
  window.importSelectedTab = function importSelectedTab(tabId) {
    const doc = pendingGoogleDoc;
    const tab = doc?.tabs?.find(item => item.id === tabId);
    if (!doc || !tab) return;

    const sameTab = state.chapters.filter(chapter =>
      chapter.source?.id === doc.id && chapter.source?.tabId === tab.id
    );

    if (sameTab.length) {
      state.activeChapterId = sameTab[0].id;
      suggestion = null;
      saveState('此分頁已在工作區');
      els.tabDialog.close();
      renderAll();
      notify(`「${tab.title}」已經匯入；已切換到現有內容，不會覆寫其他分頁。`);
      return;
    }

    const syncedAt = new Date().toISOString();
    const imported = tab.chapters.map((chapter, index) => ({
      id: crypto.randomUUID(),
      title: chapter.title || `第${index + 1}章`,
      draft: chapter.draft,
      confirmedBlockCount: 0,
      parts: [],
      source: {
        id: doc.id,
        name: doc.name,
        url: doc.url,
        tabId: tab.id,
        tabTitle: tab.title,
        headingOrdinal: chapter.headingOrdinal,
        headingTitle: chapter.title,
        syncedAt
      }
    }));

    const isUntouchedStarter = state.chapters.length === 1
      && !state.chapters[0].draft
      && !state.chapters[0].parts?.length
      && !state.chapters[0].source
      && (state.chapters[0].title === '第一章' || state.projectTitle === '未命名作品');
    if (isUntouchedStarter) state.chapters = [];

    if (imported.length) {
      state.chapters.push(...imported);
      state.activeChapterId = imported[0].id;
    } else {
      const fallback = {
        id: crypto.randomUUID(),
        title: tab.title,
        draft: '',
        confirmedBlockCount: 0,
        parts: [],
        source: {
          id: doc.id,
          name: doc.name,
          url: doc.url,
          tabId: tab.id,
          tabTitle: tab.title,
          headingOrdinal: null,
          headingTitle: tab.title,
          syncedAt
        }
      };
      state.chapters.push(fallback);
      state.activeChapterId = fallback.id;
    }

    if (!state.projectTitle || state.projectTitle === '未命名作品') state.projectTitle = doc.title;
    suggestion = null;
    saveState('Google Docs 分頁已加入工作區');
    els.tabDialog.close();
    renderAll();
    if (tab.warnings?.length) alert(`StoryFlow 匯入提醒：\n\n${tab.warnings.join('\n')}`);
    notify(`已加入「${tab.title}」：${imported.length || 1} 個章節；其他分頁完整保留。`);
  };

  // 3) Group the chapter list by Google Docs tab so volumes/parts are visually distinct.
  window.renderChapters = function renderChapters() {
    els.chapterList.innerHTML = '';
    const groups = [];
    const map = new Map();

    for (const chapter of state.chapters) {
      const source = chapter.source;
      const key = source?.tabId ? `${source.id || 'doc'}::${source.tabId}` : '__manual__';
      if (!map.has(key)) {
        const group = {
          key,
          label: source?.tabTitle || '手動章節',
          docName: source?.name || '',
          chapters: []
        };
        map.set(key, group);
        groups.push(group);
      }
      map.get(key).chapters.push(chapter);
    }

    for (const group of groups) {
      if (groups.length > 1 || group.key !== '__manual__') {
        const heading = document.createElement('div');
        heading.className = 'chapter-group-label';
        heading.innerHTML = `<strong>${escapeHtml(group.label)}</strong>${group.docName ? `<small>${escapeHtml(group.docName)}</small>` : ''}`;
        els.chapterList.appendChild(heading);
      }

      for (const chapter of group.chapters) {
        const button = document.createElement('button');
        button.className = `chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}`;
        button.innerHTML = `<span>${escapeHtml(chapter.title)}</span><small>${charCount(chapter.draft).toLocaleString()} 字</small>`;
        button.onclick = () => {
          state.activeChapterId = chapter.id;
          suggestion = null;
          reviewSelection = null;
          saveState();
          renderAll();
          $('reviewPanel')?.classList.add('hidden');
        };
        els.chapterList.appendChild(button);
      }
    }
  };

  // 4) Every confirmed/published part gets a one-click preview button.
  const baseRenderParts = window.renderParts;
  window.renderParts = function renderPartsPatched() {
    baseRenderParts();
    const chapter = activeChapter();
    const rows = [...els.partsList.querySelectorAll('.part-row')];
    rows.forEach((row, index) => {
      const part = chapter.parts[index];
      if (!part) return;
      const actions = row.querySelector('.part-actions');
      if (!actions || actions.querySelector('.preview-part-btn')) return;
      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'button tiny ghost preview-part-btn';
      previewBtn.textContent = '預覽對照';
      previewBtn.onclick = () => showReview({ currentPart: part });
      actions.prepend(previewBtn);
      row.classList.toggle('review-selected', reviewSelection === part.id);
    });
  };

  // Existing click handlers captured previous function objects; point them at the patched flow.
  $('generateBtn').onclick = suggestNextPart;

  ensureReviewPanel();
  renderAll();
})();
