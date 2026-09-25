// Dedicated publishing dashboard: compact list, expandable platform details.
(function () {
  const { safeName } = window.StoryFlowShared;

  // Publishing order. Neither option reads a timestamp, because a longform part does not
  // carry one — no createdAt, no updatedAt, no confirmedAt. 章節順序 walks the document
  // forwards; 最新在前 walks it backwards, which for a serial written and split in order
  // puts the most recently confirmed part at the top. The two differ only in direction, and
  // that is the whole feature: publishing a backlog from the beginning was not possible.
  //
  // Visual entries are excluded. They have no chapters to order by, and they do carry
  // updatedAt, so they keep sorting by it.
  const PUBLISH_SORTS = {
    latest: { label: '最新在前', reverse: true },
    chapter: { label: '章節順序', reverse: false }
  };
  const DEFAULT_PUBLISH_SORT = 'latest';

  function publishSortKey() {
    const stored = typeof state !== 'undefined' ? state?.publishSort : null;
    return PUBLISH_SORTS[stored] ? stored : DEFAULT_PUBLISH_SORT;
  }
  function publishSortReversed() {
    return PUBLISH_SORTS[publishSortKey()].reverse;
  }
  let deleteFolderHandle = null;
  let currentFilter = 'all';
  let selectedPartKey = null;
  // Which platform the expanded row's left column is showing. '' is the StoryFlow default
  // output — the rail's first entry, not an absence of one.
  let selectedPlatformKey = '';
  // The copy options belong to the pairing of one part with one platform, not to the panel
  // element: the panel is rebuilt by any renderParts() and would otherwise forget them
  // mid-flow.
  let previewOptions = { includeTitle: false, titleStyle: 'heading' };
  let articleToolContext = null;
  let visualPreviewUrls = [];


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
      && Boolean(String(part?.body || '').trim() || part?.images?.length);
  }

  function notifyIncompleteVisual() {
    notify('這則圖文尚未完成：請保留標題，並加入正文或至少一張圖片。', true);
  }

  function normalizePublishItem(part) {
    if (isVisualPart(part)) {
      part.platformTitles ||= {};
      part.platformHashtags ||= {};
      part.platformStatus ||= {};
      part.publicationRecords ||= {};
      part.images ||= [];
      part.summary = typeof part.summary === 'string' ? part.summary.trim() : '';
      part.hashtags = typeof part.hashtags === 'string' ? part.hashtags.trim() : '';
      part.tags = StoryFlowContentModel.tagsFromHashtags(part.hashtags);
      part.afterword = typeof part.afterword === 'string' ? part.afterword : '';
      if (typeof part.includeAfterword !== 'boolean') part.includeAfterword = true;
      return part;
    }
    return normalizePublishingPart(part);
  }

  function outputSections(part, platform, includeAfterword = part?.includeAfterword !== false) {
    normalizePublishItem(part);
    const raw = isVisualPart(part) ? part.body : (part.raw ?? part.formatted ?? '');
    const format = value => platform ? platformFormat(value, platform) : webFormat(value);
    const body = format(raw);
    const afterword = String(part.afterword || '').trim();
    return { body, afterword: includeAfterword && afterword ? format(afterword) : '' };
  }

  function outputFor(part, platform, includeAfterword = part?.includeAfterword !== false) {
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

  // Workspace data is appended chronologically. The publishing list is intentionally
  // rendered in reverse so the most recently confirmed content is easiest to reach.
  function allEntries() {
    const entries = [];
    if (state.contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL) {
      return [...(state.visualEntries || [])]
        .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0))
        .map((part, partIndex) => {
          normalizePartStatus(part);
          return { contentMode: 'visual', chapter: null, chapterIndex: -1, part, partIndex, status: statusFor(part) };
        });
    }
    const reverse = publishSortReversed();
    const chapterOrder = state.chapters.map((chapter, chapterIndex) => ({ chapter, chapterIndex }));
    if (reverse) chapterOrder.reverse();
    chapterOrder.forEach(({ chapter, chapterIndex }) => {
      const parts = chapter.parts || [];
      const partOrder = parts.map((part, partIndex) => ({ part, partIndex }));
      if (reverse) partOrder.reverse();
      partOrder.forEach(({ part, partIndex }) => {
        normalizePartStatus(part);
        entries.push({ chapter, chapterIndex, part, partIndex, status: statusFor(part) });
      });
    });
    return entries;
  }

  function dashboardCounts(entries = allEntries()) {
    const counts = { total: entries.length, pending: 0, partial: 0, complete: 0 };
    entries.forEach(entry => { counts[entry.status.key] += 1; });
    return counts;
  }

  function ensureViewStructure() {
    const main = document.querySelector('.main');
    const publishingPanel = document.querySelector('.publishing-panel');
    if (!main || !publishingPanel) return null;
    document.getElementById('workspacePublishingSummary')?.remove();

    let workspaceView = document.getElementById('workspaceView');
    if (!workspaceView) {
      workspaceView = document.createElement('section');
      workspaceView.id = 'workspaceView';
      workspaceView.className = 'app-view workspace-view';
      const first = main.firstElementChild;
      main.insertBefore(workspaceView, first || null);
      ['.topbar', '.workspace-grid', '.reading-view'].forEach(selector => {
        const node = main.querySelector(`:scope > ${selector}`);
        if (node) workspaceView.appendChild(node);
      });

    }

    let publishingView = document.getElementById('publishingView');
    if (!publishingView) {
      publishingView = document.createElement('section');
      publishingView.id = 'publishingView';
      publishingView.className = 'app-view publishing-view';
      publishingView.hidden = true;
      publishingView.innerHTML = `
        <header class="publishing-page-head">
          <div>
            <p class="eyebrow">STORYFLOW / PUBLISHING</p>
            <h1>發布</h1>
            <p class="publishing-page-subtitle">快速找到要發布的文章，再展開管理各平台。</p>
          </div>
          <div class="publishing-project-badge">
            <span>目前作品</span>
            <strong id="publishingProjectTitle"></strong>
          </div>
        </header>
        <section class="publishing-stats" aria-label="發布統計">
          <article><span>已確認文章</span><strong id="publishingTotalCount">0</strong></article>
          <article><span>待發布</span><strong id="publishingPendingCount">0</strong></article>
          <article><span>部分發布</span><strong id="publishingPartialCount">0</strong></article>
          <article><span>已完成</span><strong id="publishingCompleteCount">0</strong></article>
        </section>
        <div class="publishing-toolbar">
          <div id="publishingFilters" class="publishing-filters" role="group" aria-label="篩選發布狀態">
            <button class="publishing-filter active" type="button" data-filter="all">全部</button>
            <button class="publishing-filter" type="button" data-filter="pending">待發布</button>
            <button class="publishing-filter" type="button" data-filter="partial">部分發布</button>
            <button class="publishing-filter" type="button" data-filter="complete">已完成</button>
          </div>
          <div class="publishing-toolbar-actions">
            <div id="publishingSortControl" class="publishing-sort" role="group" aria-label="發布順序">
              <span class="publishing-sort-label">排序</span>
              <button class="publishing-sort-option" type="button" data-publish-sort="latest">最新在前</button>
              <button class="publishing-sort-option" type="button" data-publish-sort="chapter">章節順序</button>
            </div>
            <span class="muted publishing-toolbar-hint" hidden>最近編輯的圖文顯示在最上面。</span>
            <button id="continuePublishingBtn" class="button primary publishing-continue-btn" type="button" hidden>繼續發布</button>
          </div>
        </div>`;
      main.appendChild(publishingView);
      publishingView.appendChild(publishingPanel);

      publishingView.querySelector('#publishingFilters').addEventListener('click', event => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        currentFilter = button.dataset.filter || 'all';
        renderParts();
      });

      publishingView.querySelector('#publishingSortControl').addEventListener('click', event => {
        const button = event.target.closest('[data-publish-sort]');
        if (!button) return;
        window.StoryFlowPublishing?.setSort?.(button.dataset.publishSort);
      });
    } else if (publishingPanel.parentElement !== publishingView) {
      publishingView.appendChild(publishingPanel);
    }

    publishingPanel.classList.add('publishing-dashboard-panel');
    const panelTitle = publishingPanel.querySelector('.panel-head h2');
    const panelNote = publishingPanel.querySelector('.panel-head .muted');
    if (panelTitle) panelTitle.textContent = '文章清單';
    if (panelNote) panelNote.textContent = '外層只顯示整體發布狀態；點選文章後再展開各平台細項。';

    return { workspaceView, publishingView, publishingPanel };
  }

  // Preview and copy is a panel inside the row being managed, not a dialog over it. The
  // rail on the right picks which version the panel shows; nothing opens on top of the
  // thing you already opened.
  function buildPublishPreviewPanel() {
    const panel = document.createElement('section');
    panel.className = 'publish-preview-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="publish-preview-panel-head">
        <p class="eyebrow">PREVIEW & COPY</p>
        <h3 id="platformPreviewTitle">預覽與複製</h3>
      </div>
      <div class="platform-preview-body">
        <p id="platformPreviewMeta" class="muted platform-preview-meta" hidden></p>
        <section id="platformPreviewSettings" class="platform-preview-settings" aria-label="發布與複製設定">
          <div class="platform-preview-title-copy" aria-label="發布標題">
          <div>
            <span id="platformPreviewTitleSource">發布標題</span>
            <strong id="platformPreviewPublishTitle"></strong>
          </div>
          <div class="platform-preview-title-actions">
            <button id="copyPlatformTitle" class="button tiny ghost" type="button" aria-label="複製標題">複製</button>
            <button id="editPlatformTitle" class="button tiny ghost" type="button" aria-label="修改此平台標題">編輯</button>
          </div>
          </div>
        <div id="platformPreviewTitleEditor" class="platform-preview-title-editor" hidden>
          <label class="field-label" for="platformPreviewTitleInput">此平台標題</label>
          <div class="platform-preview-title-editor-controls">
            <input id="platformPreviewTitleInput" class="text-input" type="text" maxlength="200" />
            <button id="savePlatformPreviewTitle" class="button primary" type="button">保存標題</button>
            <button id="resetPlatformPreviewTitle" class="button ghost" type="button">改回沿用</button>
          </div>
          <small>只影響目前平台，不修改來源文章名稱或 Markdown 檔名。</small>
        </div>
        <div id="platformPreviewOptions" class="platform-preview-options">
          <span id="platformPreviewOptionsSummary" hidden>使用預設</span>
          <div class="platform-preview-options-body">
            <div class="platform-preview-copy-title-option">
              <label>
                <input id="platformPreviewIncludeTitle" type="checkbox" />
                <span>內容前附上標題</span>
              </label>
              <select id="platformPreviewTitleStyle" class="text-input" disabled aria-label="標題格式">
                <option value="heading">大標題</option>
                <option value="bold">粗體</option>
              </select>
            </div>
            <label id="platformPreviewAfterwordOption" class="platform-preview-afterword-option" hidden>
              <input id="platformPreviewIncludeAfterword" type="checkbox" />
              <span>附上後記</span>
              <small id="platformPreviewAfterwordCount"></small>
            </label>
          </div>
        </div>
        </section>
        <div class="platform-preview-content-head"><strong>內容預覽</strong><span>主要內容</span></div>
        <div id="platformPreviewContent" class="platform-preview-content"></div>
        <section id="platformPreviewVisualExtras" class="platform-preview-visual-extras" aria-label="選填發布資訊" hidden>
          <div class="platform-preview-visual-extras-head">
            <strong>選填發布資訊</strong>
            <span>主要內容與圖片確認後，再依需要複製或調整。</span>
          </div>
          <div id="platformPreviewSummaryBlock" class="platform-preview-extra-block" hidden>
            <div class="platform-preview-extra-row">
              <button id="copyPlatformSummary" class="platform-preview-extra-copy" type="button">
                <span>摘要</span><p id="platformPreviewSummary"></p><small>點一下複製</small>
              </button>
            </div>
          </div>
          <div id="platformPreviewHashtagsBlock" class="platform-preview-extra-block platform-preview-hashtags-block" hidden>
            <div class="platform-preview-extra-row platform-preview-hashtags-row">
              <button id="copyPlatformHashtags" class="platform-preview-extra-copy" type="button">
                <span>Hashtags</span><p id="platformPreviewHashtags"></p><small>點一下複製</small>
              </button>
              <button id="editPlatformPreviewHashtags" class="button tiny ghost" type="button" aria-expanded="false">編輯</button>
            </div>
            <section id="platformPreviewHashtagsEditor" class="platform-preview-extra-editor platform-preview-platform-hashtags" hidden>
              <div class="platform-preview-extra-editor-head platform-preview-platform-hashtags-head">
                <label for="platformPreviewHashtagsInput">此平台 Hashtags</label>
                <span id="platformPreviewHashtagsState"></span>
              </div>
              <input id="platformPreviewHashtagsInput" class="text-input" type="text" maxlength="500" placeholder="#創作 #小說" />
              <div class="platform-preview-extra-editor-actions platform-preview-platform-hashtags-actions">
                <button id="savePlatformPreviewHashtags" class="button tiny primary" type="button">儲存</button>
                <button id="resetPlatformPreviewHashtags" class="button tiny ghost" type="button">沿用共用</button>
              </div>
              <small>未自訂時沿用共用值；儲存空白代表此平台不使用 Hashtags。</small>
            </section>
          </div>
        </section>
      </div>
      <div class="platform-preview-actions">
        <button id="platformPreviewRecordBtn" class="button ghost" type="button" hidden>記錄發布</button>
        <button id="togglePlatformPublished" class="button ghost" type="button">標註已發布</button>
        <span class="platform-preview-actions-spacer"></span>
        <button id="confirmPlatformCopy" class="button primary" type="button">複製內容</button>
      </div>`;
    return panel;
  }


  function rebuildArticleToolDialog() {
    document.getElementById('publishingArticleToolDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'publishingArticleToolDialog';
    dialog.className = 'publishing-article-tool-dialog';
    dialog.innerHTML = `
      <div class="dialog-card publishing-article-tool-card">
        <div class="panel-head">
          <div><p class="eyebrow">ARTICLE TOOL</p><h3 id="publishingArticleToolTitle"></h3></div>
          <button class="icon-button" type="button" data-article-tool-close aria-label="關閉">×</button>
        </div>
        <p id="publishingArticleToolMeta" class="muted publishing-article-tool-meta"></p>
        <div id="publishingArticleToolBody" class="publishing-article-tool-body"></div>
        <div class="publishing-article-tool-actions">
          <button class="button ghost" type="button" data-article-tool-close>完成</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    // 完成 used to close the dialog and nothing else, so an afterword or a summary typed and
    // not yet saved with the button inside the body was dropped without a word — while the
    // label read as "it's done, it's kept". Every way out (完成, ✕, Esc) now saves what is
    // pending first, the way the visual editor autosaves, and stays open only if there was
    // something to save and it could not be kept at all.
    let closing = false;
    const requestClose = async () => {
      if (closing) return;
      closing = true;
      try {
        const tool = dialog.querySelector('#publishingArticleToolBody > *');
        // A read-only phone writes nothing, and closing must not become a way around that.
        const readOnly = Boolean(window.StoryFlowMobileSafeMode?.isReadOnly?.());
        const kept = !readOnly && typeof tool?.flushPending === 'function' ? await tool.flushPending() : true;
        if (kept !== false && dialog.open) dialog.close();
      } finally {
        closing = false;
      }
    };
    dialog.querySelectorAll('[data-article-tool-close]').forEach(button => {
      button.addEventListener('click', requestClose);
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      requestClose();
    });
    dialog.addEventListener('close', () => { articleToolContext = null; });
    return dialog;
  }

  const articleToolDialog = rebuildArticleToolDialog();

  function rebuildPublicationRecordDialog() {
    document.getElementById('publicationRecordDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'publicationRecordDialog';
    dialog.className = 'publication-record-dialog';
    dialog.innerHTML = `
      <form class="dialog-card publication-record-card" method="dialog">
        <div class="panel-head">
          <div><p class="eyebrow">PUBLICATION RECORD</p><h3 id="publicationRecordTitle">發布紀錄</h3></div>
          <button id="closePublicationRecord" class="icon-button" type="button" aria-label="關閉">×</button>
        </div>
        <p id="publicationRecordMeta" class="muted publication-record-meta"></p>
        <label class="field-label" for="publicationRecordDate">發布時間</label>
        <input id="publicationRecordDate" class="text-input" type="datetime-local" required />
        <label class="field-label" for="publicationRecordUrl">文章網址（選填）</label>
        <input id="publicationRecordUrl" class="text-input" type="url" inputmode="url" autocomplete="url" placeholder="https://…" />
        <p id="publicationRecordError" class="publication-record-error" role="alert" hidden></p>
        <div class="publication-record-actions">
          <a id="openPublicationRecordUrl" class="button ghost" target="_blank" rel="noopener noreferrer" hidden>開啟文章</a>
          <span class="publication-record-actions-spacer"></span>
          <button id="cancelPublicationRecord" class="button ghost" type="button">取消</button>
          <button id="savePublicationRecord" class="button primary" type="button">保存發布紀錄</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#closePublicationRecord').onclick = () => dialog.close();
    dialog.querySelector('#cancelPublicationRecord').onclick = () => dialog.close();
    return dialog;
  }

  const publicationDialog = rebuildPublicationRecordDialog();

  function setPlatformPublished(part, platform, nextValue) {
    if (!platform) return;
    normalizePartStatus(part);
    const next = Boolean(nextValue);
    const record = publicationRecord(part, platform);
    part.platformStatus[platform] = next;
    if (next && !record.publishedAt) record.publishedAt = new Date().toISOString();
    if (!next) {
      record.publishedAt = '';
      record.url = '';
    }
    part.published = Object.values(part.platformStatus).some(Boolean);
    saveState('發布狀態已更新');
  }

  async function persistPublicationChange(part, message) {
    const entry = allEntries().find(item => item.part === part);
    if (!entry) return false;
    try {
      const updated = entry.contentMode === 'visual'
        ? await writeVisualEntry(part)
        : await writeArticleMarkdown(entry.chapter, part);
      if (updated && message) notify(message);
      else if (!updated) notify('發布紀錄目前只保留在畫面；請重新連接資料夾後再操作一次。', true);
      return updated;
    } catch (error) {
      notify(`發布紀錄已更新，但 metadata.json 尚未寫入：${error.message}`, true);
      return false;
    }
  }

  async function togglePlatformPublished(part, platform) {
    if (!platform) return false;
    normalizePartStatus(part);
    const next = !part.platformStatus[platform];
    if (next && !visualContentComplete(part)) {
      notifyIncompleteVisual();
      return false;
    }
    const record = publicationRecord(part, platform);
    if (!next && (record.publishedAt || record.url)) {
      const confirmed = window.confirm(`取消「${platform}」的已發布標記？\n\n這會一併清除已記錄的發布時間與文章網址。`);
      if (!confirmed) return false;
    }
    setPlatformPublished(part, platform, next);
    renderParts();
    await persistPublicationChange(part, `${platform} 已${next ? '標註已發布並記錄時間' : '取消已發布標記'}`);
    return true;
  }

  function renderPublishPreview(panel, part, platform, contentMode = '') {
    const visual = contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL || isVisualPart(part);
    const platformSpecific = Boolean(platform);
    normalizePartStatus(part);
    const entry = allEntries().find(item => item.part === part);
    const toggle = panel.querySelector('#togglePlatformPublished');
    const settings = panel.querySelector('#platformPreviewSettings');
    const afterwordOption = panel.querySelector('#platformPreviewAfterwordOption');
    const includeAfterword = panel.querySelector('#platformPreviewIncludeAfterword');
    const includeTitle = panel.querySelector('#platformPreviewIncludeTitle');
    const titleStyle = panel.querySelector('#platformPreviewTitleStyle');
    const titleEditor = panel.querySelector('#platformPreviewTitleEditor');
    const titleInput = panel.querySelector('#platformPreviewTitleInput');
    const options = panel.querySelector('#platformPreviewOptions');
    const optionsSummary = panel.querySelector('#platformPreviewOptionsSummary');
    const editTitle = panel.querySelector('#editPlatformTitle');
    const summaryBlock = panel.querySelector('#platformPreviewSummaryBlock');
    const hashtagsBlock = panel.querySelector('#platformPreviewHashtagsBlock');
    const hashtagsEditor = panel.querySelector('#platformPreviewHashtagsEditor');
    const hashtagsInput = panel.querySelector('#platformPreviewHashtagsInput');
    const hashtagsState = panel.querySelector('#platformPreviewHashtagsState');
    const editHashtags = panel.querySelector('#editPlatformPreviewHashtags');
    const resetHashtags = panel.querySelector('#resetPlatformPreviewHashtags');
    const visualExtras = panel.querySelector('#platformPreviewVisualExtras');
    const summaryCard = panel.querySelector('#copyPlatformSummary');
    const hashtagsCard = panel.querySelector('#copyPlatformHashtags');
    let summaryText = String(part.summary || '').trim();
    let hashtagsText = hashtagsFor(part, platform);
    const afterwordCount = afterwordChars(part);
    const isPublished = platform ? Boolean(part.platformStatus[platform]) : false;

    const refreshContent = () => {
      const container = panel.querySelector('#platformPreviewContent');
      const sections = outputSections(part, platform, includeAfterword.checked);
      if (visual) {
        renderVisualPublishPreview(container, part, outputFor(part, platform, includeAfterword.checked), includeTitle.checked ? titleStyle.value : '', platform);
      } else if (window.StoryFlowArticleImages?.renderPreview) {
        window.StoryFlowArticleImages.renderPreview(container, part, sections, {
          projectTitle: state.projectTitle,
          chapterTitle: allEntries().find(entry => entry.part === part)?.chapter?.title || ''
        });
      } else {
        container.textContent = outputFor(part, platform, includeAfterword.checked);
      }
      if (includeTitle.checked && !visual) {
        if (container.dataset.sfPreviewManaged === 'article-images') {
          const titleNode = document.createElement(titleStyle.value === 'bold' ? 'strong' : 'h1');
          titleNode.className = `platform-preview-included-title ${titleStyle.value}`;
          titleNode.textContent = publishTitleFor(part, platform);
          container.prepend(titleNode);
        } else {
          container.textContent = outputWithTitle(part, platform, includeAfterword.checked, titleStyle.value);
        }
      }
      window.StoryFlowPreviewMode?.refresh?.();
    };

    const refreshTitle = () => {
      const currentTitle = publishTitleFor(part, platform);
      const platformOverride = platform && String(part.platformTitles?.[platform] || '').trim();
      const legacyOverride = String(part.publishTitle || '').trim();
      panel.querySelector('#platformPreviewTitle').textContent = platformSpecific
        ? `預覽與複製 · ${platformLabel(platform)}`
        : '預覽';
      panel.querySelector('#platformPreviewPublishTitle').textContent = currentTitle;
      panel.querySelector('#platformPreviewTitleSource').textContent = platformOverride
        ? '發布標題 · 此平台自訂'
        : legacyOverride ? '發布標題 · 沿用既有共用標題' : `發布標題 · 沿用${visual ? '圖文' : '文章'}名稱`;
      titleInput.value = platformOverride || '';
      refreshContent();
    };

    const previewMeta = panel.querySelector('#platformPreviewMeta');
    previewMeta.textContent = platform
      ? `${platform} · ${visual ? '文字與圖片順序' : '貼文內容'}`
      : '預設輸出預覽 · 不會變更發布狀態';
    if (publishTitleFor(part, platform) !== part.title) {
      previewMeta.textContent += ` · 內部名稱：${part.title}`;
    }
    previewMeta.hidden = true;
    settings.hidden = !platformSpecific;
    settings.classList.toggle('hidden', !platformSpecific);
    editTitle.hidden = !platformSpecific;
    titleEditor.hidden = true;
    hashtagsEditor.hidden = true;
    editHashtags.hidden = !platformSpecific;
    editHashtags.setAttribute('aria-expanded', 'false');
    editHashtags.textContent = '編輯';
    summaryBlock.hidden = !platformSpecific;
    summaryBlock.classList.toggle('hidden', !platformSpecific);
    visualExtras.hidden = !platformSpecific;
    visualExtras.classList.toggle('hidden', !platformSpecific);

    const setExtraEditorExpanded = (button, editor, expanded, input) => {
      editor.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? '收合' : '編輯';
      if (expanded) {
        input.focus();
        editor.scrollIntoView({ block: 'nearest' });
      }
    };

    const refreshSummaryView = () => {
      summaryText = String(part.summary || '').trim();
      summaryCard.disabled = !summaryText;
      panel.querySelector('#platformPreviewSummary').textContent = summaryText || '尚未設定';
      // Each content type writes its summary in one place: a visual entry in its editor, a
      // longform article in 摘要與 Hashtags. Pointing an article at the visual editor sent the
      // writer somewhere its summary cannot be written.
      summaryCard.querySelector('small').textContent = summaryText
        ? '點一下複製'
        : (visual ? '在圖文編輯器設定' : '在「摘要與 Hashtags」設定');
      summaryCard.onclick = async () => {
        if (!summaryText) return;
        try {
          await writeClipboard(summaryText);
          notify('已複製摘要');
        } catch (error) {
          notify(`複製摘要失敗：${error.message}`, true);
        }
      };
    };
    refreshSummaryView();
    const refreshHashtagsView = () => {
      hashtagsText = hashtagsFor(part, platform);
      const overridden = hasPlatformHashtagsOverride(part, platform);
      hashtagsBlock.hidden = !platformSpecific;
      hashtagsBlock.classList.toggle('hidden', !platformSpecific);
      hashtagsCard.disabled = !hashtagsText;
      visualExtras.hidden = !platformSpecific;
      visualExtras.classList.toggle('hidden', !platformSpecific);
      panel.querySelector('#platformPreviewHashtags').textContent = hashtagsText || '尚未設定';
      // Empty, the value already reads 尚未設定 and 編輯 sits beside it; a hint repeating it adds nothing.
      hashtagsCard.querySelector('small').textContent = hashtagsText ? '點一下複製' : '';
      hashtagsInput.value = hashtagsText;
      hashtagsState.textContent = overridden
        ? (hashtagsText ? '此平台自訂' : '此平台不使用')
        : '沿用共用';
      resetHashtags.disabled = !overridden;
      panel.querySelector('#copyPlatformHashtags').onclick = async () => {
        if (!hashtagsText) return;
        try {
          await writeClipboard(hashtagsText);
          notify('已複製 Hashtags');
        } catch (error) {
          notify(`複製 Hashtags 失敗：${error.message}`, true);
        }
      };
    };
    refreshHashtagsView();
    includeTitle.checked = Boolean(previewOptions.includeTitle);
    titleStyle.value = previewOptions.titleStyle || 'heading';
    titleStyle.disabled = !includeTitle.checked;
    const refreshOptionsSummary = () => {
      const labels = [];
      if (includeTitle.checked) labels.push(titleStyle.value === 'bold' ? '含粗體標題' : '含大標題');
      if (!afterwordOption.hidden && includeAfterword.checked) labels.push('含後記');
      optionsSummary.textContent = labels.length ? labels.join(' · ') : '使用預設';
    };
    editTitle.onclick = () => {
      titleEditor.hidden = !titleEditor.hidden;
      if (!titleEditor.hidden) titleInput.focus();
    };
    editHashtags.onclick = () => {
      if (!platformSpecific) return;
      setExtraEditorExpanded(editHashtags, hashtagsEditor, hashtagsEditor.hidden, hashtagsInput);
    };
    panel.querySelector('#savePlatformPreviewTitle').onclick = async () => {
      if (!entry || !platform) return;
      await savePlatformTitle(entry.chapter, part, platform, titleInput);
      titleEditor.hidden = true;
      refreshTitle();
    };
    panel.querySelector('#resetPlatformPreviewTitle').onclick = async () => {
      if (!entry || !platform) return;
      titleInput.value = '';
      await savePlatformTitle(entry.chapter, part, platform, titleInput);
      titleEditor.hidden = true;
      refreshTitle();
    };
    panel.querySelector('#savePlatformPreviewHashtags').onclick = async () => {
      if (!entry || !platformSpecific) return;
      await savePlatformHashtags(entry.chapter, entry.part, platform, hashtagsInput);
      refreshHashtagsView();
      refreshOptionsSummary();
      setExtraEditorExpanded(editHashtags, hashtagsEditor, false, hashtagsInput);
    };
    resetHashtags.onclick = async () => {
      if (!entry || !platformSpecific) return;
      await savePlatformHashtags(entry.chapter, entry.part, platform, hashtagsInput, true);
      refreshHashtagsView();
      refreshOptionsSummary();
      setExtraEditorExpanded(editHashtags, hashtagsEditor, false, hashtagsInput);
    };
    panel.querySelector('#copyPlatformTitle').onclick = async () => {
      try {
        await writeClipboard(publishTitleFor(part, platform));
        notify('已複製發布標題');
      } catch (error) {
        notify(`複製標題失敗：${error.message}`, true);
      }
    };
    includeTitle.onchange = () => {
      previewOptions.includeTitle = includeTitle.checked;
      titleStyle.disabled = !includeTitle.checked;
      refreshOptionsSummary();
      refreshContent();
    };
    titleStyle.onchange = () => {
      previewOptions.titleStyle = titleStyle.value;
      refreshOptionsSummary();
      refreshContent();
    };
    afterwordOption.hidden = !platformSpecific || afterwordCount === 0;
    includeAfterword.checked = part.includeAfterword !== false;
    panel.querySelector('#platformPreviewAfterwordCount').textContent = `${afterwordCount.toLocaleString()} 字`;
    includeAfterword.onchange = async () => {
      if (!platformSpecific) return;
      part.includeAfterword = includeAfterword.checked;
      refreshOptionsSummary();
      saveState('後記輸出設定已更新');
      refreshContent();
      const entry = allEntries().find(item => item.part === part);
      if (!entry) return;
      try {
        const updated = visual ? await writeVisualEntry(part) : await writeArticleMarkdown(entry.chapter, part);
        if (updated) notify('後記輸出設定已更新');
        else notify('輸出設定目前只保留在畫面；請重新連接資料夾後再調整一次。', true);
      } catch (error) {
        notify(`輸出設定已更新，但文章 Markdown 尚未寫入：${error.message}`, true);
      }
    };
    refreshOptionsSummary();
    refreshTitle();
    const blockedByIncompleteVisual = Boolean(platform && visual && !isPublished && !visualContentComplete(part));
    const recordButton = panel.querySelector('#platformPreviewRecordBtn');
    recordButton.hidden = !platform;
    recordButton.textContent = isPublished ? '發布紀錄' : '記錄發布';
    recordButton.setAttribute('aria-label', `${isPublished ? '查看' : '記錄'}「${platform}」發布紀錄`);
    recordButton.disabled = blockedByIncompleteVisual;
    recordButton.title = blockedByIncompleteVisual ? '請先完成圖文內容' : '';
    recordButton.onclick = () => {
      if (!entry || !platform) return;
      openPublicationRecord(entry.chapter, part, platform);
    };
    toggle.hidden = !platform;
    toggle.textContent = isPublished ? '取消已發布標記' : '標註已發布';
    // The button's text is about the selected version; its accessible name has to say
    // which one, because nothing in the sentence "取消已發布標記" names a platform.
    toggle.setAttribute('aria-label', `${isPublished ? '取消' : '標註'}「${platform}」已發布`);
    toggle.classList.toggle('is-published', isPublished);
    toggle.disabled = blockedByIncompleteVisual;
    toggle.title = toggle.disabled ? '請先完成圖文標題，並加入正文或至少一張圖片' : '';

    panel.querySelector('#confirmPlatformCopy').onclick = async () => {
      try {
        const selectedTitleStyle = includeTitle.checked ? titleStyle.value : '';
        await writeClipboard(
          outputWithTitle(part, platform, includeAfterword.checked, selectedTitleStyle),
          richOutputHtml(part, platform, includeAfterword.checked, selectedTitleStyle)
        );
        notify(visual
          ? `已複製 ${platformLabel(platform)} 文字；圖片請依下方順序手動上傳`
          : `已複製 ${platformLabel(platform)} 內容`);
      } catch (error) {
        notify(`複製失敗：${error.message}`, true);
        return;
      }
      if (platform && !part.platformStatus?.[platform] && (!visual || visualContentComplete(part))) {
        const markPublished = window.confirm(`已複製「${platform}」版本。\n\n要將這個平台標註為已發布嗎？`);
        if (markPublished) {
          setPlatformPublished(part, platform, true);
          renderParts();
          await persistPublicationChange(part, `${platform} 已標註為已發布並記錄時間`);
        }
      }
    };

    toggle.onclick = () => {
      if (!platform) return;
      togglePlatformPublished(part, platform);
    };

    window.StoryFlowPreviewMode?.refresh?.();
    return panel;
  }

  // Selecting a part and a platform is the whole of "preview": the expanded row's left
  // column renders whichever pairing is selected, so callers say what to show rather than
  // what to open.
  function previewPublish(part, platform = '', contentMode = '') {
    const entry = allEntries().find(item => item.part === part);
    if (!entry) return null;
    const key = partKey(entry.part);
    const nextPlatform = platform || '';
    if (selectedPartKey !== key || selectedPlatformKey !== nextPlatform) {
      previewOptions = { includeTitle: false, titleStyle: 'heading' };
      selectedPartKey = key;
      selectedPlatformKey = nextPlatform;
      renderParts();
    }
    const card = els.partsList?.querySelector(`[data-part-key="${CSS.escape(key)}"]`);
    return card?.querySelector('.publish-preview-panel') || null;
  }

  async function writeArticleMarkdown(chapter, part) {
    const folder = await StoryFlowIntegrations.restoreOutputDirectory();
    if (!folder?.connected) return false;
    const sections = outputSections(part, '', part.includeAfterword !== false);
    const formatted = window.StoryFlowArticleImages?.markdownForPart
      ? window.StoryFlowArticleImages.markdownForPart(part, sections)
      : outputFor(part, '');
    await StoryFlowIntegrations.savePart({
      projectTitle: state.projectTitle,
      chapter,
      part: { ...part, formatted },
      metadata: chapterMetadata(chapter)
    });
    return true;
  }

  async function writeVisualEntry(entry) {
    const folder = await StoryFlowIntegrations.restoreOutputDirectory();
    if (!folder?.connected) return false;
    entry.updatedAt = new Date().toISOString();
    await StoryFlowIntegrations.saveVisualEntry({ projectTitle: state.projectTitle, entry });
    saveState('圖文發布資料已更新');
    return true;
  }

  // A visual entry's copy is plain text rather than the Markdown preview a longform part
  // gets, so its scene marker used to sit at the left margin while the same marker in an
  // article above it was centred. Marker lines are centred here the way the Markdown preview
  // centres them; every other line stays exactly the text that will be copied.
  function visualCopyHTML(body) {
    const marker = String(state?.sceneMarker || '').trim();
    return String(body || '').split('\n').map(line => {
      const value = line.trim();
      const isMarker = value && ((marker && value === marker) || /^[＊*]{3,}$/.test(value));
      return isMarker ? `<span class="visual-publish-scene">${escapeHtml(value)}</span>` : escapeHtml(line);
    }).join('<br>');
  }

  function renderVisualPublishPreview(container, entry, body, titleStyle, platform) {
    visualPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    visualPreviewUrls = [];
    const title = titleStyle ? publishTitleFor(entry, platform) : '';
    container.dataset.sfPreviewManaged = 'visual';
    container.innerHTML = `
      ${title ? `<${titleStyle === 'bold' ? 'strong' : 'h1'} class="platform-preview-included-title ${titleStyle}">${escapeHtml(title)}</${titleStyle === 'bold' ? 'strong' : 'h1'}>` : ''}
      <div class="visual-publish-copy">${visualCopyHTML(body)}</div>
      <section class="visual-upload-order">
        <div><strong>圖片上傳順序</strong><span>圖片不會被複製或自動上傳，請依序手動選取。</span></div>
        <ol>${entry.images.length ? entry.images.map(image => `<li data-visual-publish-image="${escapeHtml(image.id)}"><div class="visual-upload-thumb"><span>載入中</span></div><div><strong>${escapeHtml(image.storedName)}</strong>${entry.coverImageId === image.id ? '<em>封面</em>' : ''}<small>${escapeHtml(image.alt || '尚未填寫替代文字')}${image.caption ? ` · ${escapeHtml(image.caption)}` : ''}</small></div></li>`).join('') : '<li class="visual-upload-empty">這則圖文沒有圖片。</li>'}</ol>
      </section>`;
    entry.images.forEach(async image => {
      const item = container.querySelector(`[data-visual-publish-image="${CSS.escape(image.id)}"]`);
      try {
        const file = await StoryFlowIntegrations.getVisualImageFile({ projectTitle: state.projectTitle, entryId: entry.id, storedName: image.storedName });
        const url = URL.createObjectURL(file);
        visualPreviewUrls.push(url);
        if (item?.isConnected) item.querySelector('.visual-upload-thumb').innerHTML = `<img src="${url}" alt="${escapeHtml(image.alt || '')}" />`;
      } catch (_) {
        if (item?.isConnected) item.querySelector('.visual-upload-thumb').innerHTML = '<span class="missing">找不到圖片檔</span>';
      }
    });
  }

  function openPublicationRecord(chapter, part, platform) {
    if (!part.platformStatus?.[platform] && !visualContentComplete(part)) {
      notifyIncompleteVisual();
      return;
    }
    const record = publicationRecord(part, platform);
    const dateInput = publicationDialog.querySelector('#publicationRecordDate');
    const urlInput = publicationDialog.querySelector('#publicationRecordUrl');
    const error = publicationDialog.querySelector('#publicationRecordError');
    const openLink = publicationDialog.querySelector('#openPublicationRecordUrl');
    let safeExistingUrl = '';
    try { safeExistingUrl = normalizedPublicationUrl(record.url); } catch (_) {}

    publicationDialog.querySelector('#publicationRecordTitle').textContent = `${part.title} · ${platform}`;
    publicationDialog.querySelector('#publicationRecordMeta').textContent = '保存後會同步標註為已發布；網址可留白，之後再補。';
    dateInput.value = datetimeLocalValue(record.publishedAt || new Date().toISOString());
    urlInput.value = record.url || '';
    error.hidden = true;
    error.textContent = '';
    openLink.hidden = !safeExistingUrl;
    if (safeExistingUrl) openLink.href = safeExistingUrl;
    else openLink.removeAttribute('href');

    publicationDialog.querySelector('#savePublicationRecord').onclick = async () => {
      if (!dateInput.value) {
        error.textContent = '請選擇發布時間。';
        error.hidden = false;
        dateInput.focus();
        return;
      }

      let url = '';
      try {
        url = normalizedPublicationUrl(urlInput.value);
      } catch (validationError) {
        error.textContent = validationError.message;
        error.hidden = false;
        urlInput.focus();
        return;
      }

      const publishedAt = new Date(dateInput.value);
      if (Number.isNaN(publishedAt.getTime())) {
        error.textContent = '發布時間格式不正確。';
        error.hidden = false;
        dateInput.focus();
        return;
      }

      part.publicationRecords[platform] = { publishedAt: publishedAt.toISOString(), url };
      part.platformStatus ||= {};
      part.platformStatus[platform] = true;
      part.published = Object.values(part.platformStatus).some(Boolean);
      saveState('發布紀錄已更新');
      publicationDialog.close();
      renderParts();
      await persistPublicationChange(part, `${platform} 的發布紀錄已保存`);
    };

    publicationDialog.showModal();
    window.setTimeout(() => dateInput.focus(), 0);
  }

  async function saveAfterword(chapter, part, textarea, includeControl) {
    const nextAfterword = textarea.value.trim();
    part.afterword = nextAfterword;
    part.includeAfterword = nextAfterword ? includeControl.checked : true;
    part.updatedAt = new Date().toISOString();
    saveState('後記已更新');
    renderParts();

    try {
      const updated = isVisualPart(part) ? await writeVisualEntry(part) : await writeArticleMarkdown(chapter, part);
      if (!updated) {
        notify('後記目前只保留在工作區；請重新連接資料夾後再按一次「保存後記」。', true);
        return false;
      }
      notify(nextAfterword ? '後記已保存' : '後記已移除');
      return true;
    } catch (error) {
      notify(`後記已更新，但檔案尚未寫入：${error.message}`, true);
      return false;
    }
  }

  async function savePlatformTitle(chapter, part, platform, input) {
    const nextTitle = input.value.trim();
    normalizePublishItem(part);
    if (nextTitle) part.platformTitles[platform] = nextTitle;
    else delete part.platformTitles[platform];
    saveState('平台標題已更新');
    renderParts();

    try {
      const updated = isVisualPart(part) ? await writeVisualEntry(part) : await writeArticleMarkdown(chapter, part);
      if (!updated) {
        notify('平台標題目前只保留在畫面；請重新連接資料夾後再保存一次。', true);
        return false;
      }
      notify(nextTitle ? `${platform} 的標題已保存` : `${platform} 已改回沿用文章名稱`);
      return true;
    } catch (error) {
      notify(`平台標題已更新，但 metadata.json 尚未寫入：${error.message}`, true);
      return false;
    }
  }

  async function savePlatformHashtags(chapter, part, platform, input, reset = false) {
    normalizePublishItem(part);
    if (reset) delete part.platformHashtags[platform];
    else part.platformHashtags[platform] = input.value.trim();
    part.updatedAt = new Date().toISOString();
    saveState('平台 Hashtags 已更新');
    renderParts();

    try {
      const updated = isVisualPart(part) ? await writeVisualEntry(part) : await writeArticleMarkdown(chapter, part);
      if (!updated) {
        notify('平台 Hashtags 目前只保留在工作區；請重新連接資料夾後再保存一次。', true);
        return false;
      }
      notify(reset ? `${platform} 已改回沿用共用 Hashtags` : `${platform} 的 Hashtags 已保存`);
      return true;
    } catch (error) {
      notify(`平台 Hashtags 已更新，但檔案尚未寫入：${error.message}`, true);
      return false;
    }
  }

  function createAfterwordEditor(chapter, part, { onSaved } = {}) {
    normalizePublishItem(part);
    const section = document.createElement('section');
    section.className = 'publish-afterword-editor';
    section.innerHTML = `
      <div class="publish-afterword-head">
        <label class="publish-afterword-include">
          <input type="checkbox" ${part.includeAfterword !== false ? 'checked' : ''} ${part.afterword.trim() ? '' : 'disabled'} />
          <span>分平台預覽與複製時附上</span>
        </label>
      </div>
      <textarea class="publish-afterword-input" rows="5" aria-label="內容後記" placeholder="寫下完稿後想補充給讀者的話。"></textarea>
      <div class="publish-afterword-footer">
        <span class="muted publish-afterword-count">後記 ${afterwordChars(part).toLocaleString()} 字</span>
        <button class="button tiny primary publish-afterword-save" type="button">保存後記</button>
      </div>`;

    const textarea = section.querySelector('.publish-afterword-input');
    const includeControl = section.querySelector('.publish-afterword-include input');
    const count = section.querySelector('.publish-afterword-count');
    textarea.value = part.afterword;
    textarea.addEventListener('input', () => {
      const chars = charCount(textarea.value);
      count.textContent = `後記 ${chars.toLocaleString()} 字`;
      includeControl.disabled = chars === 0;
      if (chars > 0 && !part.afterword.trim()) includeControl.checked = true;
    });
    section.querySelector('.publish-afterword-save').addEventListener('click', async event => {
      event.stopPropagation();
      const saved = await saveAfterword(chapter, part, textarea, includeControl);
      onSaved?.(saved);
    });
    // Closing the tool keeps what was typed. saveAfterword writes the workspace before the
    // Markdown file, so the text is kept even when the file write fails (it says so).
    section.flushPending = async () => {
      const next = textarea.value.trim();
      const include = next ? includeControl.checked : true;
      if (next === (part.afterword || '').trim() && include === (part.includeAfterword !== false)) return true;
      await saveAfterword(chapter, part, textarea, includeControl);
      return true;
    };
    section.addEventListener('click', event => event.stopPropagation());
    return section;
  }

  // The line under the dialog title is rebuilt with the body, so the image count follows
  // imports and removals rather than staying at whatever it was when the dialog opened.
  function syncArticleToolMeta(part, tool) {
    const meta = articleToolDialog.querySelector('#publishingArticleToolMeta');
    if (!meta) return;
    meta.textContent = tool === 'publishing-helpers'
      ? `${publishTitleFor(part)} · 兩者皆為選填，不會自動加入正文。`
      : `${publishTitleFor(part)} · ${tool === 'images'
        ? `${part.images.length.toLocaleString()} 張圖片，檔案保存在私人 StoryFlow 資料夾。`
        : '與來源正文分開保存，不計入正文篇幅。'}`;
  }

  function renderArticleToolBody() {
    if (!articleToolContext) return;
    const { chapter, part, tool } = articleToolContext;
    syncArticleToolMeta(part, tool);
    const body = articleToolDialog.querySelector('#publishingArticleToolBody');
    body.replaceChildren();
    if (tool === 'publishing-helpers') {
      body.appendChild(createPublishingHelpers(chapter, part, {
        onSaved: () => articleToolDialog.close()
      }));
      return;
    }
    if (tool === 'images') {
      const manager = window.StoryFlowArticleImages?.createManager?.(chapter, part, {
        onChange: () => {
          if (articleToolDialog.open && articleToolContext?.part === part && articleToolContext?.tool === 'images') {
            renderArticleToolBody();
          }
        }
      });
      if (manager) body.appendChild(manager);
      else body.textContent = '圖片工具尚未載入，請重新整理後再試。';
      return;
    }
    body.appendChild(createAfterwordEditor(chapter, part, {
      onSaved: saved => { if (saved) articleToolDialog.close(); }
    }));
  }

  function openArticleTool(chapter, part, tool) {
    articleToolContext = { chapter, part, tool };
    const isImages = tool === 'images';
    const isPublishingHelpers = tool === 'publishing-helpers';
    articleToolDialog.querySelector('#publishingArticleToolTitle').textContent = isPublishingHelpers ? '摘要與 Hashtags' : isImages ? '文章圖片' : '後記';
    renderArticleToolBody();
    articleToolDialog.showModal();
  }

  async function getDeleteFolder() {
    if (deleteFolderHandle) return deleteFolderHandle;
    if (!('showDirectoryPicker' in window)) throw new Error('此瀏覽器無法直接刪除 Markdown 檔案。');
    deleteFolderHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'storyflow-publishing-delete' });
    return deleteFolderHandle;
  }

  async function openExistingDirectory(parent, name) {
    return parent.getDirectoryHandle(safeName(name), { create: false });
  }

  async function deletePartFiles(chapter, parts) {
    const root = await getDeleteFolder();
    const works = await openExistingDirectory(root, 'Works');
    const work = await openExistingDirectory(works, state.projectTitle);
    const chapterDir = await openExistingDirectory(work, chapter.title);
    for (const part of parts) {
      // Images go with the article, backed up to Recovery/Assets first. Kept in step with
      // the same loop in publishing-delete.js, which is a second copy of this function.
      await StoryFlowIntegrations.removePartAssets?.({
        projectTitle: state.projectTitle, chapterTitle: chapter.title, partId: part.id, images: part.images
      });
      try { await chapterDir.removeEntry(safeName(`${part.title}.md`)); }
      catch (error) { if (error?.name !== 'NotFoundError') throw error; }
    }
    const metadataHandle = await chapterDir.getFileHandle('metadata.json', { create: true });
    const writable = await metadataHandle.createWritable();
    await writable.write(JSON.stringify(chapterMetadata(chapter), null, 2));
    await writable.close();
  }

  async function deleteConfirmedPart(chapter, index) {
    const part = chapter.parts[index];
    if (!part) return;
    const affected = chapter.parts.slice(index);
    const laterCount = affected.length - 1;
    const protectedAfterwords = affected.filter(item => String(item.afterword || '').trim()).length;
    const afterwordWarning = protectedAfterwords
      ? `\n\n其中 ${protectedAfterwords} 篇有後記，後記也會一併刪除。`
      : '';
    const protectedImages = affected.reduce((total, item) => total + (item.images?.length || 0), 0);
    const imageWarning = protectedImages
      ? `\n\n這些文章共附有 ${protectedImages} 張圖片，會一併移除；檔案先備份到 Recovery/Assets，保留 30 天。`
      : '';
    const message = `${laterCount
      ? `刪除「${part.title}」會使後續切點失去連續性。\n\n因此會一起移除這篇之後的 ${laterCount} 篇，並退回到「${part.title}」開始的位置重新切篇。`
      : `刪除「${part.title}」？\n\n會移除 Markdown，並把切篇進度退回，讓你重新處理這一段。`}${afterwordWarning}${imageWarning}\n\n確定繼續？`;
    if (!confirm(message)) return;

    try {
      chapter.parts.splice(index);
      chapter.confirmedBlockCount = chapter.parts.length ? chapter.parts[chapter.parts.length - 1].endBlock : 0;
      selectedPartKey = null;
      await deletePartFiles(chapter, affected);
      state.activeChapterId = chapter.id;
      suggestion = null;
      saveState('已刪除並退回切篇');
      renderAll();
      if (chapter.draft) suggestNextPart();
      window.StoryFlowNavigate?.('workspace');
      notify(`已刪除 ${affected.length} 篇，已回到該章節重新切篇`);
    } catch (error) {
      chapter.parts.push(...affected);
      chapter.confirmedBlockCount = chapter.parts.length ? chapter.parts[chapter.parts.length - 1].endBlock : 0;
      renderParts();
      notify(`刪除失敗：${error.message}`, true);
    }
  }

  async function deleteVisualEntry(entry) {
    const deleteEntry = window.StoryFlowVisualWorkspace?.deleteEntry;
    if (typeof deleteEntry !== 'function') {
      notify('圖文刪除功能尚未準備完成，請重新整理後再試。', true);
      return false;
    }
    const deleted = await deleteEntry(entry?.id);
    if (!deleted) return false;
    selectedPartKey = null;
    renderParts();
    return true;
  }

  // A rail entry states one version of this article and selects it. The actions that act on
  // that version — record, mark published, copy — belong beside the content they are about,
  // in the left column, so they are not repeated here.
  function createPlatformRow(entry, platform) {
    const { part } = entry;
    const isDefault = !platform;
    const hashtagsText = isDefault ? '' : hashtagsFor(part, platform);
    const hashtagsOverridden = !isDefault && hasPlatformHashtagsOverride(part, platform);
    const published = isDefault ? false : Boolean(part.platformStatus?.[platform]);
    const platformTitle = isDefault ? '' : publishTitleFor(part, platform);
    const hasPlatformTitle = !isDefault && Boolean(String(part.platformTitles?.[platform] || '').trim());
    const record = isDefault ? { publishedAt: '', url: '' } : publicationRecord(part, platform);
    const publishedAt = publicationDateLabel(record.publishedAt);
    const recordSummary = published
      ? `${publishedAt || '未記錄發布時間'}${record.url ? ' · 已記錄網址' : ''}`
      : '';
    const current = (selectedPlatformKey || '') === (platform || '');
    const label = isDefault ? 'StoryFlow 預設' : platform;

    const row = document.createElement('div');
    row.className = `publish-platform-row${isDefault ? ' is-default-output' : ''}${current ? ' is-current' : ''}`;
    row.dataset.platform = platform || '';
    row.innerHTML = `
      <button class="publish-platform-choose" type="button" aria-pressed="${current}" aria-label="顯示「${escapeHtml(label)}」版本">
        <span class="publish-platform-state-line">
          <strong>${escapeHtml(label)}</strong>
          <span class="publish-platform-status ${published ? 'done' : ''}">${isDefault ? '不含平台設定' : published ? '已發布' : '尚未發布'}</span>
        </span>
        ${hasPlatformTitle ? `<small class="publish-platform-title-summary">自訂標題：${escapeHtml(platformTitle)}</small>` : ''}
        ${hashtagsOverridden && !hashtagsText ? '<small class="publish-platform-hashtags-summary">此平台不使用 Hashtags</small>' : ''}
        ${recordSummary ? `<small class="publish-platform-record-summary">${escapeHtml(recordSummary)}</small>` : ''}
      </button>
      ${hashtagsText ? `<button class="publish-platform-hashtags ${hashtagsOverridden ? 'is-custom' : ''}" type="button" aria-label="複製 Hashtags：${escapeHtml(hashtagsText)}" title="${hashtagsOverridden ? '平台自訂 Hashtags；點一下複製' : '沿用共用 Hashtags；點一下複製'}">${escapeHtml(hashtagsText)}</button>` : isDefault ? '' : '<span class="publish-platform-hashtags-empty">未設定 Hashtags</span>'}`;

    row.querySelector('.publish-platform-choose').addEventListener('click', event => {
      event.stopPropagation();
      previewPublish(part, platform, entry.contentMode);
    });
    row.querySelector('.publish-platform-hashtags')?.addEventListener('click', async event => {
      event.stopPropagation();
      try {
        await writeClipboard(hashtagsText);
        notify('已複製 Hashtags');
      } catch (error) {
        notify(`複製 Hashtags 失敗：${error.message}`, true);
      }
    });
    return row;
  }

  async function savePublishingHelpers(chapter, entry, summaryInput, hashtagsInput) {
    entry.summary = summaryInput.value.trim();
    entry.hashtags = hashtagsInput.value.trim();
    entry.tags = StoryFlowContentModel.tagsFromHashtags(entry.hashtags);
    entry.updatedAt = new Date().toISOString();
    saveState('發布輔助資訊已更新');
    try {
      const updated = isVisualPart(entry) ? await writeVisualEntry(entry) : await writeArticleMarkdown(chapter, entry);
      if (updated) notify('摘要與 Hashtags 已保存');
      else notify('摘要與 Hashtags 已保留在工作區；連接資料夾後可再保存一次。', true);
    } catch (error) {
      notify(`摘要與 Hashtags 已更新，但檔案尚未寫入：${error.message}`, true);
    }
    renderParts();
    return true;
  }

  function createPublishingHelpers(chapter, entry, { onSaved } = {}) {
    const section = document.createElement('section');
    section.className = 'visual-publish-helpers';
    section.innerHTML = `
      <label class='visual-publish-helper-field'>
        <span>摘要</span>
        <textarea class='text-input visual-publish-summary-input' rows='3' maxlength='500' placeholder='簡短介紹這篇文章'></textarea>
      </label>
      <label class='visual-publish-helper-field'>
        <span>Hashtags</span>
        <input class='text-input visual-publish-hashtags-input' maxlength='500' placeholder='#創作 #小說' />
        <small>以純文字保存，可直接複製；系統會自動建立精確搜尋分類。</small>
      </label>
      <div class='visual-publish-helper-actions'>
        <button class='button tiny primary visual-publish-save-helpers' type='button'>保存摘要與 Hashtags</button>
      </div>`;

    const summaryInput = section.querySelector('.visual-publish-summary-input');
    const hashtagsInput = section.querySelector('.visual-publish-hashtags-input');
    summaryInput.value = entry.summary || '';
    hashtagsInput.value = entry.hashtags || '';
    section.querySelector('.visual-publish-save-helpers').addEventListener('click', async event => {
      event.stopPropagation();
      const saved = await savePublishingHelpers(chapter, entry, summaryInput, hashtagsInput);
      if (saved) onSaved?.();
    });
    section.flushPending = async () => {
      const unchanged = summaryInput.value.trim() === String(entry.summary || '').trim()
        && hashtagsInput.value.trim() === String(entry.hashtags || '').trim();
      if (unchanged) return true;
      return savePublishingHelpers(chapter, entry, summaryInput, hashtagsInput);
    };
    section.addEventListener('click', event => event.stopPropagation());
    return section;
  }

  function createArticleRow(entry) {
    const { chapter, part, partIndex, status } = entry;
    const visual = entry.contentMode === 'visual';
    const publishTitle = publishTitleFor(part);
    const hasCustomPublishTitle = publishTitle !== part.title;
    const key = partKey(part);
    const expanded = selectedPartKey === key;
    const card = document.createElement('article');
    card.className = `publish-list-item sf-hier-row ${expanded ? 'expanded' : ''}`;
    card.dataset.partKey = key;
    card.dataset.contentMode = visual ? 'visual' : 'longform';

    const statusCount = status.total ? ` · ${status.published}/${status.total}` : '';
    const afterwordCount = afterwordChars(part);
    const imageCount = part.images?.length || 0;
    const bodyChars = visual ? charCount(part.body) : part.chars;
    const summaryText = String(part.summary || '').trim();
    const hashtagsText = String(part.hashtags || '').trim();
    const incompleteVisual = visual && !visualContentComplete(part);
    card.innerHTML = `
      <div class="publish-list-summary" role="button" tabindex="0" aria-expanded="${expanded}">
        <div class="publish-list-title-block">
          <span class="publish-chapter-name"><span class="publish-content-type ${visual ? 'visual' : 'longform'}">${visual ? '圖文' : '長文'}</span>${visual ? escapeHtml(state.projectTitle || '圖文系列') : escapeHtml(chapter.title)}</span>
          <div class="publish-list-title-row">
            <strong>${escapeHtml(publishTitle)}</strong>
            ${summaryText ? `<span class="publish-summary-hint" tabindex="0" role="img" aria-label="摘要：${escapeHtml(summaryText)}" data-summary="${escapeHtml(summaryText)}">i</span>` : ''}
            <span>${bodyChars.toLocaleString()} 字</span>
            ${afterwordCount ? `<span class="publish-afterword-badge">有後記 ${afterwordCount.toLocaleString()} 字</span>` : ''}
            ${imageCount ? `<span class="publish-image-badge">附圖 ${imageCount.toLocaleString()} 張</span>` : ''}
            ${incompleteVisual ? '<span class="publish-readiness-badge incomplete">內容尚未完成</span>' : ''}
          </div>
          ${hasCustomPublishTitle ? `<small class="publish-internal-title">內部名稱：${escapeHtml(part.title)}</small>` : ''}
        </div>
        <div class="publish-list-meta">
          <span class="publish-overall-status ${status.key}">${status.label}${statusCount}</span>
        </div>
        <div class="publish-list-actions">
          <button class="button tiny ghost default-preview-btn" type="button" aria-label="預覽「${escapeHtml(part.title || '未命名內容')}」">預覽</button>
          <button class="button tiny ghost publish-delete-btn" type="button" aria-label="刪除「${escapeHtml(part.title || '未命名內容')}」">刪除</button>
          <span class="sf-chevron publish-expand-indicator" aria-hidden="true"></span>
        </div>
      </div>
      <div class="publish-platform-details" ${expanded ? '' : 'hidden'}>
        <div class="publish-manuscript-column">
          <div class="publish-article-tools ${visual ? 'visual-publish-summary' : ''}">
            <div class="publish-article-tools-copy">
              <strong>發布補充內容</strong>
              <span>${visual ? `文字 ${bodyChars.toLocaleString()} 字 · 圖片 ${imageCount.toLocaleString()} 張` : `正文 ${part.chars.toLocaleString()} 字 · 圖片 ${imageCount.toLocaleString()} 張`} · 後記 ${afterwordCount.toLocaleString()} 字</span>
            </div>
            <div class="publish-article-tool-actions">
              <button class="button tiny ghost publish-helper-tool-btn" type="button">摘要與 Hashtags${summaryText || hashtagsText ? ' · 已設定' : ''}</button>
              ${visual ? '' : `<button class="button tiny ghost publish-images-tool-btn" type="button">文章圖片${imageCount ? ` ${imageCount.toLocaleString()}` : ''}</button>`}
              <button class="button tiny ghost publish-afterword-tool-btn" type="button">後記${afterwordCount ? ` ${afterwordCount.toLocaleString()} 字` : ''}</button>
            </div>
          </div>
          <div class="publish-preview-host"></div>
        </div>
        <aside class="publish-platform-rail" aria-label="發布平台">
          <div class="publish-platform-details-head">
            <strong>發布平台</strong>
            <span class="muted">選一個，預覽就換成它的版本</span>
          </div>
          <div class="publish-platform-list"></div>
        </aside>
      </div>`;

    const toggleExpanded = () => {
      const anchorTop = card.getBoundingClientRect().top;
      // The rail belongs to the row that is open. Carrying a platform over to the next row
      // would preselect a version of an article nobody asked about.
      if (selectedPartKey !== key) {
        selectedPlatformKey = '';
        previewOptions = { includeTitle: false, titleStyle: 'heading' };
      }
      selectedPartKey = selectedPartKey === key ? null : key;
      renderParts();
      const nextCard = els.partsList?.querySelector(`[data-part-key="${CSS.escape(key)}"]`);
      if (!nextCard) return;
      const restorePosition = () => {
        const delta = nextCard.getBoundingClientRect().top - anchorTop;
        if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'auto' });
        nextCard.querySelector('.publish-manage-btn')?.focus({ preventScroll: true });
      };
      restorePosition();
      window.requestAnimationFrame(restorePosition);
    };

    const summary = card.querySelector('.publish-list-summary');
    summary.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      toggleExpanded();
    });
    summary.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleExpanded();
    });

    card.querySelector('.default-preview-btn').addEventListener('click', event => {
      event.stopPropagation();
      previewPublish(part, '', entry.contentMode);
    });
    card.querySelector('.publish-delete-btn')?.addEventListener('click', event => {
      event.stopPropagation();
      if (visual) deleteVisualEntry(part);
      else deleteConfirmedPart(chapter, partIndex);
    });

    if (expanded) {
      card.querySelector('.publish-helper-tool-btn')?.addEventListener('click', event => {
        event.stopPropagation();
        openArticleTool(chapter, part, 'publishing-helpers');
      });
      card.querySelector('.publish-images-tool-btn')?.addEventListener('click', event => {
        event.stopPropagation();
        openArticleTool(chapter, part, 'images');
      });
      card.querySelector('.publish-afterword-tool-btn')?.addEventListener('click', event => {
        event.stopPropagation();
        openArticleTool(chapter, part, 'afterword');
      });
      const platformList = card.querySelector('.publish-platform-list');
      // The default output is the rail's first entry rather than the absence of a
      // selection: every version of this article is reachable the same way.
      platformList.appendChild(createPlatformRow(entry, ''));
      if (!platforms.length) {
        const empty = document.createElement('div');
        empty.className = 'publish-no-platform';
        empty.innerHTML = '<strong>目前沒有發布平台</strong><span>請到設定新增發布平台後再管理發布狀態。</span><button class="button tiny ghost" type="button">前往設定</button>';
        empty.querySelector('button').addEventListener('click', event => {
          event.stopPropagation();
          openSettings();
        });
        platformList.appendChild(empty);
      } else {
        platforms.forEach(platform => platformList.appendChild(createPlatformRow(entry, platform)));
      }

      if (selectedPlatformKey && !platforms.includes(selectedPlatformKey)) selectedPlatformKey = '';
      const panel = buildPublishPreviewPanel();
      card.querySelector('.publish-preview-host').appendChild(panel);
      renderPublishPreview(panel, part, selectedPlatformKey, entry.contentMode);
    }

    return card;
  }

  function refreshHeaderAndSummary(entries) {
    const counts = dashboardCounts(entries);
    const visualMode = state.contentMode === 'visual';
    const listTitle = document.querySelector('.publishing-panel .panel-head h2');
    const listNote = document.querySelector('.publishing-panel .panel-head .muted');
    const totalLabel = document.querySelector('.publishing-stats article:first-child span');
    const toolbarHint = document.querySelector('.publishing-toolbar-hint');
    if (listTitle) listTitle.textContent = visualMode ? '圖文清單' : '文章清單';
    if (listNote) listNote.textContent = visualMode
      ? '外層顯示整體狀態；展開後管理各平台與圖片上傳順序。'
      : '外層只顯示整體發布狀態；點選文章後再展開各平台細項。';
    if (totalLabel) totalLabel.textContent = visualMode ? '圖文數' : '已確認文章';
    // A visual work has no chapters to order by and its entries do carry updatedAt, so the
    // control has nothing to offer there — the sentence it replaced still explains the order.
    const sortControl = document.getElementById('publishingSortControl');
    if (sortControl) {
      sortControl.hidden = visualMode;
      const active = publishSortKey();
      sortControl.querySelectorAll('[data-publish-sort]').forEach(button => {
        const on = button.dataset.publishSort === active;
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
      });
    }
    if (toolbarHint) toolbarHint.hidden = !visualMode;
    const projectTitle = document.getElementById('publishingProjectTitle');
    if (projectTitle) projectTitle.textContent = state.projectTitle || '未命名作品';
    const values = {
      publishingTotalCount: counts.total,
      publishingPendingCount: counts.pending,
      publishingPartialCount: counts.partial,
      publishingCompleteCount: counts.complete
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value.toLocaleString();
    });

    document.querySelectorAll('.publishing-filter').forEach(button => {
      button.classList.toggle('active', button.dataset.filter === currentFilter);
      const key = button.dataset.filter;
      const count = key === 'all' ? counts.total : counts[key];
      const baseLabel = key === 'all' ? '全部' : key === 'pending' ? '待發布' : key === 'partial' ? '部分發布' : '已完成';
      button.textContent = `${baseLabel} ${count}`;
    });

    const continueButton = document.getElementById('continuePublishingBtn');
    const next = entries.find(entry => entry.status.key !== 'complete');
    if (continueButton) {
      continueButton.hidden = !next;
      continueButton.textContent = platforms.length ? '繼續發布' : '設定發布平台';
      continueButton.onclick = () => {
        if (!next) return;
        const platform = platforms.find(name => !next.part.platformStatus?.[name]);
        if (!platform) {
          openSettings();
          return;
        }
        selectedPartKey = partKey(next.part);
        currentFilter = 'all';
        renderParts();
        previewPublish(next.part, platform, next.contentMode);
      };
    }
  }

  StoryFlowRender.provide('renderParts', function renderPublishingDashboard() {
    const structure = ensureViewStructure();
    if (!structure || !els.partsList) return;

    const entries = allEntries();
    refreshHeaderAndSummary(entries);
    // The preview panel lives inside the list, so emptying it discards whatever object URLs
    // a visual preview was holding. The dialog's close handler used to do this.
    visualPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    visualPreviewUrls = [];
    els.partsList.innerHTML = '';

    const filtered = currentFilter === 'all'
      ? entries
      : entries.filter(entry => entry.status.key === currentFilter);

    if (selectedPartKey && !filtered.some(entry => partKey(entry.part) === selectedPartKey)) {
      selectedPartKey = null;
      selectedPlatformKey = '';
    }

    if (!entries.length) {
      els.partsList.innerHTML = '<div class="empty-state publishing-empty"><div class="empty-icon">↗</div><strong>尚未有可發布內容</strong><span>完成第一篇文章或第一則圖文後，會顯示在這裡。</span><button class="button primary publishing-empty-action" type="button">回到工作台</button></div>';
      els.partsList.querySelector('.publishing-empty-action')?.addEventListener('click', () => window.StoryFlowNavigate?.('workspace'));
      return;
    }

    if (!filtered.length) {
      els.partsList.innerHTML = '<div class="empty-state publishing-empty"><strong>這個篩選條件目前沒有內容</strong><span>目前已有內容，只是沒有符合選擇的發布狀態。</span><button class="button ghost publishing-empty-action" type="button">清除狀態篩選</button></div>';
      els.partsList.querySelector('.publishing-empty-action')?.addEventListener('click', () => {
        currentFilter = 'all';
        renderParts();
      });
      return;
    }

    filtered.forEach(entry => els.partsList.appendChild(createArticleRow(entry)));
  });

  window.StoryFlowPublishing = {
    sortKey: publishSortKey,
    sortReversed: publishSortReversed,
    sortOptions: () => Object.entries(PUBLISH_SORTS).map(([key, value]) => ({ key, label: value.label })),
    setSort(key) {
      if (!PUBLISH_SORTS[key] || publishSortKey() === key) return false;
      // A working habit, not a property of a work: it rides across switchProject() with the
      // split preferences, which is the existing idiom for exactly this.
      state.publishSort = key;
      try { saveState('排序已更新'); } catch (_) {}
      window.renderParts?.();
      return true;
    },
    persistPart: writeArticleMarkdown,
    openPart(key, { preview = false } = {}) {
      const entry = allEntries().find(item => partKey(item.part) === key);
      if (!entry) return false;
      selectedPartKey = key;
      currentFilter = 'all';
      renderParts();
      const card = els.partsList?.querySelector(`[data-part-key="${CSS.escape(key)}"]`);
      card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card?.querySelector('.publish-list-summary')?.focus({ preventScroll: true });
      if (preview) previewPublish(entry.part, '', entry.contentMode);
      return true;
    },
    openPending(key, platform) {
      const entry = allEntries().find(item => partKey(item.part) === key);
      if (!entry) return false;
      selectedPartKey = key;
      currentFilter = 'all';
      renderParts();
      previewPublish(entry.part, platform || platforms.find(name => !entry.part.platformStatus?.[name]) || '', entry.contentMode);
      return true;
    }
  };

  window.StoryFlowPublishingOutput = {
    forPart: outputFor,
    withTitle: outputWithTitle,
    richWithTitle: richOutputHtml,
    sectionsFor: outputSections,
    afterwordChars,
    titleFor: publishTitleFor
  };

  ensureViewStructure();
  renderParts();
})();
