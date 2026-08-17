// Unified preview UX: every reading preview defaults to rendered Markdown, with an
// explicit switch back to the exact Markdown text. Existing feature modules keep
// owning the source text; this layer only changes how preview surfaces present it.
(function () {
  const TARGET_SELECTOR = [
    '#preview',
    '#dialogReviewPrevious',
    '#dialogReviewCurrent',
    '#dialogReviewFull',
    '#sourcePreviewContent',
    '#sourceRefreshBefore',
    '#sourceRefreshAfter',
    '#sourceRelinkBefore',
    '#sourceRelinkAfter',
    '#platformPreviewContent'
  ].join(',');

  const states = new WeakMap();
  const groupModes = new Map([
    ['split', 'preview'],
    ['review', 'preview'],
    ['source', 'preview'],
    ['relink', 'preview'],
    ['publish', 'preview']
  ]);
  let observer = null;
  let observing = false;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function inlineMarkdown(value) {
    let text = String(value ?? '');
    const tokens = [];
    const token = html => {
      const key = `§SF${tokens.length}§`;
      tokens.push(html);
      return key;
    };

    // Protect code, links and image placeholders before applying emphasis rules.
    text = text.replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`));
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt) => {
      const label = alt || '圖片';
      return token(`<span class="sf-md-image" title="圖片位置">▧ ${escapeHtml(label)}</span>`);
    });
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      return token(`<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    });

    let html = escapeHtml(text);
    html = html.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___([\s\S]+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([\s\S]+?)__/g, '<strong>$1</strong>');
    html = html.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

    tokens.forEach((replacement, index) => {
      html = html.split(`§SF${index}§`).join(replacement);
    });
    return html;
  }

  function isSceneMarker(line) {
    const value = String(line || '').trim();
    if (!value) return false;
    const marker = typeof state !== 'undefined' ? String(state?.sceneMarker || '').trim() : '';
    return Boolean((marker && value === marker) || /^[＊*]{3,}$/.test(value));
  }

  function renderMarkdownDocument(value) {
    const lines = String(value ?? '').replace(/\r\n/g, '\n').split('\n');
    const pieces = [];
    let blankBefore = 0;
    let inFence = false;
    let fenceLines = [];

    const pushBlock = (body, extraClass = '') => {
      const spacing = pieces.length ? (blankBefore ? ' sf-md-spaced' : ' sf-md-tight') : '';
      pieces.push(`<span class="sf-md-block${spacing}${extraClass ? ` ${extraClass}` : ''}">${body}</span>`);
      blankBefore = 0;
    };

    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        if (inFence) {
          pushBlock(`<code>${escapeHtml(fenceLines.join('\n'))}</code>`, 'sf-md-code-block');
          fenceLines = [];
          inFence = false;
        } else {
          inFence = true;
        }
        continue;
      }
      if (inFence) {
        fenceLines.push(line);
        continue;
      }
      if (!line.trim()) {
        blankBefore += 1;
        continue;
      }
      if (isSceneMarker(line)) {
        pushBlock(`<span>${escapeHtml(line.trim())}</span>`, 'sf-md-scene-separator');
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        pushBlock(inlineMarkdown(heading[2]), `sf-md-heading sf-md-heading-${heading[1].length}`);
        continue;
      }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        pushBlock(inlineMarkdown(quote[1]), 'sf-md-quote');
        continue;
      }
      const bullet = line.match(/^\s*[-+]\s+(.+)$/);
      if (bullet) {
        pushBlock(`<span class="sf-md-list-marker">•</span><span>${inlineMarkdown(bullet[1])}</span>`, 'sf-md-list-line');
        continue;
      }
      const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (ordered) {
        pushBlock(`<span class="sf-md-list-marker">${escapeHtml(ordered[1])}.</span><span>${inlineMarkdown(ordered[2])}</span>`, 'sf-md-list-line');
        continue;
      }
      pushBlock(inlineMarkdown(line));
    }

    if (inFence) pushBlock(`<code>${escapeHtml(fenceLines.join('\n'))}</code>`, 'sf-md-code-block');
    return pieces.join('') || '<span class="sf-md-empty">（沒有內容）</span>';
  }

  function transformAuthoredHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');

    function visit(node) {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          if (!child.nodeValue || !/[\*_~`\[]/.test(child.nodeValue)) return;
          const holder = document.createElement('span');
          holder.innerHTML = inlineMarkdown(child.nodeValue);
          child.replaceWith(...holder.childNodes);
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (child.matches('code,.range-boundary')) return;
        visit(child);
      });
    }

    visit(template.content);
    const holder = document.createElement('div');
    holder.appendChild(template.content.cloneNode(true));
    return holder.innerHTML;
  }

  function groupFor(element) {
    if (!element) return null;
    if (element.id === 'preview') return 'split';
    if (/^dialogReview/.test(element.id)) return 'review';
    if (/^sourceRelink/.test(element.id)) return 'relink';
    if (/^sourcePreview|^sourceRefresh/.test(element.id)) return 'source';
    if (element.id === 'platformPreviewContent') return 'publish';
    return null;
  }

  function isSourceRaw(element) {
    return ['sourcePreviewContent', 'sourceRefreshBefore', 'sourceRefreshAfter', 'sourceRelinkBefore', 'sourceRelinkAfter'].includes(element?.id);
  }

  function captureAuthoredContent(element, stateRecord) {
    stateRecord.rawText = element.textContent || '';
    stateRecord.authoredHtml = element.id === 'dialogReviewFull' ? element.innerHTML : '';
  }

  function previewText(element, stateRecord) {
    if (isSourceRaw(element) && typeof webFormat === 'function') {
      return webFormat(stateRecord.rawText || '');
    }
    return stateRecord.rawText || '';
  }

  function renderTarget(element) {
    const stateRecord = states.get(element);
    if (!stateRecord) return;
    const mode = groupModes.get(stateRecord.group) || 'preview';
    element.classList.add('sf-preview-surface');
    element.classList.toggle('sf-preview-rendered', mode === 'preview');
    element.classList.toggle('sf-preview-raw', mode === 'raw');

    if (mode === 'raw') {
      element.innerHTML = '<span class="sf-preview-raw-root" data-sf-preview-owned="1"></span>';
      element.querySelector('[data-sf-preview-owned]').textContent = stateRecord.rawText || '';
      return;
    }

    const html = element.id === 'dialogReviewFull' && stateRecord.authoredHtml
      ? transformAuthoredHtml(stateRecord.authoredHtml)
      : renderMarkdownDocument(previewText(element, stateRecord));
    element.innerHTML = `<span class="sf-preview-rendered-root" data-sf-preview-owned="1">${html}</span>`;
  }

  function controlMarkup() {
    return `
      <span class="sf-preview-mode-label">顯示</span>
      <span class="sf-preview-mode-segment" role="group" aria-label="預覽顯示模式">
        <button type="button" data-sf-mode="preview">預覽</button>
        <button type="button" data-sf-mode="raw">原始 MD</button>
      </span>`;
  }

  function controlAnchor(group) {
    if (group === 'split') return document.getElementById('splitPlatformBar');
    if (group === 'review') return document.querySelector('#reviewDialog .review-format-bar');
    if (group === 'source') return document.getElementById('sourcePreviewWarning');
    if (group === 'relink') return document.getElementById('sourceRelinkWarning');
    if (group === 'publish') return document.getElementById('platformPreviewMeta');
    return null;
  }

  function ensureControl(group) {
    if (!group || document.querySelector(`[data-sf-preview-control="${group}"]`)) return;
    const anchor = controlAnchor(group);
    if (!anchor) return;
    const control = document.createElement('div');
    control.className = `sf-preview-mode-control sf-preview-mode-${group}`;
    control.dataset.sfPreviewControl = group;
    control.innerHTML = controlMarkup();
    control.addEventListener('click', event => {
      const button = event.target.closest('[data-sf-mode]');
      if (!button) return;
      setMode(group, button.dataset.sfMode);
    });

    if (['source', 'relink', 'publish'].includes(group)) anchor.insertAdjacentElement('afterend', control);
    else anchor.appendChild(control);
    syncControl(group);
  }

  function syncControl(group) {
    const control = document.querySelector(`[data-sf-preview-control="${group}"]`);
    if (!control) return;
    const mode = groupModes.get(group) || 'preview';
    control.querySelectorAll('[data-sf-mode]').forEach(button => {
      const active = button.dataset.sfMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function pauseObserver(callback) {
    if (observer && observing) observer.disconnect();
    observing = false;
    try {
      callback();
      observer?.takeRecords?.();
    } finally {
      startObserver();
    }
  }

  function setMode(group, mode) {
    if (!['preview', 'raw'].includes(mode)) return;
    groupModes.set(group, mode);
    pauseObserver(() => {
      syncControl(group);
      document.querySelectorAll(TARGET_SELECTOR).forEach(element => {
        const stateRecord = states.get(element);
        if (stateRecord?.group === group) renderTarget(element);
      });
    });
  }

  function scan() {
    pauseObserver(() => {
      ['split', 'review', 'source', 'relink', 'publish'].forEach(ensureControl);
      document.querySelectorAll(TARGET_SELECTOR).forEach(element => {
        const group = groupFor(element);
        if (!group) return;
        let stateRecord = states.get(element);
        if (!stateRecord) {
          stateRecord = { group, rawText: '', authoredHtml: '' };
          states.set(element, stateRecord);
          captureAuthoredContent(element, stateRecord);
        } else if (!element.querySelector(':scope > [data-sf-preview-owned]')) {
          // Feature modules write their latest preview back into the same element.
          // Our render always leaves one owned root; its disappearance means the
          // underlying feature supplied new Markdown that needs to be captured.
          captureAuthoredContent(element, stateRecord);
        }
        renderTarget(element);
      });
      ['split', 'review', 'source', 'relink', 'publish'].forEach(syncControl);
    });
  }

  function resetDialogMode(dialog) {
    if (!dialog?.open) return;
    if (dialog.id === 'reviewDialog') groupModes.set('review', 'preview');
    if (dialog.id === 'sourcePreviewDialog') groupModes.set('source', 'preview');
    if (dialog.id === 'sourceRelinkDialog') groupModes.set('relink', 'preview');
    if (dialog.id === 'platformPreviewDialog') groupModes.set('publish', 'preview');
  }

  function startObserver() {
    if (!observer || observing || !document.body) return;
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    observing = true;
  }

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'open') resetDialogMode(mutation.target);
    }
    scan();
  });

  startObserver();
  scan();

  window.StoryFlowPreviewMode = {
    setMode,
    refresh: scan,
    renderMarkdown: renderMarkdownDocument
  };
})();
