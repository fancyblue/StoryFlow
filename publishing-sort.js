// Publishing dashboard ordering: newest confirmed content first.
// Existing workspaces do not have creation timestamps, so their persisted
// chapter/part append order is treated as chronological and displayed in reverse.
(function () {
  function reorderNewestFirst() {
    const list = document.getElementById('partsList');
    if (!list?.querySelector('.publish-article-card')) return;

    const groups = [];
    const loose = [];
    let current = null;

    Array.from(list.children).forEach(node => {
      if (node.classList.contains('publishing-chapter-heading')) {
        current = { heading: node, cards: [] };
        groups.push(current);
        return;
      }
      if (node.classList.contains('publish-article-card') && current) {
        current.cards.push(node);
        return;
      }
      loose.push(node);
    });

    if (!groups.length) return;
    const fragment = document.createDocumentFragment();
    groups.reverse().forEach(group => {
      fragment.appendChild(group.heading);
      group.cards.reverse().forEach(card => fragment.appendChild(card));
    });
    loose.forEach(node => fragment.appendChild(node));
    list.appendChild(fragment);
  }

  const baseRenderParts = window.renderParts;
  if (typeof baseRenderParts === 'function') {
    window.renderParts = function renderPartsNewestFirst(...args) {
      const result = baseRenderParts(...args);
      reorderNewestFirst();
      return result;
    };
  }

  reorderNewestFirst();
  window.StoryFlowSortPublishingNewestFirst = reorderNewestFirst;
})();