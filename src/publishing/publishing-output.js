// What a publishing item says on each platform: its title, body, afterword, Hashtags, status and
// publication records, plus the clipboard write that carries it out. Pure functions over the
// item and the shared state, with no UI or module state of their own; publishing-flow.js renders
// with them, and app.js and the tests read them through window.StoryFlowPublishingOutput.
(function () {
  // The publishing list is the one place longform parts and visual entries share a
  // surface, so it namespaces visual keys on top of the shared identity.
  function partKey(part) {
    if (isVisualPart(part)) return `visual:${window.StoryFlowProjects?.activeId?.() || state.projectTitle}:${part.id}`;
    return window.StoryFlowShared.partKey(part);
  }

  function isVisualPart(part) {
    const belongsToActiveVisualProject = state?.contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL
      && Array.isArray(state.visualEntries)
      && state.visualEntries.some(entry => entry === part || (entry.id && entry.id === part?.id));
    const isVisualSnapshot = part
      && (part.contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL
        || part.source?.kind === StoryFlowContentModel.CONTENT_MODES.VISUAL
        || (typeof part.body === 'string'
          && Array.isArray(part.images)
          && !Object.prototype.hasOwnProperty.call(part, 'raw')
          && !Object.prototype.hasOwnProperty.call(part, 'formatted')));
    return belongsToActiveVisualProject || isVisualSnapshot;
  }

  function visualContentComplete(part) {
    if (!isVisualPart(part)) return true;
    return Boolean(String(part?.title || '').trim())
      && Boolean(String(part?.body || '').trim() || part?.photoId || part?.images?.length);
  }

  // 【待補】／【待確認】 left in what goes out: the article itself and its afterword. The
  // summary and Hashtags are helpers beside the text, not the text.
  function pendingMarks(part) {
    if (isVisualPart(part)) {
      return window.StoryFlowShared.pendingMarkCount(part?.quote, part?.caption, part?.body, part?.afterword);
    }
    return window.StoryFlowShared.pendingMarkCount(part?.raw || part?.formatted, part?.afterword);
  }

  // Marking a platform published while notes remain is allowed, but asked about once: the
  // marks are the writer's own reminder that something was not finished.
  function confirmPendingBeforePublished(part, platform) {
    const count = pendingMarks(part);
    if (!count) return true;
    return window.confirm(`這篇還有 ${count} 處【待補】／【待確認】。\n\n仍要將「${platform}」標註為已發布嗎？`);
  }

  function notifyIncompleteVisual() {
    notify('這則圖文尚未完成：請保留標題，並加入正文或至少一張圖片。', true);
  }

  function normalizePublishItem(part) {
    if (isVisualPart(part)) {
      part.platformTitles ||= {};
      part.platformHashtags ||= {};
      part.platformSummaries ||= {};
      part.platformStatus ||= {};
      part.publicationRecords ||= {};
      part.images ||= [];
      part.summary = typeof part.summary === 'string' ? part.summary.trim() : '';
      part.hashtags = typeof part.hashtags === 'string' ? part.hashtags.trim() : '';
      part.tags = StoryFlowContentModel.tagsFromHashtags(part.hashtags);
      part.afterword = typeof part.afterword === 'string' ? part.afterword : '';
      if (typeof part.includeAfterword !== 'boolean') part.includeAfterword = true;
      part.platformIncludeAfterword ||= {};
      return part;
    }
    return normalizePublishingPart(part);
  }

  // Whether the afterword goes into a version's text. includeAfterword is the article's shared
  // default (set where the afterword is written, and what StoryFlow 預設 and the Markdown file
  // use); a platform can decide for itself, and a platform that has not decided follows it.
  function includeAfterwordFor(part, platform = '') {
    const own = platform ? part?.platformIncludeAfterword?.[platform] : undefined;
    return typeof own === 'boolean' ? own : part?.includeAfterword !== false;
  }

  // A visual article in reading order (REDESIGN_PROPOSAL C2/C6): quote, the photo, its
  // caption, the body, the afterword. The live preview, Publishing's preview and the copy all
  // read it from here, so what is previewed is what is pasted.
  function visualSections(part, platform = '', includeAfterword = includeAfterwordFor(part, platform)) {
    const format = value => platform ? platformFormat(value, platform) : webFormat(value);
    const quote = String(part?.quote || '').trim();
    const caption = String(part?.caption || '').trim();
    const afterword = String(part?.afterword || '').trim();
    const photo = part?.photoId ? (window.StoryFlowVisualPhotos?.byId?.(part.photoId) || null) : null;
    return {
      quote: quote ? format(quote) : '',
      photo,
      photoMissing: Boolean(part?.photoId && !photo),
      caption,
      body: String(part?.body || '').trim() ? format(part.body) : '',
      afterword: includeAfterword && afterword ? format(afterword) : ''
    };
  }

  function outputSections(part, platform, includeAfterword = includeAfterwordFor(part, platform)) {
    normalizePublishItem(part);
    const format = value => platform ? platformFormat(value, platform) : webFormat(value);
    const afterword = String(part.afterword || '').trim();
    if (isVisualPart(part) && (part.photoId || part.quote || part.caption)) {
      // The photo cannot be pasted as text; its place is marked so the writer knows where to
      // insert it on the platform.
      const sections = visualSections(part, platform, includeAfterword);
      const photoLine = sections.photo ? `〔圖片：${sections.photo.name}〕` : sections.photoMissing ? '〔圖片〕' : '';
      const body = [sections.quote, photoLine, sections.caption, sections.body].filter(Boolean).join('\n\n');
      return { body, afterword: sections.afterword };
    }
    const raw = isVisualPart(part) ? part.body : (part.raw ?? part.formatted ?? '');
    const body = format(raw);
    return { body, afterword: includeAfterword && afterword ? format(afterword) : '' };
  }

  function outputFor(part, platform, includeAfterword = includeAfterwordFor(part, platform)) {
    const sections = outputSections(part, platform, includeAfterword);
    if (!sections.afterword) return sections.body;
    return `${sections.body}\n\n---\n\n後記\n\n${sections.afterword}`;
  }

  function afterwordChars(part) {
    return charCount(part?.afterword || '');
  }

  function platformLabel(platform) {
    return platform || '預設設定';
  }

  function publishTitleFor(part, platform = '') {
    normalizePublishItem(part);
    const platformTitle = platform ? String(part.platformTitles?.[platform] || '').trim() : '';
    if (platformTitle) return platformTitle;
    return (isVisualPart(part) ? '' : String(part.publishTitle || '').trim()) || part.title || '未命名內容';
  }

  function hasPlatformHashtagsOverride(part, platform) {
    return Boolean(platform) && Object.prototype.hasOwnProperty.call(part?.platformHashtags || {}, platform);
  }

  function hashtagsFor(part, platform = '') {
    normalizePublishItem(part);
    if (hasPlatformHashtagsOverride(part, platform)) return String(part.platformHashtags[platform] || '').trim();
    return String(part.hashtags || '').trim();
  }

  // Visual only: a platform may write its own summary; one that has not follows the shared one.
  function hasPlatformSummaryOverride(part, platform) {
    return Boolean(platform) && isVisualPart(part)
      && Boolean(String(part?.platformSummaries?.[platform] || '').trim());
  }

  function summaryFor(part, platform = '') {
    normalizePublishItem(part);
    if (hasPlatformSummaryOverride(part, platform)) return String(part.platformSummaries[platform]).trim();
    return String(part.summary || '').trim();
  }

  // Whether, and how, a platform's copy starts with the title. It is the platform's habit rather
  // than an article's, so it lives with the platform's formatting in settings.json:
  // '' (no title), 'heading' or 'bold'.
  function copyTitleStyleFor(platform = '') {
    const value = platform ? state.formatting?.platforms?.[platform]?.copyTitle : '';
    return value === 'heading' || value === 'bold' ? value : '';
  }

  function setCopyTitleStyle(platform, style) {
    if (!platform) return;
    state.formatting.platforms ||= {};
    const config = state.formatting.platforms[platform] ||= {};
    if (style === 'heading' || style === 'bold') config.copyTitle = style;
    else delete config.copyTitle;
  }

  function outputWithTitle(part, platform, includeAfterword, titleStyle = '') {
    const content = outputFor(part, platform, includeAfterword);
    if (!titleStyle) return content;
    const title = publishTitleFor(part, platform).replace(/\s+/g, ' ').trim();
    const prefix = titleStyle === 'bold'
      ? `**${title.replace(/\*/g, '\\*')}**`
      : `# ${title}`;
    return content ? `${prefix}\n\n${content}` : prefix;
  }

  function richOutputHtml(part, platform, includeAfterword, titleStyle) {
    if (!titleStyle) return '';
    const title = escapeHtml(publishTitleFor(part, platform).replace(/\s+/g, ' ').trim());
    const content = escapeHtml(outputFor(part, platform, includeAfterword));
    const titleHtml = titleStyle === 'bold' ? `<p><strong>${title}</strong></p>` : `<h1>${title}</h1>`;
    const bodyHtml = content
      .split(/\n{2,}/)
      .filter(Boolean)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
    return `${titleHtml}${bodyHtml}`;
  }

  async function writeClipboard(text, html = '') {
    if (html && navigator.clipboard?.write && window.ClipboardItem && window.Blob) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })]);
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  function publicationRecord(part, platform) {
    normalizePublishItem(part);
    part.publicationRecords[platform] ||= { publishedAt: '', url: '' };
    return part.publicationRecords[platform];
  }

  function publicationDateLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function datetimeLocalValue(value = new Date().toISOString()) {
    const date = new Date(value);
    const current = Number.isNaN(date.getTime()) ? new Date() : date;
    const pad = number => String(number).padStart(2, '0');
    return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}T${pad(current.getHours())}:${pad(current.getMinutes())}`;
  }

  function normalizedPublicationUrl(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('網址必須使用 http 或 https。');
    return parsed.href;
  }

  function normalizePartStatus(part) {
    normalizePublishItem(part);
    part.platformStatus ||= {};
    const next = {};
    platforms.forEach(name => { next[name] = Boolean(part.platformStatus[name]); });
    part.platformStatus = next;
    part.published = Object.values(next).some(Boolean);
  }

  function statusFor(part) {
    normalizePartStatus(part);
    const total = platforms.length;
    const published = platforms.filter(name => part.platformStatus[name]).length;
    if (!total || published === 0) return { key: 'pending', label: '待發布', published, total };
    if (published === total) return { key: 'complete', label: '已完成', published, total };
    return { key: 'partial', label: '部分發布', published, total };
  }

  window.StoryFlowPublishingOutput = {
    partKey,
    isVisualPart,
    visualContentComplete,
    notifyIncompleteVisual,
    pendingMarks,
    confirmPendingBeforePublished,
    normalizePublishItem,
    includeAfterwordFor,
    outputSections,
    visualSections,
    outputFor,
    afterwordChars,
    platformLabel,
    publishTitleFor,
    hasPlatformHashtagsOverride,
    hasPlatformSummaryOverride,
    summaryFor,
    copyTitleStyleFor,
    setCopyTitleStyle,
    hashtagsFor,
    outputWithTitle,
    richOutputHtml,
    writeClipboard,
    publicationRecord,
    publicationDateLabel,
    datetimeLocalValue,
    normalizedPublicationUrl,
    normalizePartStatus,
    statusFor,
    // The names the rest of the app has used since this API was first exposed.
    forPart: outputFor,
    withTitle: outputWithTitle,
    richWithTitle: richOutputHtml,
    sectionsFor: outputSections,
    titleFor: publishTitleFor
  };
})();
