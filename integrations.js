const StoryFlowIntegrations = (() => {
  const SETTINGS_FILENAME = 'settings.json';
  const WORKSPACE_FILENAME = 'workspace.json';
  const WORKSPACE_BACKUP_FILENAME = 'workspace.backup.json';
  const RECOVERY_DIRECTORY = 'Recovery';
  const CONNECTION_DB = 'storyflow-connections-v1';
  const CONNECTION_STORE = 'handles';
  const OUTPUT_HANDLE_KEY = 'storyflow-output-directory';
  let outputDirectoryHandle = null;
  let accessToken = null;
  let tokenClient = null;
  let pickerKey = '';
  let workspaceRevision = null;
  let workspaceWriteQueue = Promise.resolve();
  let workspaceWritesPending = 0;
  let pendingWorkspaceRecovery = null;

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

  async function purgeLegacyBrowserStorage() {
    try {
      ['storyflow.state.v1','storyflow.state.v2','storyflow.state.v3','storyflow.state.v4','storyflow.googlePickerApiKey']
        .forEach(key => localStorage.removeItem(key));
    } catch (_) {}
    // Old experimental databases may have contained obsolete StoryFlow state.
    // The new storyflow-connections-v1 database stores only the directory handle.
    try { indexedDB.deleteDatabase('storyflow-handles'); } catch (_) {}
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

  async function chooseOutputDirectory() {
    if (!('showDirectoryPicker' in window)) throw new Error('此瀏覽器不支援資料夾直接寫入，請使用 Chrome 或 Edge。');
    await hydrateOutputDirectoryHandle();

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

  function validWorkspace(workspace) {
    return Boolean(
      workspace && typeof workspace === 'object' && (
        (workspace.schemaVersion >= 2 && Array.isArray(workspace.projects)) ||
        Array.isArray(workspace.state?.chapters)
      )
    );
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
    const workspace = await readJsonFile(WORKSPACE_FILENAME);
    if (!workspace) return null;
    const backup = backupEnvelope(workspace, reason);
    await writeTextFile(outputDirectoryHandle, WORKSPACE_BACKUP_FILENAME, JSON.stringify(backup, null, 2));
    return backup;
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
    if (!validWorkspace(candidate)) throw new Error('這個檔案不是可辨識的 StoryFlow 工作區。');
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

  purgeLegacyBrowserStorage();

  const api = { restoreOutputDirectory, chooseOutputDirectory, ensureOutputPermission, saveStoryFlowSettings, loadStoryFlowSettings, saveWorkspace, loadWorkspace, backupWorkspace, getWorkspaceRecovery, restoreWorkspaceRecovery, importWorkspace, workspaceSavePending, savePart, requestAccessToken, restoreGoogleAccess, inspectGoogleDoc, refreshChapterSource, pickerApiKey, setPickerApiKey, purgeLegacyBrowserStorage, hasGoogleToken: () => Boolean(accessToken) };
  window.StoryFlowIntegrations = api;
  return api;
})();
