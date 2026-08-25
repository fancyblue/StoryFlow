// Publishing deletion reuses the StoryFlow folder that is already connected.
// The legacy publishing flow used its own showDirectoryPicker(), which forced users
// to select the same folder again just to remove a Markdown file.
(function () {
  const DB_NAME = 'storyflow-connections-v1';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'storyflow-output-directory';
  let rememberedHandle = null;

  function safeName(value, fallback = 'untitled') {
    const cleaned = String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
  }

  function partKey(part) {
    return part?.id || `${part?.title || 'part'}:${part?.startBlock ?? ''}:${part?.endBlock ?? ''}`;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readRememberedHandle() {
    if (rememberedHandle) return rememberedHandle;
    try {
      const db = await openDb();
      if (!db || !db.objectStoreNames.contains(STORE_NAME)) {
        db?.close?.();
        return null;
      }
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      rememberedHandle = handle || null;
      return rememberedHandle;
    } catch (error) {
      console.warn('StoryFlow publishing delete could not restore folder handle', error);
      return null;
    }
  }

  // Hydrate early so a delete click never has to open a second folder picker.
  readRememberedHandle();

  async function connectedRootHandle() {
    const integrations = typeof StoryFlowIntegrations !== 'undefined'
      ? StoryFlowIntegrations
      : window.StoryFlowIntegrations;
    if (!integrations) throw new Error('StoryFlow 資料夾連線尚未初始化。');

    const status = await integrations.restoreOutputDirectory();
    if (!status?.connected) {
      const granted = await integrations.ensureOutputPermission?.();
      if (!granted) throw new Error('StoryFlow 資料夾目前沒有寫入權限，請先重新連接資料夾。');
    }

    const handle = await readRememberedHandle();
    if (!handle) throw new Error('找不到目前 StoryFlow 資料夾連線，請先重新連接資料夾。');
    return handle;
  }

  async function openExistingDirectory(parent, name) {
    return parent.getDirectoryHandle(safeName(name), { create: false });
  }

  async function deletePartFiles(chapter, parts) {
    const root = await connectedRootHandle();
    const works = await openExistingDirectory(root, 'Works');
    const work = await openExistingDirectory(works, state.projectTitle);
    const chapterDir = await openExistingDirectory(work, chapter.title);

    for (const part of parts) {
      try {
        await chapterDir.removeEntry(safeName(`${part.title}.md`));
      } catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
      }
    }

    const metadataHandle = await chapterDir.getFileHandle('metadata.json', { create: true });
    const writable = await metadataHandle.createWritable();
    await writable.write(JSON.stringify(chapterMetadata(chapter), null, 2));
    await writable.close();
  }

  function findEntryFromButton(button) {
    const card = button.closest('.publish-list-item');
    const key = card?.dataset?.partKey;
    if (!key || typeof state === 'undefined') return null;

    for (const chapter of state.chapters || []) {
      const index = (chapter.parts || []).findIndex(part => partKey(part) === key);
      if (index >= 0) return { chapter, index, part: chapter.parts[index] };
    }
    return null;
  }

  async function deleteConfirmedPart(entry) {
    const { chapter, index, part } = entry;
    const affected = chapter.parts.slice(index);
    const laterCount = affected.length - 1;
    const message = laterCount
      ? `刪除「${part.title}」會使後續切點失去連續性。\n\n因此會一起移除這篇之後的 ${laterCount} 篇，並退回到「${part.title}」開始的位置重新切篇。\n\n確定繼續？`
      : `刪除「${part.title}」？\n\n會移除 Markdown，並把切篇進度退回，讓你重新處理這一段。`;
    if (!confirm(message)) return;

    try {
      const prepare = window.StoryFlowProjectPersistence?.prepareRecovery;
      if (typeof prepare !== 'function') throw new Error('Recovery 安全元件尚未準備完成。');
      await prepare('before-publishing-delete');
    } catch (error) {
      notify(`尚未刪除文章：無法建立 Recovery 安全副本（${error.message}）`, true);
      return;
    }

    try {
      chapter.parts.splice(index);
      chapter.confirmedBlockCount = chapter.parts.length ? chapter.parts[chapter.parts.length - 1].endBlock : 0;
      await deletePartFiles(chapter, affected);
      state.activeChapterId = chapter.id;
      suggestion = null;
      saveState('已刪除並退回切篇');
      renderAll();
      if (chapter.draft) suggestNextPart();
      window.renderParts?.();
      notify(`已刪除 ${affected.length} 篇，發布清單已更新`);
    } catch (error) {
      chapter.parts.push(...affected);
      chapter.confirmedBlockCount = chapter.parts.length ? chapter.parts[chapter.parts.length - 1].endBlock : 0;
      window.renderParts?.();
      notify(`刪除失敗：${error.message}`, true);
    }
  }

  // Capture the delete action before publishing-flow's legacy handler asks for a
  // separate directory. All other publishing interactions continue unchanged.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('.publish-delete-btn');
    if (!button) return;
    const entry = findEntryFromButton(button);
    if (!entry) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    deleteConfirmedPart(entry);
  }, true);
})();
