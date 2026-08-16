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

  function outputFor(part, platform) {
    return platform ? platformFormat(part.raw, platform) : webFormat(part.raw);
  }

  function platformLabel(platform) {
    return platform || '預設設定';
  }

  function normalizePartStatus(part) {
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
          <span class="muted">最新確認的文章顯示在最上面。</span>
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
          <pre id="platformPreviewContent" class="platform-preview-content"></pre>
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

  function setPlatformPublished(part, platform, nextValue) {
    if (!platform) return;
    normalizePartStatus(part);
    part.platformStatus[platform] = Boolean(nextValue);
    part.published = Object.values(part.platformStatus).some(Boolean);
    saveState('發布狀態已更新');
  }

  function togglePlatformPublished(part, platform) {
    if (!platform) return;
    normalizePartStatus(part);
    const next = !part.platformStatus[platform];
    setPlatformPublished(part, platform, next);
    renderParts();
    notify(`${platform} 已${next ? '標註已發布' : '取消已發布標記'}`);
  }

  function previewPublish(part, platform) {
    normalizePartStatus(part);
    const text = outputFor(part, platform);
    const toggle = publishDialog.querySelector('#togglePlatformPublished');
    const isPublished = platform ? Boolean(part.platformStatus[platform]) : false;

    publishDialog.querySelector('#platformPreviewTitle').textContent = `${part.title} · ${platformLabel(platform)}`;
    publishDialog.querySelector('#platformPreviewMeta').textContent = platform
      ? `這是「${platform}」實際要貼出的內容。發布狀態只會修改這個平台。`
      : '這是預設設定的輸出預覽；預設設定不是發布平台，因此不會產生發布狀態。';
    publishDialog.querySelector('#platformPreviewContent').textContent = text;
    toggle.hidden = !platform;
    toggle.textContent = isPublished ? '取消已發布標記' : '標註已發布';

    publishDialog.querySelector('#confirmPlatformCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        notify(`已複製 ${platformLabel(platform)} 內容`);
      } catch (error) {
        notify(`複製失敗：${error.message}`, true);
        return;
      }
      publishDialog.close();
    };

    toggle.onclick = () => {
      if (!platform) return;
      togglePlatformPublished(part, platform);
      publishDialog.close();
    };

    publishDialog.showModal();
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
    const message = laterCount
      ? `刪除「${part.title}」會使後續切點失去連續性。\n\n因此會一起移除這篇之後的 ${laterCount} 篇，並退回到「${part.title}」開始的位置重新切篇。\n\n確定繼續？`
      : `刪除「${part.title}」？\n\n會移除 Markdown，並把切篇進度退回，讓你重新處理這一段。`;
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
    const { part } = entry;
    const published = Boolean(part.platformStatus?.[platform]);
    const row = document.createElement('div');
    row.className = 'publish-platform-row';
    row.innerHTML = `
      <div class="publish-platform-state">
        <strong>${escapeHtml(platform)}</strong>
        <span class="publish-platform-status ${published ? 'done' : ''}">${published ? '已發布' : '尚未發布'}</span>
      </div>
      <div class="publish-platform-actions">
        <button class="button tiny ghost platform-preview-btn" type="button">預覽／複製</button>
        <button class="button tiny ghost platform-status-btn ${published ? 'is-published' : ''}" type="button">${published ? '取消已發布' : '標註已發布'}</button>
      </div>`;
    row.querySelector('.platform-preview-btn').addEventListener('click', event => {
      event.stopPropagation();
      previewPublish(part, platform);
    });
    row.querySelector('.platform-status-btn').addEventListener('click', event => {
      event.stopPropagation();
      togglePlatformPublished(part, platform);
    });
    return row;
  }

  function createArticleRow(entry) {
    const { chapter, part, partIndex, status } = entry;
    const key = partKey(part);
    const expanded = selectedPartKey === key;
    const card = document.createElement('article');
    card.className = `publish-list-item ${expanded ? 'expanded' : ''}`;
    card.dataset.partKey = key;

    const statusCount = status.total ? ` · ${status.published}/${status.total}` : '';
    card.innerHTML = `
      <div class="publish-list-summary" role="button" tabindex="0" aria-expanded="${expanded}">
        <div class="publish-list-title-block">
          <span class="publish-chapter-name">${escapeHtml(chapter.title)}</span>
          <div class="publish-list-title-row">
            <strong>${escapeHtml(part.title)}</strong>
            <span>${part.chars.toLocaleString()} 字</span>
          </div>
        </div>
        <div class="publish-list-meta">
          <span class="publish-overall-status ${status.key}">${status.label}${statusCount}</span>
        </div>
        <div class="publish-list-actions">
          <button class="button tiny ghost default-preview-btn" type="button">預覽預設設定</button>
          <button class="button tiny ghost publish-delete-btn" type="button">刪除</button>
          <span class="publish-expand-indicator" aria-hidden="true">${expanded ? '⌃' : '⌄'}</span>
        </div>
      </div>
      <div class="publish-platform-details" ${expanded ? '' : 'hidden'}>
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
      els.partsList.innerHTML = '<div class="empty-state publishing-empty"><div class="empty-icon">↗</div><strong>還沒有已確認文章</strong><span>回到工作台完成 SMART SPLIT 並存成 Markdown 後，文章會自動出現在發布頁。</span></div>';
      return;
    }

    if (!filtered.length) {
      els.partsList.innerHTML = '<div class="empty-state publishing-empty"><strong>這個篩選條件目前沒有文章</strong><span>可以切換其他發布狀態查看。</span></div>';
      return;
    }

    filtered.forEach(entry => els.partsList.appendChild(createArticleRow(entry)));
  };

  ensureViewStructure();
  renderParts();
})();