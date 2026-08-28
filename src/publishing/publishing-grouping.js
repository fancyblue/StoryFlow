// Publishing list grouping keeps the reading hierarchy explicit without adding another large panel.
// Current data is one active work at a time; the work wrapper is deliberate so the same structure can
// later support a multi-work filter without changing article/chapter hierarchy.
(function () {
  function groupPublishingList() {
    const list = document.getElementById('partsList');
    if (!list || list.querySelector(':scope > .publishing-project-group')) return;

    const cards = [...list.querySelectorAll(':scope > .publish-list-item')];
    if (!cards.length) return;

    const projectGroup = document.createElement('section');
    projectGroup.className = 'publishing-project-group';
    projectGroup.dataset.projectId = window.StoryFlowProjects?.activeId?.() || '';

    const projectHead = document.createElement('header');
    projectHead.className = 'publishing-project-group-head';
    const projectTitle = document.createElement('strong');
    projectTitle.textContent = state?.projectTitle || '未命名作品';
    const projectCount = document.createElement('span');
    projectCount.textContent = `${cards.length.toLocaleString()} 項`;
    projectHead.append(projectTitle, projectCount);
    projectGroup.appendChild(projectHead);

    const chapterGroups = new Map();
    cards.forEach(card => {
      const chapterName = card.querySelector('.publish-chapter-name')?.textContent?.trim() || '未命名章節';
      let chapterGroup = chapterGroups.get(chapterName);
      if (!chapterGroup) {
        chapterGroup = document.createElement('section');
        chapterGroup.className = 'publishing-chapter-group';
        chapterGroup.dataset.chapterName = chapterName;

        const head = document.createElement('header');
        head.className = 'publishing-chapter-group-head';
        const title = document.createElement('strong');
        title.textContent = chapterName;
        const count = document.createElement('span');
        count.className = 'publishing-chapter-group-count';
        head.append(title, count);

        const rows = document.createElement('div');
        rows.className = 'publishing-chapter-group-rows';
        chapterGroup.append(head, rows);
        chapterGroups.set(chapterName, chapterGroup);
        projectGroup.appendChild(chapterGroup);
      }

      chapterGroup.querySelector('.publishing-chapter-group-rows')?.appendChild(card);
    });

    chapterGroups.forEach(group => {
      const count = group.querySelectorAll(':scope > .publishing-chapter-group-rows > .publish-list-item').length;
      const label = group.querySelector('.publishing-chapter-group-count');
      if (label) label.textContent = `${count.toLocaleString()} 項`;
    });

    list.replaceChildren(projectGroup);
  }

  const baseRenderParts = window.renderParts;
  if (typeof baseRenderParts === 'function' && !baseRenderParts.__publishingGrouping) {
    const wrapped = function (...args) {
      const result = baseRenderParts.apply(this, args);
      groupPublishingList();
      return result;
    };
    wrapped.__publishingGrouping = true;
    window.renderParts = wrapped;
  }

  window.addEventListener('storyflow:view-changed', () => window.setTimeout(groupPublishingList, 0));
  window.addEventListener('storyflow:projects-changed', () => window.setTimeout(groupPublishingList, 0));
  window.StoryFlowPublishingGrouping = { refresh: groupPublishingList };
  groupPublishingList();
})();
