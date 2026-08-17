// Cross-app UX refinements: dedicated works library, safe chapter removal, clearer format summaries.
(function () {
  function projectApi() { return window.StoryFlowProjects; }

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
        <button id="projectsNewWorkBtn" class="button primary" type="button">＋ 新作品</button>
      </header>
      <div id="projectsLibrary" class="projects-library"></div>`;
    main.appendChild(view);

    view.querySelector('#projectsNewWorkBtn').addEventListener('click', () => {
      const api = projectApi();
      if (!api) return;
      api.createProject?.({ title: '未命名作品' });
      window.StoryFlowNavigate?.('workspace');
      requestAnimationFrame(() => {
        const input = document.getElementById('projectTitle');
        input?.focus();
        input?.select();
      });
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

    list.innerHTML = '';
    projects.forEach(project => {
      const active = project.id === activeId;
      const card = document.createElement('article');
      card.className = `project-library-card ${active ? 'active' : ''}`;
      const sourceLabel = project.sourceDocId ? 'Google Docs' : '手動／尚未綁定來源';
      card.innerHTML = `
        <div class="project-library-main">
          <div class="project-library-title-row">
            <strong>${escapeHtml(project.title || '未命名作品')}</strong>
            ${active ? '<span class="project-current-badge">目前作品</span>' : ''}
          </div>
          <span class="project-library-meta">${Number(project.chapterCount || 0).toLocaleString()} 個章節 · ${sourceLabel}</span>
        </div>
        <div class="project-library-actions">
          <button class="button tiny ${active ? 'primary' : 'ghost'} project-open-btn" type="button">${active ? '回工作台' : '切換並開啟'}</button>
          <button class="button tiny ghost project-publish-btn" type="button">發布</button>
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
      card.querySelector('.project-library-delete').addEventListener('click', () => {
        api.deleteProject?.(project.id);
        renderProjectsView();
      });
      list.appendChild(card);
    });
  }

  function blankChapter() {
    return { id: crypto.randomUUID(), title: '第一章', draft: '', confirmedBlockCount: 0, parts: [], source: null };
  }

  function removeChapter(chapterId) {
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

  function decorateChapterList() {
    const list = document.getElementById('chapterList');
    if (!list) return;
    const buttons = [...list.querySelectorAll(':scope > .chapter-item')];
    buttons.forEach((button, index) => {
      const chapter = state.chapters[index];
      if (!chapter || button.closest('.chapter-row')) return;
      const row = document.createElement('div');
      row.className = `chapter-row ${chapter.id === state.activeChapterId ? 'active' : ''}`;
      button.classList.add('chapter-main-button');
      button.parentNode.insertBefore(row, button);
      row.appendChild(button);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chapter-delete-button';
      remove.textContent = '×';
      remove.title = `刪除章節「${chapter.title}」`;
      remove.setAttribute('aria-label', `刪除章節「${chapter.title}」`);
      remove.addEventListener('click', event => {
        event.stopPropagation();
        removeChapter(chapter.id);
      });
      row.appendChild(remove);
    });
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

  const baseRenderChapters = window.renderChapters;
  if (typeof baseRenderChapters === 'function') {
    window.renderChapters = function renderChaptersWithActions(...args) {
      const result = baseRenderChapters.apply(this, args);
      decorateChapterList();
      return result;
    };
  }

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

  window.addEventListener('storyflow:projects-changed', renderProjectsView);
  window.StoryFlowRenderProjects = renderProjectsView;

  const observer = new MutationObserver(() => {
    removeLegacyReset();
    labelCloseButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  ensureProjectsView();
  renderProjectsView();
  decorateChapterList();
  refreshFormatSummaries();
  removeLegacyReset();
  labelCloseButtons();
})();
