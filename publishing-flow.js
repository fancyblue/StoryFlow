// Publishing queue UX: select a destination, preview/copy, and manage that platform's status directly.
(function () {
  let deleteFolderHandle = null;
  const selectedDestination = new Map();

  function partKey(part) {
    return part?.id || `${part?.title || 'part'}:${part?.startBlock ?? ''}:${part?.endBlock ?? ''}`;
  }

  function safeName(value, fallback = 'untitled') {
    const cleaned = String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
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

  function selectedFor(part) {
    const key = partKey(part);
    if (selectedDestination.has(key)) return selectedDestination.get(key);
    return platforms[0] || '';
  }

  function rememberSelection(part, platform) {
    selectedDestination.set(partKey(part), platform);
  }

  function fillPublishSelect(select, part) {
    normalizePartStatus(part);
    const current = selectedFor(part);
    select.innerHTML = '';
    select.add(new Option('預設設定', ''));
    platforms.forEach(name => select.add(new Option(name, name)));
    select.value = [...select.options].some(option => option.value === current) ? current : '';
    rememberSelection(part, select.value);
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
          <button id="closePlatformPreview" class="icon-button" type="button">×</button>
        </div>
        <div class="platform-preview-body">
          <p id="platformPreviewMeta" class="muted"></p>
          <pre id="platformPreviewContent" class="platform-preview-content"></pre>
        </div>
        <div class="platform-preview-actions">
          <button id="confirmPlatformCopy" class="button primary" type="button">複製內容</button>
          <button id="togglePlatformPublished" class="button ghost" type="button">標註已發布</button>
          <button id="cancelPlatformCopy" class="button ghost" type="button">取消</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    document.getElementById('closePlatformPreview').onclick = () => dialog.close();
    document.getElementById('cancelPlatformCopy').onclick = () => dialog.close();
    return dialog;
  }

  const publishDialog = rebuildPublishPreviewDialog();

  function setPlatformPublished(part, platform, nextValue) {
    if (!platform) return;
    normalizePartStatus(part);
    part.platformStatus[platform] = Boolean(nextValue);
    part.published = Object.values(part.platformStatus).some(Boolean);
    rememberSelection(part, platform);
    saveState('發布狀態已更新');
  }

  function togglePlatformPublished(part, platform) {
    if (!platform) return;
    normalizePartStatus(part);
    setPlatformPublished(part, platform, !part.platformStatus[platform]);
    renderAll();
    notify(`${platform} 已${part.platformStatus[platform] ? '標註已發布' : '取消已發布標記'}`);
  }

  function previewPublish(part, platform) {
    const dialog = publishDialog;
    normalizePartStatus(part);
    rememberSelection(part, platform);
    const text = outputFor(part, platform);
    const toggle = document.getElementById('togglePlatformPublished');
    const isPublished = platform ? Boolean(part.platformStatus[platform]) : false;

    document.getElementById('platformPreviewTitle').textContent = `${part.title} · ${platformLabel(platform)}`;
    document.getElementById('platformPreviewMeta').textContent = platform
      ? `目前操作的是「${platform}」。發布狀態只會修改這個平台。`
      : '這是預設設定的輸出預覽；預設設定不是發布平台。';
    document.getElementById('platformPreviewContent').textContent = text;
    toggle.hidden = !platform;
    toggle.textContent = isPublished ? '取消已發布標記' : '標註已發布';

    document.getElementById('confirmPlatformCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        notify(`已複製 ${platformLabel(platform)} 內容`);
      } catch (error) {
        notify(`複製失敗：${error.message}`, true);
        return;
      }
      dialog.close();
    };

    toggle.onclick = () => {
      if (!platform) return;
      togglePlatformPublished(part, platform);
      dialog.close();
    };

    dialog.showModal();
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
      affected.forEach(item => selectedDestination.delete(partKey(item)));
      suggestion = null;
      await deletePartFiles(chapter, affected);
      saveState('已刪除並退回切篇');
      renderAll();
      if (chapter.draft) suggestNextPart();
      notify(`已刪除 ${affected.length} 篇並退回切篇位置`);
    } catch (error) {
      chapter.parts.push(...affected);
      chapter.confirmedBlockCount = chapter.parts.length ? chapter.parts[chapter.parts.length - 1].endBlock : 0;
      renderAll();
      notify(`刪除失敗：${error.message}`, true);
    }
  }

  function refreshStatusButton(button, part, platform) {
    normalizePartStatus(part);
    button.disabled = !platform;
    button.textContent = !platform
      ? '預設格式無發布狀態'
      : (part.platformStatus[platform] ? '取消已發布' : '標註已發布');
    button.classList.toggle('is-published', Boolean(platform && part.platformStatus[platform]));
  }

  window.renderParts = function renderPartsPublishingFlow() {
    els.partsList.innerHTML = '';
    const chapter = activeChapter();
    const parts = chapter.parts || [];
    if (!parts.length) {
      els.partsList.innerHTML = '<div class="empty-state publishing-empty"><strong>還沒有已確認文章</strong><span>在 SMART SPLIT 確認並存成 Markdown 後，文章會出現在這裡。</span></div>';
      return;
    }

    parts.forEach((part, index) => {
      normalizePartStatus(part);
      const card = document.createElement('article');
      card.className = 'publish-card';
      const statusChips = platforms.map(name => `<span class="publish-status-chip ${part.platformStatus[name] ? 'done' : ''}">${escapeHtml(name)}${part.platformStatus[name] ? ' ✓' : ''}</span>`).join('');
      card.innerHTML = `
        <div class="publish-card-main">
          <div class="publish-card-title"><strong>${escapeHtml(part.title)}</strong><span>${part.chars.toLocaleString()} 字</span></div>
          <div class="publish-status-line">${statusChips || '<span class="muted">尚未設定發布平台</span>'}</div>
        </div>
        <div class="publish-card-action">
          <select class="publish-destination text-input" aria-label="發布格式"></select>
          <button class="button primary tiny publish-preview-btn" type="button">預覽／複製</button>
          <button class="button ghost tiny publish-status-btn" type="button">標註已發布</button>
          <button class="button ghost tiny publish-delete-btn" type="button">刪除</button>
        </div>`;

      const select = card.querySelector('.publish-destination');
      const previewButton = card.querySelector('.publish-preview-btn');
      const statusButton = card.querySelector('.publish-status-btn');
      fillPublishSelect(select, part);
      refreshStatusButton(statusButton, part, select.value);

      select.addEventListener('change', () => {
        rememberSelection(part, select.value);
        refreshStatusButton(statusButton, part, select.value);
      });
      previewButton.addEventListener('click', () => previewPublish(part, select.value));
      statusButton.addEventListener('click', () => {
        if (!select.value) return;
        togglePlatformPublished(part, select.value);
      });
      card.querySelector('.publish-delete-btn').addEventListener('click', () => deleteConfirmedPart(chapter, index));
      els.partsList.appendChild(card);
    });
  };

  const panel = document.querySelector('.publishing-panel');
  const title = panel?.querySelector('.panel-head h2');
  const note = panel?.querySelector('.panel-head .muted');
  if (title) title.textContent = '已確認文章';
  if (note) note.textContent = '選平台 → 預覽／複製 → 標註該平台已發布。平台狀態彼此獨立。';

  renderParts();
})();