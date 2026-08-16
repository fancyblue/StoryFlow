// UI/UX polish for source loading and preview flow.
(function () {
  function addSteps(dialog, activeStep) {
    const card = dialog?.querySelector('.source-flow-card');
    const head = card?.querySelector('.sticky-dialog-head');
    if (!card || !head || card.querySelector('.source-flow-steps')) return;
    const steps = document.createElement('div');
    steps.className = 'source-flow-steps';
    const labels = ['選來源', '檢視內容', '進入切篇'];
    labels.forEach((label, index) => {
      if (index) {
        const sep = document.createElement('span');
        sep.className = 'source-flow-separator';
        sep.textContent = '›';
        steps.appendChild(sep);
      }
      const step = document.createElement('span');
      step.className = `source-flow-step ${index + 1 === activeStep ? 'active' : ''}`;
      step.dataset.step = String(index + 1);
      step.textContent = label;
      steps.appendChild(step);
    });
    head.insertAdjacentElement('afterend', steps);
  }

  function organizePreview() {
    const dialog = document.getElementById('sourcePreviewDialog');
    if (!dialog) return;
    addSteps(dialog, 2);
    const card = dialog.querySelector('.source-preview-card');
    const tabs = document.getElementById('sourcePreviewChapterTabs');
    const content = document.getElementById('sourcePreviewContent');
    const actions = card?.querySelector('.sticky-dialog-actions');
    if (!card || !tabs || !content || card.querySelector('.source-preview-layout')) return;

    const layout = document.createElement('div');
    layout.className = 'source-preview-layout';

    const nav = document.createElement('aside');
    nav.className = 'source-preview-nav';
    const navTitle = document.createElement('div');
    navTitle.className = 'source-preview-nav-title';
    navTitle.textContent = '章節';
    nav.append(navTitle, tabs);

    const reader = document.createElement('section');
    reader.className = 'source-preview-reader';
    const readerTitle = document.createElement('div');
    readerTitle.className = 'source-preview-reader-title';
    readerTitle.textContent = '轉換後內容';
    reader.append(readerTitle, content);

    layout.append(nav, reader);
    card.insertBefore(layout, actions || null);

    tabs.addEventListener('click', event => {
      if (event.target.closest('.source-preview-tab')) {
        requestAnimationFrame(() => { content.scrollTop = 0; });
      }
    });
  }

  function polishSourceDialogs() {
    const source = document.getElementById('sourceDialog');
    const manual = document.getElementById('manualSourceDialog');
    if (source) addSteps(source, 1);
    if (manual) addSteps(manual, 1);
    organizePreview();
  }

  polishSourceDialogs();
  document.getElementById('loadSourceBtn')?.addEventListener('click', () => setTimeout(polishSourceDialogs, 0));
  document.getElementById('sourceManualBtn')?.addEventListener('click', () => setTimeout(polishSourceDialogs, 0));
  document.getElementById('previewManualSourceBtn')?.addEventListener('click', () => setTimeout(polishSourceDialogs, 0));

  // Google source preview is created after async selection; observe only for dialog structure changes.
  const observer = new MutationObserver(() => polishSourceDialogs());
  observer.observe(document.body, { childList: true, subtree: true });
})();
