// Publishing disclosure UX v1.
// Works uses explicit management buttons and keeps destructive actions behind "...".
// Publishing follows the same interaction vocabulary: "管理發布" controls disclosure,
// while delete is available only from the final row overflow menu.
(function () {
  function closeOverflowMenus(except = null) {
    document.querySelectorAll('.publish-row-overflow-menu').forEach(menu => {
      if (menu === except) return;
      menu.hidden = true;
      const actions = menu.closest('.publish-list-actions');
      actions?.querySelector('.publish-more-btn')?.setAttribute('aria-expanded', 'false');
      actions?.closest('.publish-list-item')?.classList.remove('overflow-open');
    });
  }

  function addOverflowDelete(actions, legacyDelete, articleTitle) {
    if (!actions || !legacyDelete) return;

    // The legacy delete control remains in the DOM only as the underlying action target.
    // It must never compete visually with the overflow pattern. Inline !important makes
    // this invariant immune to later legacy styles that also use !important.
    legacyDelete.hidden = true;
    legacyDelete.setAttribute('aria-hidden', 'true');
    legacyDelete.tabIndex = -1;
    legacyDelete.style.setProperty('display', 'none', 'important');
    legacyDelete.style.setProperty('visibility', 'hidden', 'important');
    legacyDelete.style.setProperty('position', 'absolute', 'important');
    legacyDelete.style.setProperty('width', '0', 'important');
    legacyDelete.style.setProperty('height', '0', 'important');
    legacyDelete.style.setProperty('padding', '0', 'important');
    legacyDelete.style.setProperty('margin', '0', 'important');
    legacyDelete.style.setProperty('pointer-events', 'none', 'important');

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
      actions.appendChild(more);
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
        actions.closest('.publish-list-item')?.classList.remove('overflow-open');
        legacyDelete.click();
      });
      menu.appendChild(remove);
      actions.appendChild(menu);
    }

    if (more.dataset.publishOverflowBound !== '1') {
      more.dataset.publishOverflowBound = '1';
      more.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = menu.hidden;
        closeOverflowMenus(opening ? menu : null);
        menu.hidden = !opening;
        more.setAttribute('aria-expanded', opening ? 'true' : 'false');
        actions.closest('.publish-list-item')?.classList.toggle('overflow-open', opening);
        if (opening) menu.querySelector('button')?.focus({ preventScroll: true });
      });
    }
  }

  function decoratePublishingRows() {
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
  decoratePublishingRows();
})();
