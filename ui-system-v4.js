// StoryFlow UI System v4 interaction contract: keep state, menus, and segmented controls
// semantically consistent without changing the product's underlying data flow.
(function () {
  function loadPublishingDeleteFolderFix() {
    if (document.getElementById('storyflowPublishingDeleteFolderFixJs')) return;
    const script = document.createElement('script');
    script.id = 'storyflowPublishingDeleteFolderFixJs';
    script.src = './publishing-delete-folder-fix.js?v=20260820-0005';
    script.async = false;
    document.body.appendChild(script);
  }

  function syncLiveRegions() {
    const saveState = document.getElementById('saveState');
    if (saveState) {
      saveState.setAttribute('role', 'status');
      saveState.setAttribute('aria-live', 'polite');
      saveState.setAttribute('aria-atomic', 'true');
    }
    ['googleStatus', 'folderStatus'].forEach(id => {
      const node = document.getElementById(id);
      if (!node) return;
      node.setAttribute('aria-live', 'polite');
      node.setAttribute('aria-atomic', 'true');
    });
  }

  function syncPublishingFilters() {
    document.querySelectorAll('.publishing-filter').forEach(button => {
      button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    });
  }

  function syncConnectionLabels() {
    const pairs = [
      ['topGoogleConnection', 'Google'],
      ['topFolderConnection', '資料夾']
    ];
    pairs.forEach(([id, label]) => {
      const button = document.getElementById(id);
      if (!button) return;
      const state = button.querySelector('.connection-chip-state')?.textContent?.trim();
      if (state) button.setAttribute('aria-label', `${label}：${state}`);
    });
  }

  function enhanceQuickSwitch() {
    const button = document.getElementById('quickSwitchProjectBtn');
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    if (!button) return;

    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', 'workspaceProjectQuickSwitch');
    if (!menu) return;

    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '切換作品');
    menu.querySelector('.workspace-project-quick-switch-title')?.setAttribute('role', 'presentation');
    menu.querySelectorAll('.workspace-project-quick-switch-item').forEach(item => {
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(item.classList.contains('active')));
    });
  }

  function visibleMenuItems(menu) {
    return [...menu.querySelectorAll('.workspace-project-quick-switch-item:not([disabled])')]
      .filter(item => !item.hidden && item.offsetParent !== null);
  }

  function closeQuickSwitch({ restoreFocus = false } = {}) {
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    const button = document.getElementById('quickSwitchProjectBtn');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button?.focus();
  }

  document.addEventListener('keydown', event => {
    const menu = document.getElementById('workspaceProjectQuickSwitch');
    if (!menu || menu.hidden) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickSwitch({ restoreFocus: true });
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    const items = visibleMenuItems(menu);
    if (!items.length) return;
    event.preventDefault();

    const current = document.activeElement;
    let index = items.indexOf(current);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = items.length - 1;
    else if (event.key === 'ArrowDown') index = index < 0 ? 0 : (index + 1) % items.length;
    else index = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
    items[index]?.focus();
  });

  document.addEventListener('click', event => {
    if (event.target.closest?.('#quickSwitchProjectBtn')) {
      requestAnimationFrame(() => {
        enhanceQuickSwitch();
        const menu = document.getElementById('workspaceProjectQuickSwitch');
        if (menu && !menu.hidden && event.detail === 0) visibleMenuItems(menu)[0]?.focus();
      });
    }
    if (event.target.closest?.('.publishing-filter')) requestAnimationFrame(syncPublishingFilters);
    requestAnimationFrame(syncConnectionLabels);
  });

  window.addEventListener('storyflow:view-changed', () => {
    requestAnimationFrame(() => {
      syncPublishingFilters();
      syncConnectionLabels();
      enhanceQuickSwitch();
    });
  });
  window.addEventListener('storyflow:projects-changed', () => requestAnimationFrame(enhanceQuickSwitch));
  window.addEventListener('storyflow:connection-changed', () => requestAnimationFrame(syncConnectionLabels));

  loadPublishingDeleteFolderFix();
  syncLiveRegions();
  syncPublishingFilters();
  syncConnectionLabels();
  enhanceQuickSwitch();
})();
