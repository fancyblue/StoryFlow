// Smart Split UX: compact controls, editable title, reliable platform list, synced comparison dialog.
(function () {
  let customTitle = '';
  let suggestionIdentity = '';

  function syncAllFormatSelects() {
    const { fillPlatformSelect } = window.StoryFlowShared;
    fillPlatformSelect(document.getElementById('suggestionPlatformSelect'));
    fillPlatformSelect(document.getElementById('readingPlatformSelect'));
  }

  function identityForSuggestion() {
    if (!suggestion) return '';
    return `${activeChapter()?.id || ''}:${suggestion.start}`;
  }

  function preserveTitleAdjust(delta) {
    if (!suggestion) return;
    const previousTitle = customTitle || suggestion.name;
    const blocks = parseBlocks(activeChapter().draft);
    const end = Math.max(suggestion.start + 1, Math.min(blocks.length, suggestion.end + delta));
    suggestion = buildSuggestion(suggestion.start, end, blocks);
    suggestion.name = previousTitle;
    customTitle = previousTitle;
    renderSuggestion();
    syncEditableTitle();
    window.StoryFlowRefreshReviewFromSource?.(false);
  }

  function syncEditableTitle() {
    if (!suggestion) return;
    const titleRow = document.querySelector('.splitter-panel .suggestion-title-row');
    const original = document.getElementById('suggestionName');
    if (!titleRow || !original) return;

    const identity = identityForSuggestion();
    if (identity !== suggestionIdentity) {
      suggestionIdentity = identity;
      customTitle = suggestion.name;
    }
    if (!customTitle) customTitle = suggestion.name;
    suggestion.name = customTitle;
    original.textContent = customTitle;
    original.classList.add('suggestion-name-hidden');

    let input = document.getElementById('suggestionTitleInput');
    if (!input) {
      input = document.createElement('input');
      input.id = 'suggestionTitleInput';
      input.className = 'suggestion-title-input';
      input.type = 'text';
      input.setAttribute('aria-label', '切篇標題');
      original.insertAdjacentElement('afterend', input);
      input.addEventListener('input', () => {
        customTitle = input.value;
        if (suggestion) suggestion.name = customTitle || suggestion.name;
        original.textContent = customTitle;
      });
      input.addEventListener('change', () => {
        if (!input.value.trim()) {
          input.value = suggestion?.name || '';
          customTitle = input.value;
        }
        if (suggestion) suggestion.name = customTitle;
        saveState('切篇標題已更新');
      });
    }
    if (document.activeElement !== input) input.value = customTitle;
  }

  function installPreviewOverlayControls() {
    const preview = document.getElementById('preview');
    const controls = document.querySelector('.splitter-panel .boundary-control');
    if (!preview || !controls) return;

    let shell = document.getElementById('splitPreviewShell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'splitPreviewShell';
      shell.className = 'split-preview-shell';
      preview.parentNode.insertBefore(shell, preview);
      shell.appendChild(preview);
    }
    controls.classList.add('preview-boundary-controls');
    shell.appendChild(controls);
    document.getElementById('shrinkBtn').onclick = () => preserveTitleAdjust(-1);
    document.getElementById('expandBtn').onclick = () => preserveTitleAdjust(1);
  }

  function organizeSmartSplit() {
    const panel = document.querySelector('.splitter-panel');
    const head = panel?.querySelector('.panel-head');
    const mini = document.getElementById('smartSplitMiniSettings');
    const reviewBtn = document.getElementById('openReadingViewBtn');
    const card = document.getElementById('suggestionCard');
    const titleRow = panel?.querySelector('.suggestion-title-row');
    const formatBar = document.getElementById('splitPlatformBar');
    if (!panel || !head) return;

    const titleBlock = head.querySelector(':scope > div:first-child') || head.firstElementChild;
    if (titleBlock && !titleBlock.querySelector('h2')) {
      const h2 = document.createElement('h2');
      h2.textContent = '切篇預覽';
      titleBlock.appendChild(h2);
    }

    let actions = document.getElementById('smartSplitHeaderActions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'smartSplitHeaderActions';
      actions.className = 'smart-split-header-actions';
      head.appendChild(actions);
    }
    if (reviewBtn && reviewBtn.parentElement !== actions) actions.appendChild(reviewBtn);
    if (reviewBtn) {
      reviewBtn.hidden = !suggestion;
      reviewBtn.disabled = !suggestion;
    }

    if (mini) {
      // The disclosure that opens this region is already labelled 切篇偏好 directly above it;
      // a second 切篇偏好 as the region's first line read as a heading for nothing. The name
      // stays for assistive technology, which does not see the two side by side.
      mini.querySelector('.smart-split-settings-label')?.remove();
      mini.setAttribute('role', 'group');
      mini.setAttribute('aria-label', '切篇偏好');
      if (head.nextElementSibling !== mini) head.insertAdjacentElement('afterend', mini);
    }

    if (card && titleRow && formatBar && formatBar.nextElementSibling !== titleRow) {
      card.insertBefore(formatBar, titleRow);
    }
  }

  const baseRender = window.renderSuggestion;
  window.renderSuggestion = function renderSuggestionSmartSplit() {
    baseRender();
    syncAllFormatSelects();
    organizeSmartSplit();
    if (!suggestion) {
      customTitle = '';
      suggestionIdentity = '';
      return;
    }
    syncEditableTitle();
    installPreviewOverlayControls();
    window.StoryFlowRefreshReviewFromSource?.(false);
  };

  syncAllFormatSelects();
  organizeSmartSplit();
  installPreviewOverlayControls();
  if (suggestion) syncEditableTitle();
})();
