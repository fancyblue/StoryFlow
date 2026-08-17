// Empty workspace UX. The legacy core keeps one blank in-memory chapter as a
// compatibility sentinel, but it must never look like a real work/chapter to the user.
(function () {
  function chaptersWithContent() {
    return (state.chapters || []).filter(chapter => Boolean(
      chapter?.draft || chapter?.source || (chapter?.parts || []).length
    ));
  }

  function hasChapterContent() {
    return chaptersWithContent().length > 0;
  }

  function hasNamedProject() {
    return Boolean(String(state.projectTitle || '').trim() && state.projectTitle !== '未命名作品');
  }

  function isImplicitBlankWorkspace() {
    const chapters = state.chapters || [];
    return !hasNamedProject()
      && chapters.length === 1
      && !chapters[0]?.draft
      && !chapters[0]?.source
      && !(chapters[0]?.parts || []).length;
  }

  function realProjectCount() {
    const api = window.StoryFlowProjects;
    if (!api?.list) return hasNamedProject() || hasChapterContent() ? 1 : 0;
    return api.list().length;
  }

  function ensureEmptyActions() {
    const empty = document.getElementById('suggestionEmpty');
    if (!empty) return;
    let actions = document.getElementById('workspaceEmptyActions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'workspaceEmptyActions';
      actions.className = 'workspace-empty-actions';
      actions.innerHTML = `
        <button id="workspaceLoadSourceBtn" class="button primary" type="button">載入來源</button>
        <button id="workspaceChooseWorkBtn" class="button ghost" type="button">選擇作品／章節</button>`;
      empty.appendChild(actions);
      actions.querySelector('#workspaceLoadSourceBtn').addEventListener('click', () => {
        document.getElementById('loadSourceBtn')?.click();
      });
      actions.querySelector('#workspaceChooseWorkBtn').addEventListener('click', () => {
        window.StoryFlowNavigate?.('projects');
      });
    }
    return actions;
  }

  function syncEmptyCopy() {
    const empty = document.getElementById('suggestionEmpty');
    if (!empty) return;
    const strong = empty.querySelector('strong');
    const text = empty.querySelector(':scope > span');
    const hasProject = hasNamedProject();

    if (strong) strong.textContent = hasProject ? '這個作品還沒有可切篇的章節' : '尚未載入作品內容';
    if (text) text.textContent = hasProject
      ? '請先載入 Google Docs／手動內容，或到「作品」切換到已有章節的作品。'
      : '請先載入 Google Docs／手動內容，或到「作品」選擇已有作品與章節。';
    ensureEmptyActions();
  }

  function syncSourcePanelEmptyState(noContent) {
    const list = document.getElementById('chapterList');
    const switcher = document.getElementById('projectSwitcher');
    const projectLabel = document.querySelector('.source-panel label[for="projectTitle"]');
    const projectInput = document.getElementById('projectTitle');
    const noRealProject = isImplicitBlankWorkspace();

    if (switcher) switcher.hidden = noRealProject;
    if (projectLabel) projectLabel.hidden = noRealProject;
    if (projectInput) projectInput.hidden = noRealProject;

    if (noContent && list) {
      list.querySelectorAll('.chapter-row,.chapter-item,.chapter-group-label').forEach(node => node.remove());
      if (!list.querySelector('.workspace-source-empty')) {
        const hint = document.createElement('div');
        hint.className = 'workspace-source-empty';
        hint.textContent = noRealProject ? '尚未載入作品或章節' : '這個作品尚未載入章節';
        list.appendChild(hint);
      }
    } else {
      list?.querySelector('.workspace-source-empty')?.remove();
    }
  }

  function syncWorkspaceEmptyState() {
    const noContent = !hasChapterContent();
    const grid = document.querySelector('.workspace-grid');
    const stats = document.querySelector('.stats-grid');
    const miniSettings = document.getElementById('smartSplitMiniSettings');
    const generate = document.getElementById('generateBtn');
    const save = document.getElementById('saveBtn');

    grid?.classList.toggle('workspace-empty-mode', noContent);
    if (stats) stats.hidden = noContent;
    if (miniSettings) miniSettings.hidden = noContent;
    if (generate) generate.hidden = noContent;
    if (save) save.hidden = noContent;

    syncSourcePanelEmptyState(noContent);
    if (noContent) {
      suggestion = null;
      const empty = document.getElementById('suggestionEmpty');
      const card = document.getElementById('suggestionCard');
      empty?.classList.remove('hidden');
      card?.classList.add('hidden');
      syncEmptyCopy();
    } else {
      document.getElementById('workspaceEmptyActions')?.remove();
    }
  }

  // The Projects API may still contain the one blank compatibility record. Hide
  // that record from every consumer so the Works and Publishing screens can tell
  // the difference between “nothing exists yet” and a real user-created work.
  const projectsApi = window.StoryFlowProjects;
  if (projectsApi?.list) {
    const baseList = projectsApi.list.bind(projectsApi);
    projectsApi.list = function listVisibleProjects() {
      const projects = baseList();
      if (projects.length === 1 && isImplicitBlankWorkspace()) return [];
      return projects;
    };
  }

  // An explicit “new work” is a real work even before a source is loaded. Give it
  // a temporary visible name so it is not confused with the internal blank sentinel.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#projectsNewWorkBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.StoryFlowProjects?.createProject?.({ title: '新作品' });
    window.StoryFlowNavigate?.('workspace');
    requestAnimationFrame(() => {
      const input = document.getElementById('projectTitle');
      input?.focus();
      input?.select();
    });
  }, true);

  const baseRenderChapters = window.renderChapters;
  if (typeof baseRenderChapters === 'function') {
    window.renderChapters = function renderChaptersWithoutSentinel(...args) {
      const result = baseRenderChapters.apply(this, args);
      syncWorkspaceEmptyState();
      return result;
    };
  }

  const baseRenderSuggestion = window.renderSuggestion;
  if (typeof baseRenderSuggestion === 'function') {
    window.renderSuggestion = function renderSuggestionWithEmptyWorkspace(...args) {
      const result = baseRenderSuggestion.apply(this, args);
      syncWorkspaceEmptyState();
      return result;
    };
  }

  const baseProjectsRender = window.StoryFlowRenderProjects;
  if (typeof baseProjectsRender === 'function') {
    window.StoryFlowRenderProjects = function renderProjectsWithEmptyState(...args) {
      const result = baseProjectsRender.apply(this, args);
      const list = document.getElementById('projectsLibrary');
      if (list && !window.StoryFlowProjects?.list?.().length) {
        list.innerHTML = `
          <div class="projects-empty-state">
            <strong>尚未建立作品</strong>
            <span>你可以直接回工作台「載入來源」，StoryFlow 會依文件建立作品；也可以先新增一個空作品。</span>
          </div>`;
      }
      return result;
    };
  }

  window.addEventListener('storyflow:projects-changed', () => {
    syncWorkspaceEmptyState();
    window.StoryFlowRenderProjects?.();
  });

  syncWorkspaceEmptyState();
  window.StoryFlowSyncEmptyWorkspace = syncWorkspaceEmptyState;
})();
