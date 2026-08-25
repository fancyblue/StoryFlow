// Publishing page project switcher: compact, explicit dropdown matching the workspace quick switch.
(function () {
  function projectApi() {
    return window.StoryFlowProjects;
  }

  function closeMenu() {
    const menu = document.getElementById('publishingProjectMenu');
    const button = document.getElementById('publishingProjectSwitchBtn');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function renderMenu() {
    const api = projectApi();
    const menu = document.getElementById('publishingProjectMenu');
    const button = document.getElementById('publishingProjectSwitchBtn');
    const title = document.getElementById('publishingProjectCurrentTitle');
    if (!api || !menu || !button || !title) return;

    const projects = api.list?.() || [];
    const activeId = api.activeId?.();
    const active = projects.find(project => project.id === activeId) || projects[0];
    title.textContent = active?.title || '未命名作品';

    menu.replaceChildren();
    projects.forEach(project => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `publishing-project-menu-item ${project.id === activeId ? 'active' : ''}`;
      item.disabled = project.id === activeId;
      item.innerHTML = `<span>${escapeHtml(project.title || '未命名作品')}</span>${project.id === activeId ? '<small>目前</small>' : ''}`;
      item.addEventListener('click', () => {
        if (project.id === api.activeId?.()) return;
        api.switchProject?.(project.id, { quiet: true });
        closeMenu();
        window.StoryFlowNavigate?.('publishing');
      });
      menu.appendChild(item);
    });

    const canSwitch = projects.length > 1;
    button.disabled = !canSwitch;
    button.classList.toggle('single-project', !canSwitch);
    button.title = canSwitch ? '切換發布中的作品' : '目前只有一個作品';
    button.querySelector('.publishing-project-chevron').hidden = !canSwitch;
  }

  function ensurePublishingProjectSwitcher() {
    const api = projectApi();
    const badge = document.querySelector('.publishing-project-badge');
    if (!api || !badge) return;

    badge.classList.add('publishing-project-switcher');
    if (!document.getElementById('publishingProjectSwitchBtn')) {
      badge.innerHTML = `
        <div class="publishing-project-compact">
          <span class="publishing-project-label">目前作品</span>
          <button id="publishingProjectSwitchBtn" class="publishing-project-switch-btn" type="button" aria-haspopup="menu" aria-expanded="false">
            <strong id="publishingProjectCurrentTitle"></strong>
            <span class="sf-chevron publishing-project-chevron" aria-hidden="true"></span>
          </button>
          <div id="publishingProjectMenu" class="publishing-project-menu" role="menu" hidden></div>
        </div>`;

      badge.querySelector('#publishingProjectSwitchBtn').addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        if (button.disabled) return;
        const menu = document.getElementById('publishingProjectMenu');
        if (!menu) return;
        const opening = menu.hidden;
        menu.hidden = !opening;
        button.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
      });
    }

    renderMenu();
  }

  const baseRenderParts = window.renderParts;
  if (typeof baseRenderParts === 'function' && !baseRenderParts.__publishingProjectSwitcher) {
    const wrapped = function renderPartsWithProjectSwitcher(...args) {
      const result = baseRenderParts.apply(this, args);
      ensurePublishingProjectSwitcher();
      renderMenu();
      return result;
    };
    wrapped.__publishingProjectSwitcher = true;
    window.renderParts = wrapped;
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('.publishing-project-compact')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  window.addEventListener('storyflow:projects-changed', () => {
    ensurePublishingProjectSwitcher();
    renderMenu();
  });
  window.addEventListener('storyflow:view-changed', () => {
    ensurePublishingProjectSwitcher();
    renderMenu();
  });

  ensurePublishingProjectSwitcher();
})();
