// Publishing queue UX: choose destination -> preview exact output -> copy/mark -> optional delete and rewind.
(function () {
  let deleteFolderHandle = null;

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

  function fillPublishSelect(select, current = '') {
    select.innerHTML = '';
    select.add(new Option('預設設定', ''));
    platforms.forEach(name => select.add(new Option(name, name)));
    select.value = [...select.options].some(option => option.value === current) ? current : '';
  }

  function ensurePublishPreviewDialog() {
    let dialog = document.getElementById('platformPreviewDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'platformPreviewDialog';
      dialog.innerHTML = `
        <div class="dialog-card platform-preview-dialog-card">
          <div class="panel-head"><div><p class="eyebrow">PUBLISH PREVIEW</p><h3 id="platformPreviewTitle">發布預覽</h3></div><button id="closePlatformPreview" class="icon-button" type="button">×</button></div>
          <p id="platformPreviewMeta" class="muted"></p>
          <pre id="platformPreviewContent" class="platform-preview-content"></pre>
          <div class="platform-preview-actions">
            <button id="confirmPlatformCopy" class="button primary" type="button">複製內容</button>
            <button id="copyAndMarkPublished" class="button ghost" type="button">複製並標記已發布</button>
            <button id="cancelPlatformCopy" class="button ghost" type="button">取消</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
    }
    document.getElementById('closePlatformPreview').onclick = () => dialog.close();
    document.getElementById('cancelPlatformCopy').onclick = () => dialog.close();
    return dialog;
  }

  function previewPublish(part, platform) {
    const dialog = ensurePublishPreviewDialog();
    const text = outputFor(part, platform);
    const mark = document.getElementById('copyAndMarkPublished');
    document.getElementById('platformPreviewTitle').textContent = `${part.title} · ${platformLabel(platform)}`;
    document.getElementById('platformPreviewMeta').textContent = platform
      ? '先確認以下內容；複製後可直接標記這個平台已發布。'
      : '這是預設設定的輸出預覽；預設設定不是發布平台，因此不提供已發布狀態。';
    document.getElementById('platformPreviewContent').textContent = text;
    mark.hidden = !platform;

    document.getElementById('confirmPlatformCopy').onclick = async () => {
      await navigator.clipboard.writeText(text);
      dialog.close();
      notify(`已複製 ${platformLabel(platform)} 內容`);
    };
    mark.onclick = async () => {
      await navigator.clipboard.writeText(text);
      part.platformStatus ||= {};
      part.platformStatus[platform] = true;
      part.published = Object.values(part.platformStatus).some(Boolean);
      saveState('發布狀態已更新');
      dialog.close();
      renderAll();
      notify(`已複製並標記 ${platform} 已發布`);
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
      ? `刪除「${part.title}」會造成切篇中間出現缺口。\n\n為保持原稿切點連續，StoryFlow 會一起刪除這篇以及後面的 ${laterCount} 篇，並把切篇進度退回到這篇開始的位置。\n\n確定繼續？`
      : `刪除「${part.title}」？\n\n會從發布清單移除、刪除 Markdown，並把切篇進度退回，讓你重新切這一段。`;
    if (!confirm(message)) return;

    try {
      // First update in-memory structure so metadata written below reflects the remaining parts.
      chapter.parts.splice(index);
      chapter.confirmedBlockCount = chapter.parts.length ? chapter.parts[chapter.parts.length - 1].endBlock : 0;
      suggestion = null;
      await deletePartFiles(chapter, affected);
      saveState('已刪除並退回切篇');
      renderAll();
      if (chapter.draft) suggestNextPart();
      notify(`已刪除 ${affected.length} 篇並退回切篇位置`);
    } catch (error) {
      // Restore state if Drive deletion failed.
      chapter.parts.push(...affected);
      chapter.confirmedBlockCount = chapter.parts.length ? chapter.parts[chapter.parts.length - 1].endBlock : 0;
      renderAll();
      notify(`刪除失敗：${error.message}`, true);
    }
  }

  function statusText(part) {
    const done = platforms.filter(name => part.platformStatus?.[name]);
    return done.length ? `已發布：${done.join('、')}` : '尚未發布';
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
      const card = document.createElement('article');
      card.className = 'publish-card';
      const statusChips = platforms.map(name => `<span class="publish-status-chip ${part.platformStatus?.[name] ? 'done' : ''}">${escapeHtml(name)}${part.platformStatus?.[name] ? ' ✓' : ''}</span>`).join('');
      card.innerHTML = `
        <div class="publish-card-main">
          <div class="publish-card-title"><strong>${escapeHtml(part.title)}</strong><span>${part.chars.toLocaleString()} 字</span></div>
          <div class="publish-status-line">${statusChips || '<span class="muted">尚未設定發布平台</span>'}</div>
        </div>
        <div class="publish-card-action">
          <select class="publish-destination text-input" aria-label="發布格式"></select>
          <button class="button primary tiny publish-preview-btn" type="button">預覽並複製</button>
          <button class="button ghost tiny publish-delete-btn" type="button">刪除</button>
        </div>`;
      const select = card.querySelector('.publish-destination');
      fillPublishSelect(select, platforms.find(name => !part.platformStatus?.[name]) || '');
      card.querySelector('.publish-preview-btn').onclick = () => previewPublish(part, select.value);
      card.querySelector('.publish-delete-btn').onclick = () => deleteConfirmedPart(chapter, index);
      els.partsList.appendChild(card);
    });
  };

  // Publishing panel copy should explain the one clear action path.
  const panel = document.querySelector('.publishing-panel');
  const title = panel?.querySelector('.panel-head h2');
  const note = panel?.querySelector('.panel-head .muted');
  if (title) title.textContent = '已確認文章';
  if (note) note.textContent = '選格式 → 預覽 → 複製；發布後再標記狀態。做錯可刪除並退回重新切篇。';

  renderParts();
})();