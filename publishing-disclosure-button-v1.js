// Publishing disclosure UX v1.
// Works uses explicit management buttons and keeps destructive actions behind "...".
// Publishing follows the same interaction vocabulary: "管理發布" controls disclosure,
// while delete is available only from the final row overflow menu.
(function () {
  function ensureStyles() {
    let link = document.getElementById('storyflowPublishingDisclosureButtonV1Css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'storyflowPublishingDisclosureButtonV1Css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    const href = './publishing-disclosure-button-v1.css?v=20260818-1729';
    if (!link.href.endsWith(href.replace('./', '/')) && link.getAttribute('href') !== href) link.href = href;
  }

  function closeOverflowMenus(except = null) {
    document.querySelectorAll('.publish-row-overflow-menu').forEach(menu => {
      if (menu === except) return;
      menu.hidden = true;
      menu.closest('.publish-list-actions')?.querySelector('.publish-more-btn')?.setAttribute('aria-expanded', 'false');
    });
  }

  function addOverflowDelete(actions, legacyDelete, articleTitle) {
    if (!actions || !legacyDelete) return;
    let more = actions.querySelector(':scope > .publish-more-btn');
    let menu = actions.querySelector(':scope > .publish-row-overflow-menu');

    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'button tiny ghost publish-more-btn';
      more.textContent = '⋯';
      more.title = '更多文章操作';
      more.setAttribute('aria-label', `更多「${articleTitle}」操作`);
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
    }

    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'publish-row-overflow-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'menu');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('role', 'menuitem');
      remove.innerHTML = '<span aria-hidden="true">×</span><span>刪除文章</span>';
      remove.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        menu.hidden = true;
        more.setAttribute('aria-expanded', 'false');
        legacyDelete.click();
      });
      menu.appendChild(remove);
    }

    // Explicitly restore DOM order after every publish-list rerender: ... is the final
    // visible action, while the absolutely positioned menu follows it in the DOM.
    actions.appendChild(more);
    actions.appendChild(menu);

    if (more.dataset.publishOverflowBound !== '1') {
      more.dataset.publishOverflowBound = '1';
      more.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = menu.hidden;
        closeOverflowMenus(opening ? menu : null);
        menu.hidden = !opening;
        more.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) menu.querySelector('button')?.focus({ preventScroll: true });
      });
    }
  }

  function decoratePublishingRows() {
    ensureStyles();
    const panelNote = document.querySelector('.publishing-dashboard-panel > .panel-head .muted');
    if (panelNote) panelNote.textContent = '外層顯示整體發布狀態；使用「管理發布」展開各平台細項，其他操作收在「⋯」。';

    document.querySelectorAll('.publish-list-item').forEach(card => {
      const summary = card.querySelector('.publish-list-summary');
      const actions = card.querySelector('.publish-list-actions');
      const indicator = actions?.querySelector('.publish-expand-indicator');
      const legacyDelete = actions?.querySelector('.publish-delete-btn');
      if (!summary || !actions) return;

      summary.removeAttribute('role');
      summary.removeAttribute('tabindex');
      summary.removeAttribute('aria-expanded');
      summary.style.cursor = 'default';
      if (summary.dataset.publishDisclosureBound !== '1') {
        summary.dataset.publishDisclosureBound = '1';
        summary.addEventListener('click', event => {
          if (event.isTrusted && !event.target.closest('button')) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
      }

      const articleTitle = card.querySelector('.publish-list-title-row strong')?.textContent || '文章';
      const expanded = card.classList.contains('expanded');
      let manage = actions.querySelector(':scope > .publish-manage-btn');
      if (!manage && indicator) {
        manage = document.createElement('button');
        manage.type = 'button';
        manage.className = 'button tiny ghost publish-manage-btn';
        indicator.replaceWith(manage);
      }
      if (manage) {
        manage.textContent = expanded ? '收合發布' : '管理發布';
        manage.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        manage.setAttribute('aria-label', `${expanded ? '收合' : '展開'}「${articleTitle}」的發布平台`);
        if (manage.dataset.publishManageBound !== '1') {
          manage.dataset.publishManageBound = '1';
          manage.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            summary.click();
          });
        }
      }
      addOverflowDelete(actions, legacyDelete, articleTitle);
    });
  }

  const baseRenderParts = window.renderParts;
  if (typeof baseRenderParts === 'function' && !baseRenderParts.__publishingDisclosureButtonV1) {
    const wrapped = function (...args) {
      const result = baseRenderParts.apply(this, args);
      decoratePublishingRows();
      return result;
    };
    wrapped.__publishingDisclosureButtonV1 = true;
    window.renderParts = wrapped;
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('.publish-more-btn, .publish-row-overflow-menu')) closeOverflowMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOverflowMenus();
  });
  window.addEventListener('storyflow:view-changed', () => window.setTimeout(decoratePublishingRows, 0));
  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(decoratePublishingRows, 0));
  ensureStyles();
  decoratePublishingRows();
})();
