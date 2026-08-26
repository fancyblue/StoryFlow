// Pure source comparison used by both project-source sync implementations.
// Kept independent from application state so it can be regression-tested alone.
(function () {
  const MAX_HUNKS = 5;
  const INLINE_CONTEXT = 42;
  const MAX_CHANGED_TEXT = 140;
  const MAX_LEGACY_SNIPPET = 320;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function normalizeTitle(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeDraft(value) {
    return String(value || '').replace(/\r\n?/g, '\n').trimEnd();
  }

  function defaultCharCount(value) {
    return normalizeDraft(value)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`>#\s]/g, '')
      .length;
  }

  function paragraphs(value) {
    const normalized = normalizeDraft(value);
    if (!normalized) return [];
    return normalized.split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
  }

  function visibleWhitespace(value) {
    return String(value || '').replace(/\n/g, ' ↵ ');
  }

  function shorten(value) {
    const text = visibleWhitespace(value);
    return text.length > MAX_LEGACY_SNIPPET ? `${text.slice(0, MAX_LEGACY_SNIPPET - 1)}…` : text;
  }

  function shortenChanged(value) {
    const characters = [...String(value || '')];
    if (characters.length <= MAX_CHANGED_TEXT) return characters.join('');
    const start = characters.slice(0, 82).join('');
    const end = characters.slice(-(MAX_CHANGED_TEXT - 83)).join('');
    return `${start}…${end}`;
  }

  function compactInlineChange(beforeValue, afterValue) {
    const before = [...String(beforeValue || '')];
    const after = [...String(afterValue || '')];
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;

    let beforeEnd = before.length;
    let afterEnd = after.length;
    while (beforeEnd > prefix && afterEnd > prefix && before[beforeEnd - 1] === after[afterEnd - 1]) {
      beforeEnd -= 1;
      afterEnd -= 1;
    }

    const contextStart = Math.max(0, prefix - INLINE_CONTEXT);
    const contextEnd = Math.min(before.length, beforeEnd + INLINE_CONTEXT);
    const beforePrefix = before.slice(contextStart, prefix).join('');
    const afterPrefix = after.slice(contextStart, prefix).join('');
    const beforeSuffix = before.slice(beforeEnd, contextEnd).join('');
    const afterSuffix = after.slice(afterEnd, Math.min(after.length, afterEnd + INLINE_CONTEXT)).join('');

    return {
      before: {
        prefix: visibleWhitespace(beforePrefix),
        changed: visibleWhitespace(shortenChanged(before.slice(prefix, beforeEnd).join(''))),
        suffix: visibleWhitespace(beforeSuffix),
        prefixOmitted: contextStart > 0,
        suffixOmitted: contextEnd < before.length
      },
      after: {
        prefix: visibleWhitespace(afterPrefix),
        changed: visibleWhitespace(shortenChanged(after.slice(prefix, afterEnd).join(''))),
        suffix: visibleWhitespace(afterSuffix),
        prefixOmitted: contextStart > 0,
        suffixOmitted: afterEnd + INLINE_CONTEXT < after.length
      }
    };
  }

  function lcsPairs(before, after) {
    const rows = before.length + 1;
    const columns = after.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));
    for (let left = before.length - 1; left >= 0; left -= 1) {
      for (let right = after.length - 1; right >= 0; right -= 1) {
        matrix[left][right] = before[left] === after[right]
          ? matrix[left + 1][right + 1] + 1
          : Math.max(matrix[left + 1][right], matrix[left][right + 1]);
      }
    }
    const pairs = [];
    let left = 0;
    let right = 0;
    while (left < before.length && right < after.length) {
      if (before[left] === after[right]) {
        pairs.push([left, right]);
        left += 1;
        right += 1;
      } else if (matrix[left + 1][right] >= matrix[left][right + 1]) {
        left += 1;
      } else {
        right += 1;
      }
    }
    return pairs;
  }

  function buildHunks(beforeDraft, afterDraft) {
    const before = paragraphs(beforeDraft);
    const after = paragraphs(afterDraft);
    const anchors = [...lcsPairs(before, after), [before.length, after.length]];
    const hunks = [];
    let beforeStart = 0;
    let afterStart = 0;
    for (const [beforeAnchor, afterAnchor] of anchors) {
      if (beforeAnchor > beforeStart || afterAnchor > afterStart) {
        const removed = before.slice(beforeStart, beforeAnchor).join('\n\n');
        const added = after.slice(afterStart, afterAnchor).join('\n\n');
        const compact = compactInlineChange(removed, added);
        hunks.push({
          kind: removed && added ? 'replace' : removed ? 'delete' : 'add',
          before: shorten(removed),
          after: shorten(added),
          beforeSnippet: compact.before,
          afterSnippet: compact.after,
          beforeParagraph: beforeStart + 1,
          afterParagraph: afterStart + 1
        });
      }
      beforeStart = beforeAnchor + 1;
      afterStart = afterAnchor + 1;
    }
    return hunks.slice(0, MAX_HUNKS);
  }

  function compareChapter(current, incoming, options = {}) {
    const countChars = typeof options.countChars === 'function' ? options.countChars : defaultCharCount;
    const beforeTitle = normalizeTitle(current?.title);
    const afterTitle = normalizeTitle(incoming?.title);
    const beforeDraft = normalizeDraft(current?.draft);
    const afterDraft = normalizeDraft(incoming?.draft);
    const titleChanged = beforeTitle !== afterTitle;
    const draftChanged = beforeDraft !== afterDraft;
    const whitespaceOnly = draftChanged
      && beforeDraft.replace(/\s/g, '') === afterDraft.replace(/\s/g, '');
    const beforeChars = countChars(beforeDraft);
    const afterChars = countChars(afterDraft);

    return {
      changed: titleChanged || draftChanged,
      titleChanged,
      draftChanged,
      whitespaceOnly,
      sameCharCount: draftChanged && beforeChars === afterChars,
      beforeTitle,
      afterTitle,
      beforeChars,
      afterChars,
      category: draftChanged ? (whitespaceOnly ? 'formatting' : 'content') : (titleChanged ? 'title' : 'none'),
      hunks: draftChanged ? buildHunks(beforeDraft, afterDraft) : []
    };
  }

  function summaryText(preview) {
    const details = [];
    if (preview.titleChanged) details.push(`標題：${preview.beforeTitle || '未命名'} → ${preview.afterTitle || '未命名'}`);
    if (preview.draftChanged) {
      const counts = `內容 ${preview.beforeChars.toLocaleString()} → ${preview.afterChars.toLocaleString()} 字`;
      details.push(preview.sameCharCount ? `${counts}（字數相同）` : counts);
    }
    return details.join(' · ');
  }

  function renderPreviewHtml(preview) {
    if (!preview?.changed) return '';
    const tags = [];
    if (preview.titleChanged) tags.push('<span class="source-diff-tag title">標題變更</span>');
    if (preview.draftChanged) {
      tags.push(preview.whitespaceOnly
        ? '<span class="source-diff-tag formatting">只有空白／換行</span>'
        : '<span class="source-diff-tag content">正文變更</span>');
    }
    const sameCount = preview.sameCharCount && !preview.whitespaceOnly
      ? '<p class="source-diff-same-count">字數相同，但文字內容不同。</p>'
      : '';
    const title = preview.titleChanged
      ? `<div class="source-diff-title-change"><del>${esc(preview.beforeTitle || '未命名')}</del><span aria-hidden="true">→</span><ins>${esc(preview.afterTitle || '未命名')}</ins></div>`
      : '';
    const renderSnippet = (snippet, tagName) => {
      if (!snippet) return '';
      const changed = snippet.changed
        ? `<${tagName} class="source-diff-change">${esc(snippet.changed)}</${tagName}>`
        : `<${tagName} class="source-diff-change source-diff-empty">（無文字）</${tagName}>`;
      return `${snippet.prefixOmitted ? '<span class="source-diff-ellipsis" aria-hidden="true">…</span>' : ''}`
        + `<span class="source-diff-context">${esc(snippet.prefix)}</span>${changed}`
        + `<span class="source-diff-context">${esc(snippet.suffix)}</span>`
        + `${snippet.suffixOmitted ? '<span class="source-diff-ellipsis" aria-hidden="true">…</span>' : ''}`;
    };
    const hunks = preview.hunks.length
      ? preview.hunks.map((hunk, index) => `
          <section class="source-diff-hunk">
            <span class="source-diff-hunk-label">差異 ${index + 1}</span>
            <div class="source-diff-before"><small>修改前${hunk.before ? ` · 第 ${hunk.beforeParagraph} 段附近` : ''}</small><p>${renderSnippet(hunk.beforeSnippet, 'del')}</p></div>
            <div class="source-diff-after"><small>修改後${hunk.after ? ` · 第 ${hunk.afterParagraph} 段附近` : ''}</small><p>${renderSnippet(hunk.afterSnippet, 'ins')}</p></div>
          </section>`).join('')
      : '';

    return `
      <details class="source-diff-preview">
        <summary>查看變更片段 <span>${tags.join('')}</span></summary>
        <div class="source-diff-preview-body">
          ${sameCount}${title}${hunks}
        </div>
      </details>`;
  }

  window.StoryFlowSourceDiff = Object.freeze({
    normalizeTitle,
    normalizeDraft,
    compareChapter,
    summaryText,
    renderPreviewHtml
  });
})();
