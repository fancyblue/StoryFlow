// Cross-app UX refinements: dedicated works library, safe chapter removal, clearer format summaries.
(function () {
  // Which type the works list is narrowed to. A view preference, not a property of any
  // work, so it lives here and not in the workspace state that switchProject persists.
  let worksTypeFilter = 'all';

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

    // On a phone the toast sits over the list it is reporting on, so let a tap
    // clear it instead of making the user wait out the timer to read the row.
    let dismissTimer = 0;
    const dismiss = () => {
      window.clearTimeout(dismissTimer);
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 180);
    };
    toast.addEventListener('click', dismiss);
    dismissTimer = window.setTimeout(dismiss, isError ? 4800 : 3200);
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
        <div class="projects-page-new-work">
          <span id="projectsNewWorkReason" class="projects-page-new-work-reason" hidden></span>
          <button id="projectsNewWorkBtn" class="button ghost" type="button" aria-describedby="projectsNewWorkReason">＋ 新增作品</button>
        </div>
      </header>
      <div id="worksTypeFilters" class="content-type-filters" role="group" aria-label="篩選作品類型">
        <button class="content-type-filter active" type="button" data-content-type="all">全部類型</button>
        <button class="content-type-filter" type="button" data-content-type="longform">長文</button>
        <button class="content-type-filter" type="button" data-content-type="visual">圖文</button>
      </div>
      <div id="projectsLibrary" class="projects-library"></div>`;
    main.appendChild(view);

    view.querySelector('#projectsNewWorkBtn').addEventListener('click', () => {
      window.StoryFlowStartNewWork?.();
    });
    // The same control Publishing filters by, in the same place relative to its list and
    // with the same data-content-type values: one question asked once, not twice.
    view.querySelector('#worksTypeFilters').addEventListener('click', event => {
      const button = event.target.closest('[data-content-type]');
      if (!button) return;
      worksTypeFilter = button.dataset.contentType || 'all';
      renderProjectsView();
    });
    return view;
  }

  // Which work to open is a recency decision, so the card states when it was last
  // edited instead of leaving the row to carry a title and nothing else.
  function editedLabel(updatedAt) {
    if (!updatedAt) return '';
    const edited = new Date(updatedAt);
    if (Number.isNaN(edited.getTime())) return '';
    const minutes = Math.floor((Date.now() - edited.getTime()) / 60000);
    if (minutes < 0) return '';
    if (minutes < 1) return '剛剛編輯';
    if (minutes < 60) return `${minutes} 分鐘前編輯`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小時前編輯`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前編輯`;
    return `${edited.getFullYear()}/${String(edited.getMonth() + 1).padStart(2, '0')}/${String(edited.getDate()).padStart(2, '0')} 編輯`;
  }

  // The card used to put a title at one edge and its actions at the other with nothing
  // between them. Progress is what makes the row worth scanning: it answers "how far
  // did I get with this one" without opening it.
  function progressMarkup(progress) {
    if (!progress) return '';
    const { complete, total } = progress;
    if (!total) {
      return `
        <div class="project-progress is-empty">
          <span class="project-progress-label">尚未有可發布內容</span>
          <span class="project-progress-track"><span class="project-progress-fill" style="width:0%"></span></span>
        </div>`;
    }
    const percent = Math.round((complete / total) * 100);
    return `
      <div class="project-progress${complete === total ? ' is-complete' : ''}"
           role="img" aria-label="發布進度：已完成 ${complete} / ${total}，${percent}%">
        <span class="project-progress-label" aria-hidden="true">
          <b>已完成 ${complete} / ${total}</b><span>${percent}%</span>
        </span>
        <span class="project-progress-track" aria-hidden="true"><span class="project-progress-fill" style="width:${percent}%"></span></span>
      </div>`;
  }

  function renderProjectsView() {
    const api = projectApi();
    const view = ensureProjectsView();
    const list = view?.querySelector('#projectsLibrary');
    if (!api || !list) return;

    const activeId = api.activeId?.();
    // One stable order. The current work used to be pinned to the top, so opening or
    // managing one from the bottom of a scrolled list teleported it to the first row and
    // re-sorted everything around it — the reader's place went with it. Which work is
    // current is already said by the tint, the marker and the badge; position does not
    // need to be a fourth signal, and it is the only one that costs you where you were.
    const all = [...(api.list?.() || [])]
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant'));
    const contentTypeOf = project => (project.contentMode === 'visual' ? 'visual' : 'longform');
    const projects = worksTypeFilter === 'all'
      ? all
      : all.filter(project => contentTypeOf(project) === worksTypeFilter);

    const filters = view.querySelector('#worksTypeFilters');
    if (filters) {
      const counts = {
        all: all.length,
        longform: all.filter(project => contentTypeOf(project) === 'longform').length,
        visual: all.filter(project => contentTypeOf(project) === 'visual').length
      };
      const labels = { all: '全部類型', longform: '長文', visual: '圖文' };
      filters.hidden = all.length === 0;
      filters.querySelectorAll('[data-content-type]').forEach(button => {
        const key = button.dataset.contentType;
        button.textContent = `${labels[key]} ${counts[key]}`;
        button.classList.toggle('active', key === worksTypeFilter);
        button.setAttribute('aria-pressed', String(key === worksTypeFilter));
      });
    }

    const newWork = view.querySelector('#projectsNewWorkBtn');
    const newWorkReason = view.querySelector('#projectsNewWorkReason');
    if (newWork) {
      // Kept visible with no works, not hidden. It is already outlined, so it is not the
      // competing solid header action W-06 rules out, and hiding it removed the one way
      // into creation that does not depend on reading the empty state first.
      newWork.hidden = false;
      // A work cannot be created before there is a folder to write it into. The control
      // says why in text beside it rather than only in a title: a tooltip is invisible on
      // touch, and to a keyboard user until the control has focus it cannot take while
      // disabled. UI_SYSTEM's rule is that a disabled control explains itself.
      const connected = Boolean(document.getElementById('folderDot')?.classList.contains('connected'));
      newWork.disabled = !connected;
      const reason = connected ? '' : (window.StoryFlowIntegrations?.supportsFolderAccess?.()
        ? '需要先連接資料夾'
        : '這個瀏覽器無法連接資料夾');
      if (connected) newWork.removeAttribute('title');
      else newWork.title = window.StoryFlowIntegrations?.supportsFolderAccess?.()
        ? '請先連接 StoryFlow 資料夾，再建立作品。'
        : '這個瀏覽器無法連接資料夾。請改用 Chrome 或 Edge。';
      if (newWorkReason) {
        newWorkReason.textContent = reason;
        newWorkReason.hidden = !reason;
      }
    }

    list.innerHTML = '';
    if (all.length && !projects.length) {
      // Narrowed to nothing is not the same as owning nothing, and the page must not
      // read as the latter. The way back is the control that got here.
      const empty = document.createElement('p');
      empty.className = 'projects-filter-empty muted';
      empty.textContent = worksTypeFilter === 'visual' ? '沒有圖文作品。' : '沒有長文作品。';
      list.appendChild(empty);
      return;
    }
    projects.forEach(project => {
      const active = project.id === activeId;
      const card = document.createElement('article');
      card.className = `project-library-card ${active ? 'active' : ''}`;
      card.dataset.projectId = project.id;
      card.dataset.contentMode = project.contentMode || 'longform';
      const visual = project.contentMode === 'visual';
      const sourceLabel = project.sourceDocId ? 'Google Docs' : '手動建立';
      card.innerHTML = `
        <div class="project-library-main">
          <div class="project-library-title-row">
            <strong>${escapeHtml(project.title || '未命名作品')}</strong>
            <span class="project-type-badge">${visual ? '圖文' : '長文'}</span>
            ${active ? '<span class="project-current-badge">目前作品</span>' : ''}
          </div>
          <span class="project-library-meta">${visual
            ? `${Number(project.visualEntryCount || 0).toLocaleString()} 則圖文`
            : `${Number(project.chapterCount || 0).toLocaleString()} 個章節 · ${sourceLabel}`}${
            editedLabel(project.updatedAt) ? ` · ${escapeHtml(editedLabel(project.updatedAt))}` : ''}</span>
        </div>
        ${progressMarkup(project.publishProgress)}
        <div class="project-library-actions">
          <button class="button tiny ghost project-open-btn" type="button">開啟</button>
          <button class="button tiny ghost project-publish-btn" type="button">管理發布</button>
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
    announceRender();
  }

  // The rows are rebuilt here, and two other modules add what they own to each one — the
  // manage-chapters action and the overflow menu. They used to hear about it only through
  // storyflow:projects-changed, which eighteen listeners act on, including the persistence
  // guard and the one that closes the reading view. Narrowing the list by type is none of
  // their business, so it says the one true thing instead: these rows were re-rendered.
  function announceRender() {
    window.dispatchEvent(new CustomEvent('storyflow:works-rendered'));
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
      return false;
    }

    if (!confirm(`刪除章節「${chapter.title}」？\n\n會從目前作品移除這個章節與工作區內容；Google Docs 原稿不會刪除。`)) return false;

    try {
      const prepare = window.StoryFlowProjectPersistence?.prepareRecovery;
      if (typeof prepare !== 'function') throw new Error('Recovery 安全元件尚未準備完成。');
      await prepare('before-chapter-delete');
    } catch (error) {
      notify(`尚未刪除章節：無法建立 Recovery 安全副本（${error.message}）`, true);
      return false;
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
    return true;
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

    const reviewBox = document.getElementById('readingPlatformSettings');
    const reviewSelect = document.getElementById('readingPlatformSelect');
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

  // The chapter list's one renderer: it groups chapters by source tab and gives every row its
  // own actions, so delete targets the right chapter even when several Docs tabs interleave.
  StoryFlowRender.provide('renderChapters', renderChaptersWithActions);
  StoryFlowRender.after('renderSuggestion', 'app-ux', () => refreshFormatSummaries());

  document.addEventListener('change', event => {
    if (event.target?.id === 'suggestionPlatformSelect' || event.target?.id === 'readingPlatformSelect') {
      setTimeout(refreshFormatSummaries, 0);
    }
  });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('#openReadingViewBtn')) setTimeout(refreshFormatSummaries, 0);
  });

  window.addEventListener('storyflow:projects-changed', () => {
    renderProjectsView();
    syncSourceActionState();
  });
  // Connecting a folder opens work creation, so the page has to re-render rather than
  // leave a stale disabled button behind.
  window.addEventListener('storyflow:connection-changed', () => renderProjectsView());
  window.StoryFlowRenderProjects = renderProjectsView;
  window.StoryFlowChapterManagement = {
    deleteChapter: removeChapter
  };

  const observer = new MutationObserver(() => {
    removeLegacyReset();
    labelCloseButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  ensureProjectsView();
  renderProjectsView();
  renderChapters();
  refreshFormatSummaries();
  syncSourceActionState();
  removeLegacyReset();
  labelCloseButtons();
})();
