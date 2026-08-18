// Publishing disclosure UX v1.
// Works uses an explicit "管理章節" button to reveal secondary details; publishing
// should use the same interaction vocabulary instead of an unlabeled chevron.
(function () {
  function decoratePublishingRows() {
    const panelNote = document.querySelector('.publishing-dashboard-panel > .panel-head .muted');
    if (panelNote) panelNote.textContent = '外層顯示整體發布狀態；使用「管理發布」展開各平台細項。';

    document.querySelectorAll('.publish-list-item').forEach(card => {
      const summary = card.querySelector('.publish-list-summary');
      const actions = card.querySelector('.publish-list-actions');
      const indicator = actions?.querySelector('.publish-expand-indicator');
      if (!summary || !actions || !indicator) return;

      const expanded = card.classList.contains('expanded');
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'button tiny ghost publish-manage-btn';
      manage.textContent = expanded ? '收合發布' : '管理發布';
      manage.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      manage.setAttribute('aria-label', `${expanded ? '收合' : '展開'}「${card.querySelector('.publish-list-title-row strong')?.textContent || '文章'}」的發布平台`);
      manage.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        // publishing-flow owns the selected-item state. Trigger its existing summary
        // handler so filtering, one-at-a-time expansion, and rerender behavior stay intact.
        summary.click();
      });
      indicator.replaceWith(manage);
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

  window.addEventListener('storyflow:view-changed', () => window.setTimeout(decoratePublishingRows, 0));
  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(decoratePublishingRows, 0));
  decoratePublishingRows();
})();
