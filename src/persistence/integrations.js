const StoryFlowIntegrations = (() => {
  const SETTINGS_FILENAME = 'settings.json';
  const WORKSPACE_FILENAME = 'workspace.json';
  const WORKSPACE_BACKUP_FILENAME = 'workspace.backup.json';
  const RECOVERY_DIRECTORY = 'Recovery';
  const ROLLING_BACKUP_PREFIX = 'workspace.auto-';
  const ROLLING_BACKUP_LIMIT = 3;
  const ROLLING_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
  const LARGE_IMAGE_BYTES = 8 * 1024 * 1024;
  const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
  const CONNECTION_DB = 'storyflow-connections-v1';
  const CONNECTION_STORE = 'handles';
  const OUTPUT_HANDLE_KEY = 'storyflow-output-directory';
  const LEGACY_BROWSER_STORAGE_KEYS = Object.freeze([
    'storyflow.state.v1',
    'storyflow.state.v2',
    'storyflow.state.v3',
    'storyflow.state.v4',
    'storyflow.googlePickerApiKey'
  ]);
  const LEGACY_DATABASE_NAMES = Object.freeze(['storyflow-handles']);
  let outputDirectoryHandle = null;
  let accessToken = null;
  let tokenClient = null;
  let pickerKey = '';
  let workspaceRevision = null;
  let workspaceWriteQueue = Promise.resolve();
  let workspaceWritesPending = 0;
  let pendingWorkspaceRecovery = null;
  let lastRollingBackupAt = 0;
  let lastRollingWorkspaceContent = null;

  function openConnectionDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(CONNECTION_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CONNECTION_STORE)) db.createObjectStore(CONNECTION_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readPersistedDirectoryHandle() {
    try {
      const db = await openConnectionDb();
      if (!db) return null;
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(CONNECTION_STORE, 'readonly');
        const request = tx.objectStore(CONNECTION_STORE).get(OUTPUT_HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return handle;
    } catch (error) {
      console.warn('StoryFlow could not restore the saved folder handle', error);
      return null;
    }
  }

  async function persistDirectoryHandle(handle) {
    if (!handle) return;
    try {
      const db = await openConnectionDb();
      if (!db) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CONNECTION_STORE, 'readwrite');
        tx.objectStore(CONNECTION_STORE).put(handle, OUTPUT_HANDLE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('StoryFlow could not remember the folder handle', error);
    }
  }

  async function hydrateOutputDirectoryHandle() {
    if (!outputDirectoryHandle) outputDirectoryHandle = await readPersistedDirectoryHandle();
    return outputDirectoryHandle;
  }

  async function inspectLegacyBrowserStorage() {
    const localKeys = [];
    try {
      LEGACY_BROWSER_STORAGE_KEYS.forEach(key => {
        if (localStorage.getItem(key) !== null) localKeys.push(key);
      });
    } catch (_) {}

    let databaseNames = [];
    const databaseInspectionSupported = 'indexedDB' in window && Boolean(indexedDB.databases);
    if (databaseInspectionSupported) {
      try {
        const databases = await indexedDB.databases();
        databaseNames = databases
          .map(database => database?.name || '')
          .filter(name => LEGACY_DATABASE_NAMES.includes(name));
      } catch (_) {}
    }

    return {
      localKeys,
      databaseNames,
      databaseInspectionSupported,
      hasLegacyData: Boolean(localKeys.length || databaseNames.length)
    };
  }

  async function purgeLegacyBrowserStorage() {
    const inspection = await inspectLegacyBrowserStorage();
    return {
      ...inspection,
      removed: false,
      reason: 'disabled-for-data-safety'
    };
  }

  async function verifyPermission(handle, request = false) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return Boolean(request && (await handle.requestPermission(opts)) === 'granted');
  }

  async function restoreOutputDirectory() {
    if (!('showDirectoryPicker' in window)) return { supported: false };
    await hydrateOutputDirectoryHandle();
    if (!outputDirectoryHandle) return { supported: true, connected: false };
    const connected = await verifyPermission(outputDirectoryHandle, false);
    return { supported: true, connected, name: outputDirectoryHandle.name, needsPermission: !connected, remembered: true };
  }

  async function inspectRememberedOutputDirectory() {
    if (!('showDirectoryPicker' in window)) return { supported: false };
    await hydrateOutputDirectoryHandle();
    if (!outputDirectoryHandle) return { supported: true, remembered: false };
    let permission = 'prompt';
    try { permission = await outputDirectoryHandle.queryPermission({ mode: 'readwrite' }); } catch (_) {}
    return {
      supported: true,
      remembered: true,
      name: outputDirectoryHandle.name || '',
      permission
    };
  }

  async function chooseOutputDirectory(options = {}) {
    if (!('showDirectoryPicker' in window)) throw new Error('此瀏覽器不支援資料夾直接寫入，請使用 Chrome 或 Edge。');
    await hydrateOutputDirectoryHandle();

    if (outputDirectoryHandle && options?.reuseRemembered) {
      if (await verifyPermission(outputDirectoryHandle, false) || await verifyPermission(outputDirectoryHandle, true)) {
        await persistDirectoryHandle(outputDirectoryHandle);
        return { name: outputDirectoryHandle.name, restored: true };
      }
      throw new Error('尚未重新授權原本的 StoryFlow 資料夾。');
    }

    // If the browser remembers the folder but needs permission again, reuse the
    // same handle instead of forcing the user through the folder picker again.
    if (outputDirectoryHandle && !(await verifyPermission(outputDirectoryHandle, false))) {
      if (await verifyPermission(outputDirectoryHandle, true)) {
        await persistDirectoryHandle(outputDirectoryHandle);
        return { name: outputDirectoryHandle.name, restored: true };
      }
    }

    // When already connected, an explicit click means the user wants to choose
    // another folder, so open the picker normally.
    outputDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'storyflow-output-directory' });
    await persistDirectoryHandle(outputDirectoryHandle);
    return { name: outputDirectoryHandle.name, restored: false };
  }

  async function ensureOutputPermission() {
    await hydrateOutputDirectoryHandle();
    return outputDirectoryHandle ? verifyPermission(outputDirectoryHandle, true) : false;
  }

  function safeName(value, fallback = 'untitled') {
    const cleaned = String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
  }

  async function getDirectory(parent, name) {
    return parent.getDirectoryHandle(safeName(name), { create: true });
  }

  async function writeTextFile(parent, filename, text) {
    const fileHandle = await parent.getFileHandle(safeName(filename), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function writeBinaryFile(parent, filename, value) {
    const fileHandle = await parent.getFileHandle(safeName(filename), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(value);
    await writable.close();
  }

  async function existingDirectory(parent, name) {
    return parent.getDirectoryHandle(safeName(name), { create: false });
  }

  function imageExtension(filename) {
    const match = String(filename || '').toLocaleLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || '';
  }

  function imageFileSupported(file) {
    return IMAGE_MIME_TYPES.has(String(file?.type || '').toLocaleLowerCase())
      || IMAGE_EXTENSIONS.has(imageExtension(file?.name));
  }

  function imageFilename(filename, fallback = 'image') {
    const source = String(filename || '').trim();
    const extension = imageExtension(source);
    const suffix = extension ? `.${extension}` : '';
    const base = extension ? source.slice(0, -(extension.length + 1)) : source;
    return `${safeName(base, fallback)}${suffix}`;
  }

  async function uniqueFilename(directory, filename) {
    const normalized = imageFilename(filename);
    const extension = imageExtension(normalized);
    const suffix = extension ? `.${extension}` : '';
    const base = extension ? normalized.slice(0, -(extension.length + 1)) : normalized;
    for (let index = 0; index < 10000; index += 1) {
      const candidate = index ? `${base}-${index + 1}${suffix}` : normalized;
      try {
        await directory.getFileHandle(candidate, { create: false });
      } catch (error) {
        if (error?.name === 'NotFoundError') return candidate;
        throw error;
      }
    }
    throw new Error('圖片檔名重複過多，請先重新命名。');
  }

  async function partAssetsDirectory({ projectTitle, chapterTitle, partId }, create = false) {
    const works = create
      ? await getDirectory(outputDirectoryHandle, 'Works')
      : await existingDirectory(outputDirectoryHandle, 'Works');
    const work = create
      ? await getDirectory(works, projectTitle)
      : await existingDirectory(works, projectTitle);
    const chapter = create
      ? await getDirectory(work, chapterTitle)
      : await existingDirectory(work, chapterTitle);
    const assets = create
      ? await getDirectory(chapter, 'assets')
      : await existingDirectory(chapter, 'assets');
    return create
      ? getDirectory(assets, partId)
      : existingDirectory(assets, partId);
  }

  async function visualEntryDirectory({ projectTitle, entryId }, create = false) {
    if (!entryId) throw new Error('這則圖文缺少固定 ID，無法建立私人檔案路徑。');
    const works = create
      ? await getDirectory(outputDirectoryHandle, 'Works')
      : await existingDirectory(outputDirectoryHandle, 'Works');
    const work = create
      ? await getDirectory(works, projectTitle)
      : await existingDirectory(works, projectTitle);
    const visual = create
      ? await getDirectory(work, 'Visual')
      : await existingDirectory(work, 'Visual');
    return create
      ? getDirectory(visual, entryId)
      : existingDirectory(visual, entryId);
  }

  async function visualAssetsDirectory({ projectTitle, entryId }, create = false) {
    const entry = await visualEntryDirectory({ projectTitle, entryId }, create);
    return create ? getDirectory(entry, 'assets') : existingDirectory(entry, 'assets');
  }

  async function importVisualImages({ projectTitle, entryId, files }) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const candidates = Array.from(files || []);
    if (!candidates.length) return [];
    const directory = await visualAssetsDirectory({ projectTitle, entryId }, true);
    const imported = [];
    for (const file of candidates) {
      if (!imageFileSupported(file)) throw new Error(`「${file?.name || '未命名檔案'}」不是支援的圖片格式。`);
      const storedName = await uniqueFilename(directory, file.name || 'image');
      await writeBinaryFile(directory, storedName, file);
      imported.push({
        id: crypto.randomUUID(),
        storedName,
        relativePath: `./assets/${storedName}`,
        mimeType: file.type || '',
        bytes: Number(file.size || 0),
        width: 0,
        height: 0,
        alt: '',
        caption: '',
        placement: 'body',
        createdAt: new Date().toISOString(),
        large: Number(file.size || 0) > LARGE_IMAGE_BYTES
      });
    }
    return imported;
  }

  async function getVisualImageFile({ projectTitle, entryId, storedName }) {
    await hydrateOutputDirectoryHandle();
    if (!outputDirectoryHandle) throw new Error('StoryFlow 尚未連接資料夾。');
    const directory = await visualAssetsDirectory({ projectTitle, entryId }, false);
    const fileHandle = await directory.getFileHandle(safeName(storedName), { create: false });
    return fileHandle.getFile();
  }

  async function removeVisualImage({ projectTitle, entryId, storedName }) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const directory = await visualAssetsDirectory({ projectTitle, entryId }, false);
    const fileHandle = await directory.getFileHandle(safeName(storedName), { create: false });
    const file = await fileHandle.getFile();
    const recovery = await getDirectory(await getDirectory(outputDirectoryHandle, RECOVERY_DIRECTORY), 'Assets');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recoveryName = `${stamp}-${safeName(entryId)}-${imageFilename(storedName)}`;
    await writeBinaryFile(recovery, recoveryName, file);
    await directory.removeEntry(safeName(storedName));
    return `${outputDirectoryHandle.name}/${RECOVERY_DIRECTORY}/Assets/${recoveryName}`;
  }

  async function saveVisualEntry({ projectTitle, entry }) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const normalized = window.StoryFlowContentModel.normalizeVisualEntry(entry);
    const directory = await visualEntryDirectory({ projectTitle, entryId: normalized.id }, true);
    const content = `# ${normalized.title}\n\n${normalized.body}`.trimEnd() + '\n';
    const metadata = {
      schemaVersion: 1,
      id: normalized.id,
      title: normalized.title,
      summary: normalized.summary,
      hashtags: normalized.hashtags,
      tags: normalized.tags,
      afterword: normalized.afterword,
      includeAfterword: normalized.includeAfterword,
      status: normalized.status,
      coverImageId: normalized.coverImageId,
      images: normalized.images,
      platformTitles: normalized.platformTitles,
      platformHashtags: normalized.platformHashtags,
      platformStatus: normalized.platformStatus,
      publicationRecords: normalized.publicationRecords,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt
    };
    await writeTextFile(directory, 'content.md', content);
    await writeTextFile(directory, 'metadata.json', JSON.stringify(metadata, null, 2));
    return `${outputDirectoryHandle.name}/Works/${safeName(projectTitle)}/Visual/${safeName(normalized.id)}`;
  }

  async function removeVisualEntryFiles({ projectTitle, entryId, entry }) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    let directory;
    try {
      directory = await visualEntryDirectory({ projectTitle, entryId }, false);
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
    const content = await readTextFile(directory, 'content.md');
    const metadata = await readTextFile(directory, 'metadata.json');
    const filename = recoveryFilename(`visual-entry-${safeName(entryId)}`);
    const artifactPath = await writeRecoveryArtifact(filename, JSON.stringify({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      reason: 'before-visual-entry-delete',
      projectTitle,
      entry: entry || null,
      content,
      metadata
    }, null, 2));
    for (const filename of ['content.md', 'metadata.json']) {
      try { await directory.removeEntry(filename); }
      catch (error) { if (error?.name !== 'NotFoundError') throw error; }
    }
    return artifactPath;
  }

  async function importPartImages({ projectTitle, chapterTitle, partId, files }) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    if (!partId) throw new Error('這篇文章缺少固定 ID，無法建立圖片資料夾。');
    const candidates = Array.from(files || []);
    if (!candidates.length) return [];
    const directory = await partAssetsDirectory({ projectTitle, chapterTitle, partId }, true);
    const imported = [];
    for (const file of candidates) {
      if (!imageFileSupported(file)) throw new Error(`「${file?.name || '未命名檔案'}」不是支援的圖片格式。`);
      const fileName = await uniqueFilename(directory, file.name || 'image');
      await writeBinaryFile(directory, fileName, file);
      imported.push({
        fileName,
        originalName: file.name || fileName,
        relativePath: `./assets/${safeName(partId)}/${fileName}`,
        mimeType: file.type || '',
        size: Number(file.size || 0),
        large: Number(file.size || 0) > LARGE_IMAGE_BYTES
      });
    }
    return imported;
  }

  async function getPartImageFile({ projectTitle, chapterTitle, partId, fileName }) {
    await hydrateOutputDirectoryHandle();
    if (!outputDirectoryHandle) throw new Error('StoryFlow 尚未連接資料夾。');
    const directory = await partAssetsDirectory({ projectTitle, chapterTitle, partId }, false);
    const fileHandle = await directory.getFileHandle(safeName(fileName), { create: false });
    return fileHandle.getFile();
  }

  async function removePartImage({ projectTitle, chapterTitle, partId, fileName }) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const directory = await partAssetsDirectory({ projectTitle, chapterTitle, partId }, false);
    const fileHandle = await directory.getFileHandle(safeName(fileName), { create: false });
    const file = await fileHandle.getFile();
    const recovery = await getDirectory(await getDirectory(outputDirectoryHandle, RECOVERY_DIRECTORY), 'Assets');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recoveryName = `${stamp}-${safeName(partId)}-${imageFilename(fileName)}`;
    await writeBinaryFile(recovery, recoveryName, file);
    await directory.removeEntry(safeName(fileName));
    return `${outputDirectoryHandle.name}/${RECOVERY_DIRECTORY}/Assets/${recoveryName}`;
  }

  async function readTextFile(parent, filename) {
    try {
      const fileHandle = await parent.getFileHandle(filename, { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  function workspaceSignature(workspace) {
    if (!workspace || typeof workspace !== 'object') return null;
    return workspace.writeRevision || workspace.updatedAt || `legacy:${JSON.stringify(workspace)}`;
  }

  function workspaceContentSignature(workspace) {
    return JSON.stringify(workspace, (key, value) => (
      key === 'updatedAt' || key === 'writeRevision' ? undefined : value
    ));
  }

  function validWorkspace(workspace) {
    const validProjectState = candidate => Boolean(candidate && typeof candidate === 'object' && (
      candidate.contentMode === 'visual' ? Array.isArray(candidate.visualEntries) : Array.isArray(candidate.chapters)
    ));
    return Boolean(
      workspace && typeof workspace === 'object' && (
        (workspace.schemaVersion >= 2 && Array.isArray(workspace.projects)
          && workspace.projects.every(project => validProjectState(project?.state))) ||
        validProjectState(workspace.state)
      )
    );
  }

  function summarizeWorkspace(candidate) {
    const workspace = candidate?.workspace || candidate;
    if (!validWorkspace(workspace)) throw new Error('這個檔案不是可辨識的 StoryFlow 工作區。');
    const projectStates = workspace.schemaVersion >= 2
      ? (workspace.projects || []).map(project => project?.state).filter(Boolean)
      : [workspace.state];
    return {
      schemaVersion: Number(workspace.schemaVersion || 1),
      updatedAt: workspace.updatedAt || null,
      projectCount: projectStates.length,
      chapterCount: projectStates.reduce((total, project) => total + (project?.chapters?.length || 0), 0),
      visualEntryCount: projectStates.reduce((total, project) => total + (project?.visualEntries?.length || 0), 0),
      partCount: projectStates.reduce((total, project) => total + (project?.chapters || [])
        .reduce((chapterTotal, chapter) => chapterTotal + (chapter?.parts?.length || 0), 0), 0)
    };
  }

  function recoveryFilename(kind, extension = 'json') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `workspace.${kind}-${stamp}.${extension}`;
  }

  async function recoveryDirectory() {
    return getDirectory(outputDirectoryHandle, RECOVERY_DIRECTORY);
  }

  async function writeRecoveryArtifact(filename, content) {
    const directory = await recoveryDirectory();
    await writeTextFile(directory, filename, content);
    return `${outputDirectoryHandle.name}/${RECOVERY_DIRECTORY}/${filename}`;
  }

  function backupEnvelope(workspace, reason) {
    return {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      reason,
      workspace
    };
  }

  async function readWorkspaceBackup() {
    const text = await readTextFile(outputDirectoryHandle, WORKSPACE_BACKUP_FILENAME);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      const workspace = parsed?.workspace || parsed;
      return validWorkspace(workspace) ? { envelope: parsed, workspace } : null;
    } catch (_) {
      return null;
    }
  }

  async function readFileRecord(parent, filename) {
    try {
      const handle = await parent.getFileHandle(filename, { create: false });
      const file = await handle.getFile();
      return {
        name: filename,
        text: await file.text(),
        size: Number(file.size || 0),
        lastModified: Number(file.lastModified || 0) || null
      };
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function listRecoveryArtifacts() {
    let directory;
    try {
      directory = await outputDirectoryHandle.getDirectoryHandle(RECOVERY_DIRECTORY, { create: false });
    } catch (error) {
      if (error?.name === 'NotFoundError') return [];
      throw error;
    }
    if (typeof directory.entries !== 'function') return [];

    const artifacts = [];
    for await (const [name, handle] of directory.entries()) {
      if (handle?.kind === 'directory' || !name.startsWith('workspace.')) continue;
      try {
        const file = await handle.getFile();
        artifacts.push({
          name,
          size: Number(file.size || 0),
          lastModified: Number(file.lastModified || 0) || null
        });
      } catch (_) {}
    }
    return artifacts.sort((left, right) => (right.lastModified || 0) - (left.lastModified || 0));
  }


  const STORAGE_CLEANUP_DEFAULT_DAYS = 30;
  const STORAGE_CLEANUP_MAX_DAYS = 3650;

  function normalizeStorageCleanupDays(value) {
    const days = Math.round(Number(value));
    if (!Number.isFinite(days) || days < 1) return STORAGE_CLEANUP_DEFAULT_DAYS;
    return Math.min(days, STORAGE_CLEANUP_MAX_DAYS);
  }

  async function optionalDirectory(parent, name) {
    try {
      return await parent.getDirectoryHandle(safeName(name), { create: false });
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function directoryStorageStats(directory) {
    const stats = { fileCount: 0, bytes: 0, newestModified: 0 };
    if (!directory || typeof directory.entries !== 'function') return stats;
    for await (const [, handle] of directory.entries()) {
      if (handle?.kind === 'directory') {
        const nested = await directoryStorageStats(handle);
        stats.fileCount += nested.fileCount;
        stats.bytes += nested.bytes;
        stats.newestModified = Math.max(stats.newestModified, nested.newestModified);
        continue;
      }
      try {
        const file = await handle.getFile();
        stats.fileCount += 1;
        stats.bytes += Number(file.size || 0);
        stats.newestModified = Math.max(stats.newestModified, Number(file.lastModified || 0));
      } catch (_) {}
    }
    return stats;
  }

  function storageCategory(items) {
    return items.reduce((summary, item) => {
      summary.fileCount += item.fileCount;
      summary.bytes += item.bytes;
      summary.groupCount += 1;
      if (item.eligible) {
        summary.candidateCount += item.fileCount;
        summary.candidateBytes += item.bytes;
        summary.candidateGroupCount += 1;
      }
      return summary;
    }, {
      fileCount: 0,
      bytes: 0,
      groupCount: 0,
      candidateCount: 0,
      candidateBytes: 0,
      candidateGroupCount: 0
    });
  }

  function workspaceProjectStates(workspace) {
    if (!validWorkspace(workspace)) return [];
    if (workspace.schemaVersion >= 2) {
      return (workspace.projects || []).map(project => ({
        title: project?.title || project?.state?.projectTitle || '未命名作品',
        state: project?.state
      })).filter(project => project.state);
    }
    return [{ title: workspace.state?.projectTitle || '未命名作品', state: workspace.state }];
  }

  async function scanWorkspaceStorage(workspace, options = {}) {
    const olderThanDays = normalizeStorageCleanupDays(options.olderThanDays);
    const cutoffAt = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const candidates = [];
    const recoverySnapshots = [];
    const recoveryImages = [];
    const orphanedImages = [];
    const isOldEnough = modified => Boolean(modified && modified <= cutoffAt);

    const recovery = await optionalDirectory(outputDirectoryHandle, RECOVERY_DIRECTORY);
    if (recovery && typeof recovery.entries === 'function') {
      for await (const [name, handle] of recovery.entries()) {
        if (handle?.kind === 'directory') continue;
        if (!name.startsWith('workspace.') || !name.toLocaleLowerCase().endsWith('.json')) continue;
        try {
          const file = await handle.getFile();
          const bytes = Number(file.size || 0);
          const modified = Number(file.lastModified || 0);
          const eligible = !name.startsWith(ROLLING_BACKUP_PREFIX) && isOldEnough(modified);
          const item = {
            category: 'recoverySnapshots',
            kind: 'file',
            parent: recovery,
            name,
            path: RECOVERY_DIRECTORY + '/' + name,
            fileCount: 1,
            bytes,
            eligible
          };
          recoverySnapshots.push(item);
          if (eligible) candidates.push(item);
        } catch (_) {}
      }

      const recoveryAssets = await optionalDirectory(recovery, 'Assets');
      async function collectRecoveryAssets(directory, pathPrefix) {
        if (!directory || typeof directory.entries !== 'function') return;
        for await (const [name, handle] of directory.entries()) {
          const path = pathPrefix + '/' + name;
          if (handle?.kind === 'directory') {
            await collectRecoveryAssets(handle, path);
            continue;
          }
          try {
            const file = await handle.getFile();
            const bytes = Number(file.size || 0);
            const modified = Number(file.lastModified || 0);
            const eligible = isOldEnough(modified);
            const item = {
              category: 'recoveryImages',
              kind: 'file',
              parent: directory,
              name,
              path,
              fileCount: 1,
              bytes,
              eligible
            };
            recoveryImages.push(item);
            if (eligible) candidates.push(item);
          } catch (_) {}
        }
      }
      await collectRecoveryAssets(recoveryAssets, RECOVERY_DIRECTORY + '/Assets');
    }

    const projectStates = workspaceProjectStates(workspace);
    const projectMap = new Map();
    projectStates.forEach(project => {
      const key = safeName(project.title);
      if (!projectMap.has(key)) projectMap.set(key, []);
      projectMap.get(key).push(project.state);
    });

    const works = projectStates.length ? await optionalDirectory(outputDirectoryHandle, 'Works') : null;
    if (works && typeof works.entries === 'function') {
      for await (const [projectName, projectHandle] of works.entries()) {
        if (projectHandle?.kind !== 'directory') continue;
        const states = projectMap.get(projectName) || [];
        const activeVisualEntries = new Set();
        const chapterParts = new Map();

        states.forEach(project => {
          (project?.visualEntries || []).forEach(entry => {
            if (entry?.id) activeVisualEntries.add(safeName(entry.id));
          });
          (project?.chapters || []).forEach(chapter => {
            const chapterName = safeName(chapter?.title);
            if (!chapterParts.has(chapterName)) chapterParts.set(chapterName, new Set());
            (chapter?.parts || []).forEach(part => {
              if (part?.id) chapterParts.get(chapterName).add(safeName(part.id));
            });
          });
        });

        const visual = await optionalDirectory(projectHandle, 'Visual');
        if (visual && typeof visual.entries === 'function') {
          for await (const [entryName, entryHandle] of visual.entries()) {
            if (entryHandle?.kind !== 'directory' || activeVisualEntries.has(entryName)) continue;
            const assets = await optionalDirectory(entryHandle, 'assets');
            const stats = await directoryStorageStats(assets);
            if (!stats.fileCount) continue;
            const eligible = isOldEnough(stats.newestModified);
            const item = {
              category: 'orphanedImages',
              kind: 'directory',
              parent: entryHandle,
              name: 'assets',
              path: 'Works/' + projectName + '/Visual/' + entryName + '/assets',
              fileCount: stats.fileCount,
              bytes: stats.bytes,
              eligible
            };
            orphanedImages.push(item);
            if (eligible) candidates.push(item);
          }
        }

        for await (const [chapterName, chapterHandle] of projectHandle.entries()) {
          if (chapterHandle?.kind !== 'directory' || chapterName === 'Visual') continue;
          const assets = await optionalDirectory(chapterHandle, 'assets');
          if (!assets || typeof assets.entries !== 'function') continue;
          const activePartIds = chapterParts.get(chapterName) || new Set();
          for await (const [partName, partHandle] of assets.entries()) {
            if (partHandle?.kind !== 'directory' || activePartIds.has(partName)) continue;
            const stats = await directoryStorageStats(partHandle);
            if (!stats.fileCount) continue;
            const eligible = isOldEnough(stats.newestModified);
            const item = {
              category: 'orphanedImages',
              kind: 'directory',
              parent: assets,
              name: partName,
              path: 'Works/' + projectName + '/' + chapterName + '/assets/' + partName,
              fileCount: stats.fileCount,
              bytes: stats.bytes,
              eligible
            };
            orphanedImages.push(item);
            if (eligible) candidates.push(item);
          }
        }
      }
    }

    const categories = {
      recoverySnapshots: storageCategory(recoverySnapshots),
      recoveryImages: storageCategory(recoveryImages),
      orphanedImages: storageCategory(orphanedImages)
    };
    const cleanupPreview = Object.values(categories).reduce((summary, category) => ({
      fileCount: summary.fileCount + category.candidateCount,
      bytes: summary.bytes + category.candidateBytes,
      groupCount: summary.groupCount + category.candidateGroupCount
    }), { fileCount: 0, bytes: 0, groupCount: 0 });

    return {
      public: {
        olderThanDays,
        cutoffAt,
        workspaceScanAvailable: projectStates.length > 0,
        categories,
        cleanupPreview
      },
      candidates
    };
  }

  async function cleanupWorkspaceStorage(options = {}) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const olderThanDays = normalizeStorageCleanupDays(options.olderThanDays);
    workspaceWritesPending += 1;
    const task = workspaceWriteQueue.then(async () => {
      const primaryFile = await readFileRecord(outputDirectoryHandle, WORKSPACE_FILENAME);
      let workspace = null;
      if (primaryFile) {
        try {
          const parsed = JSON.parse(primaryFile.text);
          if (validWorkspace(parsed)) workspace = parsed;
        } catch (_) {}
      }
      const scan = await scanWorkspaceStorage(workspace, { olderThanDays });
      const result = { removedFiles: 0, removedBytes: 0, removedGroups: 0, failures: [] };
      for (const candidate of scan.candidates) {
        try {
          await candidate.parent.removeEntry(candidate.name, candidate.kind === 'directory' ? { recursive: true } : undefined);
          result.removedFiles += candidate.fileCount;
          result.removedBytes += candidate.bytes;
          result.removedGroups += 1;
        } catch (error) {
          result.failures.push({ path: candidate.path, message: error?.message || '無法刪除' });
        }
      }
      return result;
    });
    workspaceWriteQueue = task.catch(() => {});
    try {
      const result = await task;
      return {
        ...result,
        olderThanDays,
        storage: await inspectWorkspaceStorage({ olderThanDays })
      };
    } finally {
      workspaceWritesPending = Math.max(0, workspaceWritesPending - 1);
    }
  }

  async function maintainRollingWorkspaceBackup(workspace) {
    const contentSignature = workspaceContentSignature(workspace);
    if (contentSignature === lastRollingWorkspaceContent) return null;
    if (lastRollingBackupAt && Date.now() - lastRollingBackupAt < ROLLING_BACKUP_INTERVAL_MS) return null;

    const existing = (await listRecoveryArtifacts())
      .filter(artifact => artifact.name.startsWith(ROLLING_BACKUP_PREFIX));
    const mostRecentAt = Math.max(lastRollingBackupAt, existing[0]?.lastModified || 0);
    if (mostRecentAt && Date.now() - mostRecentAt < ROLLING_BACKUP_INTERVAL_MS) return null;

    let directory = null;
    if (existing[0]) {
      directory = await recoveryDirectory();
      const latestText = await readTextFile(directory, existing[0].name);
      try {
        const latestWorkspace = JSON.parse(latestText)?.workspace;
        if (validWorkspace(latestWorkspace) && workspaceContentSignature(latestWorkspace) === contentSignature) {
          lastRollingBackupAt = existing[0].lastModified || Date.now();
          lastRollingWorkspaceContent = contentSignature;
          return null;
        }
      } catch (_) {}
    }

    const filename = recoveryFilename('auto');
    const artifactPath = await writeRecoveryArtifact(
      filename,
      JSON.stringify(backupEnvelope(workspace, 'automatic-rolling-backup'), null, 2)
    );
    lastRollingBackupAt = Date.now();
    lastRollingWorkspaceContent = contentSignature;

    directory ||= await recoveryDirectory();
    const rolling = (await listRecoveryArtifacts())
      .filter(artifact => artifact.name.startsWith(ROLLING_BACKUP_PREFIX));
    for (const artifact of rolling.slice(ROLLING_BACKUP_LIMIT)) {
      try { await directory.removeEntry(artifact.name); }
      catch (error) { console.warn('StoryFlow could not prune an old automatic backup', error); }
    }
    return { filename, artifactPath };
  }

  async function inspectWorkspaceStorage(options = {}) {
    if (!outputDirectoryHandle) return { connected: false };
    if (!(await verifyPermission(outputDirectoryHandle, false))) {
      return { connected: false, needsPermission: true, folderName: outputDirectoryHandle.name || '' };
    }
    await workspaceWriteQueue;

    const primaryFile = await readFileRecord(outputDirectoryHandle, WORKSPACE_FILENAME);
    const backupFile = await readFileRecord(outputDirectoryHandle, WORKSPACE_BACKUP_FILENAME);
    let primary = null;
    let primaryWorkspace = null;
    let backup = null;

    if (primaryFile) {
      try {
        const workspace = JSON.parse(primaryFile.text);
        primaryWorkspace = workspace;
        primary = { ...summarizeWorkspace(workspace), valid: true, size: primaryFile.size, lastModified: primaryFile.lastModified };
      } catch (error) {
        primary = { valid: false, size: primaryFile.size, lastModified: primaryFile.lastModified, error: error.message };
      }
    }
    if (backupFile) {
      try {
        const envelope = JSON.parse(backupFile.text);
        backup = {
          ...summarizeWorkspace(envelope),
          valid: true,
          createdAt: envelope?.createdAt || null,
          reason: envelope?.reason || '',
          size: backupFile.size,
          lastModified: backupFile.lastModified
        };
      } catch (error) {
        backup = { valid: false, size: backupFile.size, lastModified: backupFile.lastModified, error: error.message };
      }
    }

    const recoveryArtifacts = await listRecoveryArtifacts();
    const storageUsage = (await scanWorkspaceStorage(primaryWorkspace, options)).public;
    return {
      connected: true,
      folderName: outputDirectoryHandle.name || '',
      primary,
      backup,
      recoveryArtifacts,
      storageUsage,
      rollingBackupCount: recoveryArtifacts.filter(artifact => artifact.name.startsWith(ROLLING_BACKUP_PREFIX)).length
    };
  }

  function announceWorkspaceRecovery(recovery) {
    pendingWorkspaceRecovery = recovery;
    window.dispatchEvent(new CustomEvent('storyflow:workspace-recovery-needed', {
      detail: {
        kind: recovery.kind,
        recoverable: Boolean(recovery.workspace),
        artifactPath: recovery.artifactPath || null
      }
    }));
  }

  async function readJsonFile(filename) {
    if (!(await ensureOutputPermission())) return null;
    try {
      const fileHandle = await outputDirectoryHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return JSON.parse(await file.text());
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function saveStoryFlowSettings(settings) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    await writeTextFile(outputDirectoryHandle, SETTINGS_FILENAME, JSON.stringify(settings, null, 2));
    return `${outputDirectoryHandle.name}/${SETTINGS_FILENAME}`;
  }

  const loadStoryFlowSettings = () => readJsonFile(SETTINGS_FILENAME);

  async function loadWorkspace() {
    if (!(await ensureOutputPermission())) return null;
    if (pendingWorkspaceRecovery?.kind === 'corrupt') return null;
    const text = await readTextFile(outputDirectoryHandle, WORKSPACE_FILENAME);
    if (!text) {
      workspaceRevision = null;
      pendingWorkspaceRecovery = null;
      return null;
    }
    try {
      const workspace = JSON.parse(text);
      if (!validWorkspace(workspace)) throw new Error('workspace.json 缺少可辨識的工作區資料。');
      workspaceRevision = workspaceSignature(workspace);
      pendingWorkspaceRecovery = null;
      return workspace;
    } catch (error) {
      const backup = await readWorkspaceBackup();
      announceWorkspaceRecovery({
        kind: 'corrupt',
        message: error.message,
        rawPrimary: text,
        workspace: backup?.workspace || null,
        backupCreatedAt: backup?.envelope?.createdAt || null
      });
      return null;
    }
  }

  function workspaceError(code, message, recovery = null) {
    const error = new Error(message);
    error.code = code;
    if (recovery?.artifactPath) error.artifactPath = recovery.artifactPath;
    return error;
  }

  async function withWorkspaceWriteLock(callback) {
    if (navigator.locks?.request) {
      return navigator.locks.request('storyflow-workspace-write', { mode: 'exclusive' }, callback);
    }
    return callback();
  }

  async function performWorkspaceWrite(workspace, { force = false, reason = 'workspace-save' } = {}) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');

    if (pendingWorkspaceRecovery?.kind === 'corrupt' && !force) {
      throw workspaceError('WORKSPACE_CORRUPT', 'workspace.json 無法讀取，請先完成工作區恢復。');
    }

    if (pendingWorkspaceRecovery?.kind === 'conflict' && !force) {
      pendingWorkspaceRecovery.workspace = structuredClone(workspace);
      await writeRecoveryArtifact(
        pendingWorkspaceRecovery.artifactFilename,
        JSON.stringify(backupEnvelope(pendingWorkspaceRecovery.workspace, 'unsaved-conflict-copy'), null, 2)
      );
      throw workspaceError('WORKSPACE_CONFLICT', '偵測到較新的工作區版本，已停止覆蓋並保留本次修改。', pendingWorkspaceRecovery);
    }

    const currentText = await readTextFile(outputDirectoryHandle, WORKSPACE_FILENAME);
    let current = null;
    if (currentText) {
      try {
        current = JSON.parse(currentText);
        if (!validWorkspace(current)) throw new Error('workspace.json 缺少可辨識的工作區資料。');
      } catch (error) {
        if (!force) {
          announceWorkspaceRecovery({
            kind: 'corrupt',
            message: error.message,
            rawPrimary: currentText,
            workspace: (await readWorkspaceBackup())?.workspace || null
          });
          throw workspaceError('WORKSPACE_CORRUPT', 'workspace.json 無法讀取，請先完成工作區恢復。');
        }
      }
    }

    const currentRevision = workspaceSignature(current);
    if (!force && workspaceRevision != null && currentRevision !== workspaceRevision) {
      const artifactFilename = recoveryFilename('conflict');
      const localWorkspace = structuredClone(workspace);
      const artifactPath = await writeRecoveryArtifact(
        artifactFilename,
        JSON.stringify(backupEnvelope(localWorkspace, 'unsaved-conflict-copy'), null, 2)
      );
      const recovery = {
        kind: 'conflict',
        workspace: localWorkspace,
        diskWorkspace: current,
        artifactFilename,
        artifactPath
      };
      announceWorkspaceRecovery(recovery);
      throw workspaceError('WORKSPACE_CONFLICT', '偵測到其他分頁或裝置寫入的較新版本，已停止覆蓋。', recovery);
    }

    if (current) {
      await writeTextFile(
        outputDirectoryHandle,
        WORKSPACE_BACKUP_FILENAME,
        JSON.stringify(backupEnvelope(current, `before-${reason}`), null, 2)
      );
    }

    const next = structuredClone(workspace);
    next.updatedAt = new Date().toISOString();
    next.writeRevision = crypto.randomUUID();
    await writeTextFile(outputDirectoryHandle, WORKSPACE_FILENAME, JSON.stringify(next, null, 2));
    if (!current) {
      await writeTextFile(
        outputDirectoryHandle,
        WORKSPACE_BACKUP_FILENAME,
        JSON.stringify(backupEnvelope(next, 'initial-workspace-save'), null, 2)
      );
    }
    if (current) {
      try { await maintainRollingWorkspaceBackup(next); }
      catch (error) { console.warn('StoryFlow could not create an automatic rolling backup', error); }
    }
    workspaceRevision = workspaceSignature(next);
    pendingWorkspaceRecovery = null;
    window.dispatchEvent(new CustomEvent('storyflow:workspace-write-complete', {
      detail: { revision: workspaceRevision, reason }
    }));
    return `${outputDirectoryHandle.name}/${WORKSPACE_FILENAME}`;
  }

  function saveWorkspace(workspace, options = {}) {
    const snapshot = structuredClone(workspace);
    workspaceWritesPending += 1;
    const task = workspaceWriteQueue.then(() => withWorkspaceWriteLock(() => performWorkspaceWrite(snapshot, options)));
    workspaceWriteQueue = task.catch(() => {});
    return task.finally(() => { workspaceWritesPending = Math.max(0, workspaceWritesPending - 1); });
  }

  async function backupWorkspace(reason = 'manual-backup') {
    if (!(await ensureOutputPermission())) return null;
    await workspaceWriteQueue;
    const workspace = await readJsonFile(WORKSPACE_FILENAME);
    if (!workspace) return null;
    const backup = backupEnvelope(workspace, reason);
    await writeTextFile(outputDirectoryHandle, WORKSPACE_BACKUP_FILENAME, JSON.stringify(backup, null, 2));
    return backup;
  }

  async function createWorkspaceRecoverySnapshot(reason = 'before-source-sync') {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    await workspaceWriteQueue;
    const currentText = await readTextFile(outputDirectoryHandle, WORKSPACE_FILENAME);
    if (!currentText) throw new Error('目前資料夾中沒有可建立快照的 workspace.json。');
    const workspace = JSON.parse(currentText);
    summarizeWorkspace(workspace);
    const filename = recoveryFilename(reason);
    const createdAt = new Date().toISOString();
    const artifactPath = await writeRecoveryArtifact(
      filename,
      JSON.stringify({ ...backupEnvelope(workspace, reason), createdAt }, null, 2)
    );
    return { filename, artifactPath, createdAt };
  }

  async function exportWorkspaceFile() {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾讀取權限。');
    await workspaceWriteQueue;
    const text = await readTextFile(outputDirectoryHandle, WORKSPACE_FILENAME);
    if (!text) throw new Error('目前資料夾中沒有 workspace.json。');
    summarizeWorkspace(JSON.parse(text));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return { filename: `storyflow-workspace-${stamp}.json`, text };
  }

  async function restoreLatestWorkspaceBackup() {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    await workspaceWriteQueue;
    const backup = await readWorkspaceBackup();
    if (!backup?.workspace) throw new Error('目前沒有可使用的 workspace.backup.json。');

    const currentText = await readTextFile(outputDirectoryHandle, WORKSPACE_FILENAME);
    const artifactPath = currentText
      ? await writeRecoveryArtifact(recoveryFilename('before-backup-restore'), currentText)
      : null;
    await saveWorkspace(backup.workspace, { force: true, reason: 'manual-backup-restore' });
    return { backupCreatedAt: backup.envelope?.createdAt || null, artifactPath };
  }

  function getWorkspaceRecovery() {
    if (!pendingWorkspaceRecovery) return null;
    return {
      kind: pendingWorkspaceRecovery.kind,
      recoverable: Boolean(pendingWorkspaceRecovery.workspace),
      backupCreatedAt: pendingWorkspaceRecovery.backupCreatedAt || null,
      artifactPath: pendingWorkspaceRecovery.artifactPath || null,
      message: pendingWorkspaceRecovery.message || ''
    };
  }

  async function restoreWorkspaceRecovery(strategy = 'backup') {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    await workspaceWriteQueue;
    const recovery = pendingWorkspaceRecovery;
    if (!recovery) throw new Error('目前沒有待處理的工作區恢復。');

    let workspace = null;
    if (strategy === 'backup' && recovery.kind === 'corrupt') workspace = recovery.workspace;
    if (strategy === 'local' && recovery.kind === 'conflict') workspace = recovery.workspace;
    if (!validWorkspace(workspace)) throw new Error('找不到可恢復的工作區內容。');

    const currentText = await readTextFile(outputDirectoryHandle, WORKSPACE_FILENAME);
    if (currentText) {
      const filename = recoveryFilename(recovery.kind === 'corrupt' ? 'corrupt' : 'replaced');
      await writeRecoveryArtifact(filename, currentText);
    }
    await saveWorkspace(workspace, { force: true, reason: `recovery-${strategy}` });
    pendingWorkspaceRecovery = null;
    return true;
  }

  async function importWorkspace(workspace) {
    const candidate = workspace?.workspace || workspace;
    summarizeWorkspace(candidate);
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    await workspaceWriteQueue;
    const currentText = await readTextFile(outputDirectoryHandle, WORKSPACE_FILENAME);
    if (currentText) await writeRecoveryArtifact(recoveryFilename('before-import'), currentText);
    await saveWorkspace(candidate, { force: true, reason: 'workspace-import' });
    pendingWorkspaceRecovery = null;
    return true;
  }

  function workspaceSavePending() {
    return workspaceWritesPending > 0;
  }

  async function savePart({ projectTitle, chapter, part, metadata }) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    const works = await getDirectory(outputDirectoryHandle, 'Works');
    const work = await getDirectory(works, projectTitle);
    const chapterDir = await getDirectory(work, chapter.title);
    await writeTextFile(chapterDir, `${part.title}.md`, part.formatted);
    await writeTextFile(chapterDir, 'metadata.json', JSON.stringify(metadata, null, 2));
    return `${outputDirectoryHandle.name}/Works/${safeName(projectTitle)}/${safeName(chapter.title)}`;
  }

  function initGoogle() {
    if (tokenClient) return;
    if (!window.google?.accounts?.oauth2 || !window.STORYFLOW_CONFIG?.googleClientId) throw new Error('Google 登入元件尚未載入完成，請稍後再試。');
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.STORYFLOW_CONFIG.googleClientId,
      scope: (window.STORYFLOW_CONFIG.googleScopes || []).join(' '),
      callback: () => {}
    });
  }

  function waitForGoogleIdentity(timeout = 5000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.google?.accounts?.oauth2) return resolve();
        if (Date.now() - started >= timeout) return reject(new Error('Google 登入元件尚未載入完成。'));
        window.setTimeout(check, 100);
      };
      check();
    });
  }

  async function requestAccessToken(options = {}) {
    await waitForGoogleIdentity();
    try { initGoogle(); } catch (error) { return Promise.reject(error); }
    const prompt = options.prompt != null ? options.prompt : (accessToken || options.silent ? '' : 'consent');
    return new Promise((resolve, reject) => {
      tokenClient.callback = response => {
        if (response.error) return reject(new Error(response.error_description || response.error));
        accessToken = response.access_token;
        resolve(accessToken);
      };
      tokenClient.requestAccessToken({ prompt });
    });
  }

  async function restoreGoogleAccess() {
    if (accessToken) return true;
    try {
      await requestAccessToken({ silent: true, prompt: '' });
      return Boolean(accessToken);
    } catch (_) {
      return false;
    }
  }

  function pickerApiKey() { return pickerKey; }
  function setPickerApiKey(value) { pickerKey = String(value || '').trim(); return pickerKey; }

  function loadPickerApi() {
    return new Promise((resolve, reject) => {
      if (!window.gapi) return reject(new Error('Google Picker 元件尚未載入完成，請稍後再試。'));
      gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Google Picker 載入失敗。')) });
    });
  }

  async function pickGoogleDoc() {
    const key = pickerApiKey();
    if (!key) throw new Error('請先連接 StoryFlow 資料夾，並在整合設定輸入 Google Picker API Key。');
    if (!accessToken) {
      const restored = await restoreGoogleAccess();
      if (!restored) await requestAccessToken();
    }
    await loadPickerApi();
    return new Promise((resolve, reject) => {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes('application/vnd.google-apps.document')
        .setIncludeFolders(false).setSelectFolderEnabled(false);
      const picker = new google.picker.PickerBuilder()
        .setAppId(window.STORYFLOW_CONFIG.googleProjectNumber)
        .setOAuthToken(accessToken).setDeveloperKey(key).addView(view)
        .setCallback(data => {
          if (data.action === google.picker.Action.PICKED) resolve(data.docs[0]);
          else if (data.action === google.picker.Action.CANCEL) reject(new Error('已取消選取文件。'));
        }).build();
      picker.setVisible(true);
    });
  }

  async function authenticatedFetch(url) {
    if (!accessToken) {
      const restored = await restoreGoogleAccess();
      if (!restored) await requestAccessToken();
    }
    let response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) {
      accessToken = null;
      const restored = await restoreGoogleAccess();
      if (!restored) await requestAccessToken();
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    return response;
  }

  async function fetchGoogleDocument(fileId) {
    const response = await authenticatedFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}?includeTabsContent=true`);
    if (!response.ok) throw new Error(`Google Docs 讀取失敗（${response.status}）。`);
    return response.json();
  }

  function escapeMarkdown(text) { return String(text || '').replace(/([\\`])/g, '\\$1'); }
  function styleText(text, style, warnings) {
    let value = escapeMarkdown(text);
    if (!value) return '';
    if (style?.weightedFontFamily?.fontFamily) warnings.add('原稿含有字型設定；StoryFlow 會保留文字內容，但不保存字型。');
    if (style?.strikethrough) value = `~~${value}~~`;
    if (style?.bold && style?.italic) value = `***${value}***`;
    else if (style?.bold) value = `**${value}**`;
    else if (style?.italic) value = `*${value}*`;
    if (style?.link?.url) value = `[${value}](${style.link.url})`;
    return value;
  }

  function paragraphToBlock(paragraph, inlineObjects, warnings) {
    const namedStyle = paragraph?.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';
    let markdown = '', plain = '';
    for (const element of paragraph?.elements || []) {
      if (element.textRun) {
        const text = (element.textRun.content || '').replace(/\n$/, '');
        markdown += styleText(text, element.textRun.textStyle || {}, warnings); plain += text;
      } else if (element.inlineObjectElement) {
        const objectId = element.inlineObjectElement.inlineObjectId;
        const object = inlineObjects?.[objectId];
        const title = object?.inlineObjectProperties?.embeddedObject?.title || '圖片';
        markdown += `![${title}](storyflow-google-image:${objectId})`; plain += '[圖片]';
        warnings.add('原稿含有 Google Docs 內嵌圖片；目前會先保留圖片位置，圖片檔下載會在後續版本接上。');
      }
    }
    return { markdown: markdown.trimEnd(), plain: plain.trimEnd(), namedStyle, empty: !plain.trim() && !markdown.trim() };
  }

  function detectChapterHeadingStyle(blocks) {
    const counts = new Map();
    for (const block of blocks) {
      const match = /^HEADING_([1-6])$/.exec(block.namedStyle || '');
      if (!match || block.empty) continue;
      const level = Number(match[1]);
      const current = counts.get(level) || 0;
      counts.set(level, current + 1);
    }
    const levels = [...counts.keys()].sort((a, b) => a - b);
    if (!levels.length) return null;
    // A single document title may use a shallow heading while chapters use a
    // deeper repeated heading. Prefer the shallowest level that repeats.
    const repeated = levels.find(level => counts.get(level) >= 2);
    const selected = repeated ?? levels[0];
    return `HEADING_${selected}`;
  }

  function blocksToDraft(blocks, chapterHeadingStyle = null) {
    const lines = [];
    for (const block of blocks) {
      if (block.empty) {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      } else if (!chapterHeadingStyle || block.namedStyle !== chapterHeadingStyle) {
        lines.push(block.markdown);
      }
    }
    while (lines[0] === '') lines.shift();
    while (lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  function chaptersFromTab(tab) {
    const content = tab?.documentTab?.body?.content || [], inlineObjects = tab?.documentTab?.inlineObjects || {}, warnings = new Set(), blocks = [];
    for (const structural of content) if (structural.paragraph) blocks.push(paragraphToBlock(structural.paragraph, inlineObjects, warnings));

    const headingStyle = detectChapterHeadingStyle(blocks);
    const headingIndexes = [];
    if (headingStyle) {
      blocks.forEach((block, index) => {
        if (block.namedStyle === headingStyle && !block.empty) headingIndexes.push(index);
      });
    }

    if (!headingIndexes.length) {
      return {
        chapters: [{ title: tab.tabProperties?.title || '未命名章節', draft: blocksToDraft(blocks), headingOrdinal: null }],
        warnings: [...warnings]
      };
    }

    return {
      chapters: headingIndexes.map((start, ordinal) => ({
        title: blocks[start].plain.trim() || `第 ${ordinal + 1} 章`,
        draft: blocksToDraft(blocks.slice(start + 1, headingIndexes[ordinal + 1] ?? blocks.length), headingStyle),
        headingOrdinal: ordinal,
        headingStyle
      })),
      warnings: [...warnings]
    };
  }

  function flattenTabs(tabs, depth = 0, output = []) {
    for (const tab of tabs || []) {
      const parsed = chaptersFromTab(tab);
      output.push({ id: tab.tabProperties?.tabId, title: tab.tabProperties?.title || '未命名分頁', index: tab.tabProperties?.index ?? output.length, depth, chapters: parsed.chapters, warnings: parsed.warnings });
      flattenTabs(tab.childTabs || [], depth + 1, output);
    }
    return output;
  }

  async function inspectGoogleDoc() {
    const picked = await pickGoogleDoc(), document = await fetchGoogleDocument(picked.id);
    return { id: picked.id, name: picked.name || document.title || 'Google Docs', url: picked.url || `https://docs.google.com/document/d/${picked.id}/edit`, title: document.title || picked.name || 'Google Docs', tabs: flattenTabs(document.tabs || []) };
  }

  async function refreshChapterSource(source) {
    if (!source?.id || !source?.tabId) throw new Error('這個章節沒有完整的 Google Docs 來源資訊。');
    const document = await fetchGoogleDocument(source.id), tabs = flattenTabs(document.tabs || []), tab = tabs.find(item => item.id === source.tabId);
    if (!tab) throw new Error('找不到原本的 Google Docs 分頁，可能已被刪除或重新建立。');
    let chapter = source.headingOrdinal != null ? tab.chapters[source.headingOrdinal] : null;
    if (!chapter && source.headingTitle) chapter = tab.chapters.find(item => item.title === source.headingTitle);
    if (!chapter && tab.chapters.length === 1) chapter = tab.chapters[0];
    if (!chapter) throw new Error('找不到原本的章節標題，請重新匯入這個分頁。');
    return { ...chapter, tabTitle: tab.title, warnings: tab.warnings };
  }

  // Browser startup is intentionally non-destructive. Legacy data remains available
  // until a future explicit, Recovery-backed migration is designed.
  const api = { restoreOutputDirectory, inspectRememberedOutputDirectory, chooseOutputDirectory, ensureOutputPermission, saveStoryFlowSettings, loadStoryFlowSettings, saveWorkspace, loadWorkspace, backupWorkspace, createWorkspaceRecoverySnapshot, inspectWorkspaceStorage, cleanupWorkspaceStorage, summarizeWorkspace, exportWorkspaceFile, restoreLatestWorkspaceBackup, getWorkspaceRecovery, restoreWorkspaceRecovery, importWorkspace, workspaceSavePending, savePart, importPartImages, getPartImageFile, removePartImage, saveVisualEntry, importVisualImages, getVisualImageFile, removeVisualImage, removeVisualEntryFiles, requestAccessToken, restoreGoogleAccess, inspectGoogleDoc, refreshChapterSource, pickerApiKey, setPickerApiKey, inspectLegacyBrowserStorage, purgeLegacyBrowserStorage, hasGoogleToken: () => Boolean(accessToken), LARGE_IMAGE_BYTES, STORAGE_CLEANUP_DEFAULT_DAYS };
  window.StoryFlowIntegrations = api;
  return api;
})();
