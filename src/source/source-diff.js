// Pure source comparison used by both project-source sync implementations.
// Kept independent from application state so it can be regression-tested alone.
(function () {
  const MAX_HUNKS = 5;
  const MAX_SNIPPET = 320;

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

  function shorten(value) {
    const text = String(value || '').replace(/\n/g, ' ↵ ');
    return text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET - 1)}…` : text;
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
        hunks.push({
          kind: removed && added ? 'replace' : removed ? 'delete' : 'add',
          before: shorten(removed),
          after: shorten(added),
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
    const hunks = preview.hunks.length
      ? preview.hunks.map((hunk, index) => `
          <section class="source-diff-hunk">
            <span class="source-diff-hunk-label">差異 ${index + 1}</span>
            <div class="source-diff-before"><small>目前內容${hunk.before ? ` · 第 ${hunk.beforeParagraph} 段附近` : ''}</small>${hunk.before ? `<del>${esc(hunk.before)}</del>` : '<em>此處原本沒有內容</em>'}</div>
            <div class="source-diff-after"><small>來源內容${hunk.after ? ` · 第 ${hunk.afterParagraph} 段附近` : ''}</small>${hunk.after ? `<ins>${esc(hunk.after)}</ins>` : '<em>來源已移除此段</em>'}</div>
          </section>`).join('')
      : '';

    return `
      <details class="source-diff-preview">
        <summary>查看實際差異 <span>${tags.join('')}</span></summary>
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
