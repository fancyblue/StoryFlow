// Dedicated publishing dashboard: compact newest-first list, expandable platform details.
(function () {
  let deleteFolderHandle = null;
  let currentFilter = 'all';
  let selectedPartKey = null;

  function safeName(value, fallback = 'untitled') {
    const cleaned = String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
  }

  function partKey(part) {
    return part?.id || `${part?.title || 'part'}:${part?.startBlock ?? ''}:${part?.endBlock ?? ''}`;
  }

  function outputSections(part, platform, includeAfterword = part?.includeAfterword !== false) {
    normalizePublishingPart(part);
    const raw = part.raw ?? part.formatted ?? '';
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

  function publishTitleFor(part) {
    normalizePublishingPart(part);
    return part.publishTitle.trim() || part.title || '未命名文章';
  }

  function publicationRecord(part, platform) {
    normalizePublishingPart(part);
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
    normalizePublishingPart(part);
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
    for (let chapterIndex = state.chapters.length - 1; chapterIndex >= 0; chapterIndex -= 1) {
      const chapter = state.chapters[chapterIndex];
      const parts = chapter.parts || [];
      for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = parts[partIndex];
        normalizePartStatus(part);
        entries.push({ chapter, chapterIndex, part, partIndex, status: statusFor(part) });
      }
    }
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

    let workspaceView = document.getElementById('workspaceView');
    if (!workspaceView) {
      workspaceView = document.createElement('section');
      workspaceView.id = 'workspaceView';
      workspaceView.className = 'app-view workspace-view';
      const first = main.firstElementChild;
      main.insertBefore(workspaceView, first || null);
      ['.topbar', '.connection-bar', '.stats-grid', '.workspace-grid'].forEach(selector => {
        const node = main.querySelector(`:scope > ${selector}`);
        if (node) workspaceView.appendChild(node);
      });

      const summary = document.createElement('section');
      summary.id = 'workspacePublishingSummary';
      summary.className = 'panel workspace-publishing-summary';
      summary.innerHTML = `
        <div>
          <p class="eyebrow">PUBLISHING</p>
          <h2>發布進度</h2>
          <p id="workspacePublishingSummaryText" class="muted"></p>
        </div>
        <button id="openPublishingFromWorkspace" class="button primary" type="button">前往發布 →</button>`;
      workspaceView.appendChild(summary);
      summary.querySelector('#openPublishingFromWorkspace').addEventListener('click', () => {
        window.StoryFlowNavigate?.('publishing');
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
            <span class="muted publishing-toolbar-hint">最新確認的文章顯示在最上面。</span>
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

  function rebuildPublishPreviewDialog() {
    document.getElementById('platformPreviewDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'platformPreviewDialog';
    dialog.className = 'publishing-preview-dialog';
    dialog.innerHTML = `
      <div class="dialog-card platform-preview-dialog-card">
        <div class="panel-head">
          <div><p class="eyebrow">PUBLISH PREVIEW</p><h3 id="platformPreviewTitle">發布預覽</h3></div>
          <button id="closePlatformPreview" class="icon-button" type="button" aria-label="關閉">×</button>
        </div>
        <div class="platform-preview-body">
          <p id="platformPreviewMeta" class="muted"></p>
          <div class="platform-preview-title-copy">
            <div><span>發布標題</span><strong id="platformPreviewPublishTitle"></strong></div>
            <button id="copyPlatformTitle" class="button tiny ghost" type="button">複製標題</button>
          </div>
          <label id="platformPreviewAfterwordOption" class="platform-preview-afterword-option" hidden>
            <input id="platformPreviewIncludeAfterword" type="checkbox" />
            <span>附上後記</span>
            <small id="platformPreviewAfterwordCount"></small>
          </label>
          <div id="platformPreviewContent" class="platform-preview-content"></div>
        </div>
        <div class="platform-preview-actions">
          <button id="confirmPlatformCopy" class="button primary" type="button">複製內容</button>
          <button id="togglePlatformPublished" class="button ghost" type="button">標註已發布</button>
          <button id="cancelPlatformCopy" class="button ghost" type="button">關閉</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#closePlatformPreview').onclick = () => dialog.close();
    dialog.querySelector('#cancelPlatformCopy').onclick = () => dialog.close();
    return dialog;
  }

  const publishDialog = rebuildPublishPreviewDialog();

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
      const updated = await writeArticleMarkdown(entry.chapter, part);
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

  function previewPublish(part, platform) {
    normalizePartStatus(part);
    const publishTitle = publishTitleFor(part);
    const toggle = publishDialog.querySelector('#togglePlatformPublished');
    const afterwordOption = publishDialog.querySelector('#platformPreviewAfterwordOption');
    const includeAfterword = publishDialog.querySelector('#platformPreviewIncludeAfterword');
    const afterwordCount = afterwordChars(part);
    const isPublished = platform ? Boolean(part.platformStatus[platform]) : false;

    const refreshContent = () => {
      const container = publishDialog.querySelector('#platformPreviewContent');
      const sections = outputSections(part, platform, includeAfterword.checked);
      if (window.StoryFlowArticleImages?.renderPreview) {
        window.StoryFlowArticleImages.renderPreview(container, part, sections, {
          projectTitle: state.projectTitle,
          chapterTitle: allEntries().find(entry => entry.part === part)?.chapter?.title || ''
        });
      } else {
        container.textContent = outputFor(part, platform, includeAfterword.checked);
      }
    };

    publishDialog.querySelector('#platformPreviewTitle').textContent = `${publishTitle} · ${platformLabel(platform)}`;
    publishDialog.querySelector('#platformPreviewMeta').textContent = platform
      ? `這是「${platform}」實際要貼出的內容。發布狀態只會修改這個平台。`
      : '這是預設設定的輸出預覽；預設設定不是發布平台，因此不會產生發布狀態。';
    if (publishTitle !== part.title) {
      publishDialog.querySelector('#platformPreviewMeta').textContent += ` 內部文章名稱：${part.title}。`;
    }
    publishDialog.querySelector('#platformPreviewPublishTitle').textContent = publishTitle;
    publishDialog.querySelector('#copyPlatformTitle').onclick = async () => {
      try {
        await navigator.clipboard.writeText(publishTitle);
        notify('已複製發布標題');
      } catch (error) {
        notify(`複製標題失敗：${error.message}`, true);
      }
    };
    afterwordOption.hidden = afterwordCount === 0;
    includeAfterword.checked = part.includeAfterword !== false;
    publishDialog.querySelector('#platformPreviewAfterwordCount').textContent = `${afterwordCount.toLocaleString()} 字`;
    includeAfterword.onchange = async () => {
      part.includeAfterword = includeAfterword.checked;
      saveState('後記輸出設定已更新');
      refreshContent();
      renderParts();
      const entry = allEntries().find(item => item.part === part);
      if (!entry) return;
      try {
        const updated = await writeArticleMarkdown(entry.chapter, part);
        if (updated) notify('後記輸出設定與文章 Markdown 已更新');
        else notify('輸出設定目前只保留在畫面；請重新連接資料夾後再調整一次。', true);
      } catch (error) {
        notify(`輸出設定已更新，但文章 Markdown 尚未寫入：${error.message}`, true);
      }
    };
    refreshContent();
    toggle.hidden = !platform;
    toggle.textContent = isPublished ? '取消已發布標記' : '標註已發布';

    publishDialog.querySelector('#confirmPlatformCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(outputFor(part, platform, includeAfterword.checked));
        notify(`已複製 ${platformLabel(platform)} 內容`);
      } catch (error) {
        notify(`複製失敗：${error.message}`, true);
        return;
      }
      if (platform && !part.platformStatus?.[platform]) {
        const markPublished = window.confirm(`已複製「${platform}」版本。\n\n要將這個平台標註為已發布嗎？`);
        if (markPublished) {
          setPlatformPublished(part, platform, true);
          renderParts();
          await persistPublicationChange(part, `${platform} 已標註為已發布並記錄時間`);
        }
      }
      publishDialog.close();
    };

    toggle.onclick = async () => {
      if (!platform) return;
      const changed = await togglePlatformPublished(part, platform);
      if (changed) publishDialog.close();
    };

    publishDialog.showModal();
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

  function openPublicationRecord(chapter, part, platform) {
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
    saveState('後記已更新');
    renderParts();

    try {
      const updated = await writeArticleMarkdown(chapter, part);
      if (!updated) {
        notify('後記目前只保留在畫面；請重新連接資料夾後再按一次「保存後記」。', true);
        return;
      }
      notify(nextAfterword ? '後記與文章 Markdown 已更新' : '後記已移除，文章 Markdown 已更新');
    } catch (error) {
      notify(`後記已更新，但文章 Markdown 尚未寫入：${error.message}`, true);
    }
  }

  async function savePublishTitle(chapter, part, input) {
    const nextTitle = input.value.trim();
    part.publishTitle = nextTitle;
    saveState('發布標題已更新');
    renderParts();

    try {
      const updated = await writeArticleMarkdown(chapter, part);
      if (!updated) {
        notify('發布標題目前只保留在畫面；請重新連接資料夾後再按一次「保存標題」。', true);
        return;
      }
      notify(nextTitle ? '發布標題與文章 metadata 已更新' : '已改回沿用內部文章名稱');
    } catch (error) {
      notify(`發布標題已更新，但 metadata.json 尚未寫入：${error.message}`, true);
    }
  }

  function createPublishTitleEditor(chapter, part) {
    normalizePublishingPart(part);
    const section = document.createElement('section');
    section.className = 'publish-title-editor';
    section.innerHTML = `
      <div class="publish-title-editor-copy">
        <strong>發布標題</strong>
        <span class="muted">留白時沿用「${escapeHtml(part.title)}」；不更改來源名稱或 Markdown 檔名。</span>
      </div>
      <div class="publish-title-editor-controls">
        <input class="text-input publish-title-input" type="text" maxlength="200" aria-label="發布標題" placeholder="${escapeHtml(part.title)}" />
        <button class="button tiny primary publish-title-save" type="button">保存標題</button>
      </div>`;
    const input = section.querySelector('.publish-title-input');
    input.value = part.publishTitle;
    section.querySelector('.publish-title-save').addEventListener('click', event => {
      event.stopPropagation();
      savePublishTitle(chapter, part, input);
    });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      savePublishTitle(chapter, part, input);
    });
    section.addEventListener('click', event => event.stopPropagation());
    return section;
  }

  function createAfterwordEditor(chapter, part) {
    normalizePublishingPart(part);
    const section = document.createElement('section');
    section.className = 'publish-afterword-editor';
    section.innerHTML = `
      <div class="publish-afterword-head">
        <div>
          <strong>後記</strong>
          <span class="muted">與來源正文分開保存，不計入正文篇幅</span>
        </div>
        <label class="publish-afterword-include">
          <input type="checkbox" ${part.includeAfterword !== false ? 'checked' : ''} ${part.afterword.trim() ? '' : 'disabled'} />
          <span>預覽與複製時附上</span>
        </label>
      </div>
      <textarea class="publish-afterword-input" rows="5" aria-label="文章後記" placeholder="寫下完稿後想補充給讀者的話。後記不會回寫 Google Docs。"></textarea>
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
    section.querySelector('.publish-afterword-save').addEventListener('click', event => {
      event.stopPropagation();
      saveAfterword(chapter, part, textarea, includeControl);
    });
    section.addEventListener('click', event => event.stopPropagation());
    return section;
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
      ? `\n\n這些文章共附有 ${protectedImages} 張圖片；文章記錄會移除，但私人 assets 圖檔會保留，避免誤刪原圖。`
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

  function createPlatformRow(entry, platform) {
    const { chapter, part } = entry;
    const published = Boolean(part.platformStatus?.[platform]);
    const record = publicationRecord(part, platform);
    const publishedAt = publicationDateLabel(record.publishedAt);
    const recordSummary = published
      ? `${publishedAt || '未記錄發布時間'}${record.url ? ' · 已記錄網址' : ''}`
      : '';
    const row = document.createElement('div');
    row.className = 'publish-platform-row';
    row.innerHTML = `
      <div class="publish-platform-state">
        <div class="publish-platform-state-line">
          <strong>${escapeHtml(platform)}</strong>
          <span class="publish-platform-status ${published ? 'done' : ''}">${published ? '已發布' : '尚未發布'}</span>
        </div>
        ${recordSummary ? `<small class="publish-platform-record-summary">${escapeHtml(recordSummary)}</small>` : ''}
      </div>
      <div class="publish-platform-actions">
        <button class="button tiny ghost platform-preview-btn" type="button">預覽／複製</button>
        <button class="button tiny ghost platform-record-btn" type="button">${published ? '發布紀錄' : '記錄發布'}</button>
        <button class="button tiny ghost platform-status-btn ${published ? 'is-published' : ''}" type="button">${published ? '取消已發布' : '標註已發布'}</button>
      </div>`;
    row.querySelector('.platform-preview-btn').addEventListener('click', event => {
      event.stopPropagation();
      previewPublish(part, platform);
    });
    row.querySelector('.platform-record-btn').addEventListener('click', event => {
      event.stopPropagation();
      openPublicationRecord(chapter, part, platform);
    });
    row.querySelector('.platform-status-btn').addEventListener('click', event => {
      event.stopPropagation();
      togglePlatformPublished(part, platform);
    });
    return row;
  }

  function createArticleRow(entry) {
    const { chapter, part, partIndex, status } = entry;
    const publishTitle = publishTitleFor(part);
    const hasCustomPublishTitle = publishTitle !== part.title;
    const key = partKey(part);
    const expanded = selectedPartKey === key;
    const card = document.createElement('article');
    card.className = `publish-list-item ${expanded ? 'expanded' : ''}`;
    card.dataset.partKey = key;

    const statusCount = status.total ? ` · ${status.published}/${status.total}` : '';
    const afterwordCount = afterwordChars(part);
    const imageCount = part.images.length;
    card.innerHTML = `
      <div class="publish-list-summary" role="button" tabindex="0" aria-expanded="${expanded}">
        <div class="publish-list-title-block">
          <span class="publish-chapter-name">${escapeHtml(chapter.title)}</span>
          <div class="publish-list-title-row">
            <strong>${escapeHtml(publishTitle)}</strong>
            <span>${part.chars.toLocaleString()} 字</span>
            ${afterwordCount ? `<span class="publish-afterword-badge">有後記 ${afterwordCount.toLocaleString()} 字</span>` : ''}
            ${imageCount ? `<span class="publish-image-badge">附圖 ${imageCount.toLocaleString()} 張</span>` : ''}
          </div>
          ${hasCustomPublishTitle ? `<small class="publish-internal-title">內部名稱：${escapeHtml(part.title)}</small>` : ''}
        </div>
        <div class="publish-list-meta">
          <span class="publish-overall-status ${status.key}">${status.label}${statusCount}</span>
        </div>
        <div class="publish-list-actions">
          <button class="button tiny ghost default-preview-btn" type="button">預覽預設設定</button>
          <button class="button tiny ghost publish-delete-btn" type="button">刪除</button>
          <span class="sf-chevron publish-expand-indicator" aria-hidden="true"></span>
        </div>
      </div>
      <div class="publish-platform-details" ${expanded ? '' : 'hidden'}>
        <div class="publish-title-editor-slot"></div>
        <div class="publish-image-manager-slot"></div>
        <div class="publish-afterword-slot"></div>
        <div class="publish-platform-details-head">
          <strong>發布平台</strong>
          <span class="muted">各平台狀態彼此獨立</span>
        </div>
        <div class="publish-platform-list"></div>
      </div>`;

    const toggleExpanded = () => {
      selectedPartKey = selectedPartKey === key ? null : key;
      renderParts();
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
      previewPublish(part, '');
    });
    card.querySelector('.publish-delete-btn').addEventListener('click', event => {
      event.stopPropagation();
      deleteConfirmedPart(chapter, partIndex);
    });

    if (expanded) {
      card.querySelector('.publish-title-editor-slot').appendChild(createPublishTitleEditor(chapter, part));
      const imageManager = window.StoryFlowArticleImages?.createManager?.(chapter, part);
      if (imageManager) card.querySelector('.publish-image-manager-slot').appendChild(imageManager);
      card.querySelector('.publish-afterword-slot').appendChild(createAfterwordEditor(chapter, part));
      const platformList = card.querySelector('.publish-platform-list');
      if (!platforms.length) {
        platformList.innerHTML = '<div class="publish-no-platform"><strong>目前沒有發布平台</strong><span>請到設定新增發布平台後再管理發布狀態。</span><button class="button tiny ghost" type="button">前往設定</button></div>';
        platformList.querySelector('button').addEventListener('click', event => {
          event.stopPropagation();
          openSettings();
        });
      } else {
        platforms.forEach(platform => platformList.appendChild(createPlatformRow(entry, platform)));
      }
    }

    return card;
  }

  function refreshHeaderAndSummary(entries) {
    const counts = dashboardCounts(entries);
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

    const summary = document.getElementById('workspacePublishingSummaryText');
    if (summary) {
      if (!counts.total) summary.textContent = '還沒有已確認文章。完成 SMART SPLIT 後，文章會進入發布頁。';
      else {
        const unfinished = counts.pending + counts.partial;
        summary.textContent = `${counts.total} 篇已確認 · ${unfinished} 篇尚未完成所有平台發布`;
      }
    }

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
        previewPublish(next.part, platform);
      };
    }
  }

  window.renderParts = function renderPublishingDashboard() {
    const structure = ensureViewStructure();
    if (!structure || !els.partsList) return;

    const entries = allEntries();
    refreshHeaderAndSummary(entries);
    els.partsList.innerHTML = '';

    const filtered = currentFilter === 'all'
      ? entries
      : entries.filter(entry => entry.status.key === currentFilter);

    if (selectedPartKey && !filtered.some(entry => partKey(entry.part) === selectedPartKey)) selectedPartKey = null;

    if (!entries.length) {
      els.partsList.innerHTML = '<div class="empty-state publishing-empty"><div class="empty-icon">↗</div><strong>還沒有已確認文章</strong><span>先回到工作台載入內容並完成第一篇切篇。</span><button class="button primary publishing-empty-action" type="button">回到工作台開始切篇</button></div>';
      els.partsList.querySelector('.publishing-empty-action')?.addEventListener('click', () => window.StoryFlowNavigate?.('workspace'));
      return;
    }

    if (!filtered.length) {
      els.partsList.innerHTML = '<div class="empty-state publishing-empty"><strong>這個篩選條件目前沒有文章</strong><span>目前文章存在，只是沒有符合選擇的發布狀態。</span><button class="button ghost publishing-empty-action" type="button">清除狀態篩選</button></div>';
      els.partsList.querySelector('.publishing-empty-action')?.addEventListener('click', () => {
        currentFilter = 'all';
        renderParts();
      });
      return;
    }

    filtered.forEach(entry => els.partsList.appendChild(createArticleRow(entry)));
  };

  window.StoryFlowPublishing = {
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
      if (preview) previewPublish(entry.part, '');
      return true;
    },
    openPending(key, platform) {
      const entry = allEntries().find(item => partKey(item.part) === key);
      if (!entry) return false;
      selectedPartKey = key;
      currentFilter = 'all';
      renderParts();
      previewPublish(entry.part, platform || platforms.find(name => !entry.part.platformStatus?.[name]) || '');
      return true;
    }
  };

  window.StoryFlowPublishingOutput = {
    forPart: outputFor,
    sectionsFor: outputSections,
    afterwordChars,
    titleFor: publishTitleFor
  };

  ensureViewStructure();
  renderParts();
})();
