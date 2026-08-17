// Publishing page project switcher: publishing always reflects exactly one active work.
(function () {
  function projectApi() {
    return window.StoryFlowProjects;
  }

  function renderPublishingProjectSelect() {
    const api = projectApi();
    const select = document.getElementById('publishingProjectSelect');
    if (!api || !select) return;

    const projects = api.list?.() || [];
    const activeId = api.activeId?.();
    select.innerHTML = '';
    projects.forEach(project => {
      const option = new Option(project.title || '未命名作品', project.id);
      select.add(option);
    });
    select.value = activeId || '';
    select.disabled = projects.length <= 1;
    select.title = projects.length <= 1 ? '目前只有一個作品' : '切換發布中的作品';
  }

  function ensurePublishingProjectSelect() {
    const api = projectApi();
    const badge = document.querySelector('.publishing-project-badge');
    if (!api || !badge) return;

    badge.classList.add('publishing-project-switcher');
    if (!document.getElementById('publishingProjectSelect')) {
      badge.innerHTML = `
        <label class="publishing-project-field" for="publishingProjectSelect">
          <span>目前作品</span>
          <select id="publishingProjectSelect" class="text-input" aria-label="切換發布作品"></select>
        </label>`;

      badge.querySelector('#publishingProjectSelect').addEventListener('change', event => {
        const nextId = event.target.value;
        if (!nextId || nextId === api.activeId?.()) return;
        api.switchProject?.(nextId);
        // Project switching should not kick the user out of the publishing workflow.
        window.StoryFlowNavigate?.('publishing');
      });
    }

    renderPublishingProjectSelect();
  }

  const baseRenderParts = window.renderParts;
  if (typeof baseRenderParts === 'function') {
    window.renderParts = function renderPartsWithProjectSwitcher(...args) {
      const result = baseRenderParts.apply(this, args);
      ensurePublishingProjectSelect();
      renderPublishingProjectSelect();
      return result;
    };
  }

  window.addEventListener('storyflow:projects-changed', () => {
    ensurePublishingProjectSelect();
    renderPublishingProjectSelect();
  });

  ensurePublishingProjectSelect();
})();
