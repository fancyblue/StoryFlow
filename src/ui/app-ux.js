// Cross-app UX refinements: dedicated works library, safe chapter removal, clearer format summaries.
(function () {
  function projectApi() { return window.StoryFlowProjects; }

  function ensureToastStack() {
    let stack = document.getElementById('storyflowToastStack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'storyflowToastStack';
    stack.className = 'storyflow-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    document.body.appendChild(stack);
    return stack;
  }

  function showToast(message, isError = false) {
    const text = String(message || '').trim();
    if (!text) return;
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = `storyflow-toast ${isError ? 'error' : ''}`;
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.textContent = text;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 180);
    }, isError ? 4800 : 3200);
  }

  const baseNotify = window.notify;
  if (typeof baseNotify === 'function') {
    window.notify = function notifyEverywhere(message, isError = false) {
      baseNotify(message, isError);
      showToast(message, isError);
    };
  }

  function ensureProjectsView() {
    const main = document.querySelector('.main');
    if (!main) return null;
    let view = document.getElementById('projectsView');
    if (view) return view;

    view = document.createElement('section');
    view.id = 'projectsView';
    view.className = 'app-view projects-view';
    view.hidden = true;
    view.innerHTML = `
      <header class="projects-page-head">
        <div>
          <p class="eyebrow">STORYFLOW / WORKS</p>
          <h1>作品</h1>
          <p class="projects-page-subtitle">每個故事都有獨立的章節、切篇與發布進度。先選作品，再進入工作台或發布。</p>
        </div>
        <button id="projectsNewWorkBtn" class="button ghost" type="button">＋ 新作品</button>
      </header>
      <div id="projectsLibrary" class="projects-library"></div>`;
    main.appendChild(view);

    view.querySelector('#projectsNewWorkBtn').addEventListener('click', () => {
      window.StoryFlowStartNewWork?.();
    });
    return view;
  }

  function renderProjectsView() {
    const api = projectApi();
    const view = ensureProjectsView();
    const list = view?.querySelector('#projectsLibrary');
    if (!api || !list) return;

    const activeId = api.activeId?.();
    const projects = [...(api.list?.() || [])].sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant');
    });

    const newWork = view.querySelector('#projectsNewWorkBtn');
    if (newWork) newWork.hidden = projects.length === 0;

    list.innerHTML = '';
    projects.forEach(project => {
      const active = project.id === activeId;
      const card = document.createElement('article');
      card.className = `project-library-card ${active ? 'active' : ''}`;
      card.dataset.projectId = project.id;
      card.dataset.contentMode = project.contentMode || 'longform';
      const visual = project.contentMode === 'visual';
      const sourceLabel = project.sourceDocId ? 'Google Docs' : '手動／尚未綁定來源';
      card.innerHTML = `
        <div class="project-library-main">
          <div class="project-library-title-row">
            <strong>${escapeHtml(project.title || '未命名作品')}</strong>
            <span class="project-type-badge">${visual ? '圖文' : '長文'}</span>
            ${active ? '<span class="project-current-badge">目前作品</span>' : ''}
          </div>
          <span class="project-library-meta">${visual
            ? `${Number(project.visualEntryCount || 0).toLocaleString()} 則圖文`
            : `${Number(project.chapterCount || 0).toLocaleString()} 個章節 · ${sourceLabel}`}</span>
        </div>
        <div class="project-library-actions">
          <button class="button tiny ghost project-open-btn" type="button">${visual ? '管理圖文' : active ? '回工作台' : '切換並開啟'}</button>
          <button class="button tiny ghost project-publish-btn" type="button">${visual ? '管理發布' : '發布'}</button>
          <button class="button tiny ghost project-library-delete" type="button">刪除</button>
        </div>`;

      card.querySelector('.project-open-btn').addEventListener('click', () => {
        api.switchProject?.(project.id, { quiet: true });
        window.StoryFlowNavigate?.('workspace');
      });
      card.querySelector('.project-publish-btn').addEventListener('click', () => {
        api.switchProject?.(project.id, { quiet: true });
        window.StoryFlowNavigate?.('publishing');
      });
      card.querySelector('.project-library-delete').addEventListener('click', async () => {
        if (await api.deleteProject?.(project.id)) renderProjectsView();
      });
      list.appendChild(card);
    });
  }

  function blankChapter() {
    return { id: crypto.randomUUID(), title: '第一章', draft: '', confirmedBlockCount: 0, parts: [], source: null };
  }

  async function removeChapter(chapterId) {
    const index = state.chapters.findIndex(chapter => chapter.id === chapterId);
    if (index < 0) return;
    const chapter = state.chapters[index];

    if ((chapter.parts || []).length) {
      state.activeChapterId = chapter.id;
      renderAll();
      window.StoryFlowNavigate?.('publishing');
      notify('這個章節仍有已確認文章。請先在「發布」刪除相關文章，讓 Markdown 一併處理，再回來刪除章節。', true);
      return;
    }

    if (!confirm(`刪除章節「${chapter.title}」？\n\n會從目前作品移除這個章節與工作區內容；Google Docs 原稿不會刪除。`)) return;

    try {
      const prepare = window.StoryFlowProjectPersistence?.prepareRecovery;
      if (typeof prepare !== 'function') throw new Error('Recovery 安全元件尚未準備完成。');
      await prepare('before-chapter-delete');
    } catch (error) {
      notify(`尚未刪除章節：無法建立 Recovery 安全副本（${error.message}）`, true);
      return;
    }

    state.chapters.splice(index, 1);
    if (!state.chapters.length) state.chapters.push(blankChapter());
    if (!state.chapters.some(item => item.id === state.activeChapterId)) {
      state.activeChapterId = state.chapters[Math.min(index, state.chapters.length - 1)].id;
    }
    suggestion = null;
    saveState('章節已刪除');
    renderAll();
    if (activeChapter()?.draft) suggestNextPart();
    notify(`已刪除章節：${chapter.title}`);
  }

  function chapterGroups() {
    const groups = [];
    const map = new Map();
    for (const chapter of state.chapters) {
      const source = chapter.source;
      const key = source?.tabId ? `${source.id || 'doc'}::${source.tabId}` : '__manual__';
      if (!map.has(key)) {
        const group = { key, label: source?.tabTitle || '手動章節', docName: source?.name || '', chapters: [] };
        map.set(key, group);
        groups.push(group);
      }
      map.get(key).chapters.push(chapter);
    }
    return groups;
  }

  function syncSourceActionState() {
    const chapter = activeChapter?.();
    const hasGoogleSource = Boolean(chapter?.source?.id && chapter?.source?.tabId);
    const refresh = document.getElementById('refreshSourceBtn');
    if (refresh) {
      refresh.hidden = !hasGoogleSource;
      refresh.disabled = !hasGoogleSource;
    }
  }

  function renderChaptersWithActions() {
    const list = document.getElementById('chapterList');
    if (!list) return;
    list.innerHTML = '';
    const groups = chapterGroups();

    groups.forEach(group => {
      if (groups.length > 1 || group.key !== '__manual__') {
        const heading = document.createElement('div');
        heading.className = 'chapter-group-label';
        heading.innerHTML = `<strong>${escapeHtml(group.label)}</strong>${group.docName ? `<small>${escapeHtml(group.docName)}</small>` : ''}`;
        list.appendChild(heading);
      }

      group.chapters.forEach(chapter => {
        const row = document.createElement('div');
        row.className = `chapter-row ${chapter.id === state.activeChapterId ? 'active' : ''}`;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `chapter-item chapter-main-button ${chapter.id === state.activeChapterId ? 'active' : ''}`;
        button.innerHTML = `<span>${escapeHtml(chapter.title)}</span><small>${charCount(chapter.draft).toLocaleString()} 字</small>`;
        button.onclick = () => {
          state.activeChapterId = chapter.id;
          suggestion = null;
          saveState();
          renderAll();
          if (chapter.draft) suggestNextPart();
        };

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'chapter-delete-button';
        remove.textContent = '×';
        remove.title = `刪除章節「${chapter.title}」`;
        remove.setAttribute('aria-label', `刪除章節「${chapter.title}」`);
        remove.onclick = () => removeChapter(chapter.id);

        row.append(button, remove);
        list.appendChild(row);
      });
    });
    syncSourceActionState();
  }

  function formatSummary(platform) {
    const options = platform ? platformOptions(platform) : {
      indent: state.formatting.defaultIndent,
      paragraphSpacing: state.formatting.defaultParagraphSpacing,
      sceneSeparator: state.formatting.defaultSceneSeparator
    };
    const label = platform || '預設格式';
    const indent = options.indent === 'two' ? '全形兩格' : '不縮排';
    const spacing = options.paragraphSpacing ? '段落空行' : '段落不空行';
    const scenes = options.sceneSeparator ? '顯示場景分隔' : '不顯示場景分隔';
    return `${label} · ${indent} · ${spacing} · ${scenes}`;
  }

  function refreshFormatSummaries() {
    const suggestionBox = document.getElementById('suggestionPlatformSettings');
    const suggestionSelect = document.getElementById('suggestionPlatformSelect');
    if (suggestionBox) suggestionBox.innerHTML = `<span class="format-summary-text">${escapeHtml(formatSummary(suggestionSelect?.value || ''))}</span>`;

    const reviewBox = document.getElementById('reviewPlatformSettings');
    const reviewSelect = document.getElementById('reviewPlatformSelect');
    if (reviewBox) reviewBox.innerHTML = `<span class="format-summary-text">${escapeHtml(formatSummary(reviewSelect?.value || ''))}</span>`;
  }

  function labelCloseButtons() {
    document.querySelectorAll('.icon-button').forEach(button => {
      if (button.textContent.trim() === '×' && !button.getAttribute('aria-label')) button.setAttribute('aria-label', '關閉');
    });
  }

  function removeLegacyReset() {
    document.getElementById('resetWorkspaceBtn')?.remove();
  }

  // Replace the older chapter renderer after all source-grouping patches are loaded,
  // so delete actions always target the correct chapter even when several Docs tabs are interleaved.
  window.renderChapters = renderChaptersWithActions;

  const baseRenderSuggestion = window.renderSuggestion;
  if (typeof baseRenderSuggestion === 'function') {
    window.renderSuggestion = function renderSuggestionWithClearFormatSummary(...args) {
      const result = baseRenderSuggestion.apply(this, args);
      refreshFormatSummaries();
      return result;
    };
  }

  document.addEventListener('change', event => {
    if (event.target?.id === 'suggestionPlatformSelect' || event.target?.id === 'reviewPlatformSelect') {
      setTimeout(refreshFormatSummaries, 0);
    }
  });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('#openSplitReviewBtn')) setTimeout(refreshFormatSummaries, 0);
  });

  window.addEventListener('storyflow:projects-changed', () => {
    renderProjectsView();
    syncSourceActionState();
  });
  window.StoryFlowRenderProjects = renderProjectsView;

  const observer = new MutationObserver(() => {
    removeLegacyReset();
    labelCloseButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  ensureProjectsView();
  renderProjectsView();
  renderChaptersWithActions();
  refreshFormatSummaries();
  syncSourceActionState();
  removeLegacyReset();
  labelCloseButtons();
})();
