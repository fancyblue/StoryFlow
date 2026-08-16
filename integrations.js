const StoryFlowIntegrations = (() => {
  const DB_NAME = 'storyflow-handles';
  const STORE_NAME = 'handles';
  const OUTPUT_KEY = 'output-directory';
  const PICKER_KEY_STORAGE = 'storyflow.googlePickerApiKey';

  let outputDirectoryHandle = null;
  let accessToken = null;
  let tokenClient = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandle(key, handle) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function verifyPermission(handle, request = false) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (request && (await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  async function restoreOutputDirectory() {
    if (!('showDirectoryPicker' in window) || !window.indexedDB) return { supported: false };
    try {
      outputDirectoryHandle = await loadHandle(OUTPUT_KEY);
      if (!outputDirectoryHandle) return { supported: true, connected: false };
      const connected = await verifyPermission(outputDirectoryHandle, false);
      return { supported: true, connected, name: outputDirectoryHandle.name, needsPermission: !connected };
    } catch (error) {
      console.warn('Unable to restore output directory', error);
      return { supported: true, connected: false };
    }
  }

  async function chooseOutputDirectory() {
    if (!('showDirectoryPicker' in window)) throw new Error('此瀏覽器不支援資料夾直接寫入，請使用 Chrome 或 Edge。');
    outputDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle(OUTPUT_KEY, outputDirectoryHandle);
    return { name: outputDirectoryHandle.name };
  }

  async function ensureOutputPermission() {
    if (!outputDirectoryHandle) outputDirectoryHandle = await loadHandle(OUTPUT_KEY);
    if (!outputDirectoryHandle) return false;
    return verifyPermission(outputDirectoryHandle, true);
  }

  function safeName(value, fallback = 'untitled') {
    const cleaned = String(value || '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
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

  async function savePart({ projectTitle, chapter, part, metadata }) {
    const allowed = await ensureOutputPermission();
    if (!allowed) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');

    const works = await getDirectory(outputDirectoryHandle, 'Works');
    const work = await getDirectory(works, projectTitle);
    const chapterDir = await getDirectory(work, chapter.title);

    await writeTextFile(chapterDir, `${part.title}.md`, part.formatted);
    await writeTextFile(chapterDir, 'metadata.json', JSON.stringify(metadata, null, 2));
    return `${outputDirectoryHandle.name}/Works/${safeName(projectTitle)}/${safeName(chapter.title)}`;
  }

  function googleAvailable() {
    return Boolean(window.google?.accounts?.oauth2 && window.gapi && window.STORYFLOW_CONFIG?.googleClientId);
  }

  function initGoogle() {
    if (!googleAvailable() || tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.STORYFLOW_CONFIG.googleClientId,
      scope: (window.STORYFLOW_CONFIG.googleScopes || []).join(' '),
      callback: () => {}
    });
  }

  function requestAccessToken() {
    initGoogle();
    if (!tokenClient) return Promise.reject(new Error('Google 登入元件尚未載入完成。'));
    return new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response.error) return reject(new Error(response.error_description || response.error));
        accessToken = response.access_token;
        resolve(accessToken);
      };
      tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
    });
  }

  function pickerApiKey() {
    return window.STORYFLOW_CONFIG?.googlePickerApiKey || localStorage.getItem(PICKER_KEY_STORAGE) || '';
  }

  function setPickerApiKey(value) {
    const key = String(value || '').trim();
    if (!key) localStorage.removeItem(PICKER_KEY_STORAGE);
    else localStorage.setItem(PICKER_KEY_STORAGE, key);
    return key;
  }

  function loadPickerApi() {
    return new Promise((resolve, reject) => {
      if (!window.gapi) return reject(new Error('Google API 元件尚未載入完成。'));
      gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Google Picker 載入失敗。')) });
    });
  }

  async function pickGoogleDoc() {
    const key = pickerApiKey();
    if (!key) throw new Error('請先在 StoryFlow 設定中輸入 Google Picker API Key。');
    if (!accessToken) await requestAccessToken();
    await loadPickerApi();

    return new Promise((resolve, reject) => {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes('application/vnd.google-apps.document')
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      const picker = new google.picker.PickerBuilder()
        .setAppId(window.STORYFLOW_CONFIG.googleProjectNumber)
        .setOAuthToken(accessToken)
        .setDeveloperKey(key)
        .addView(view)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) resolve(data.docs[0]);
          if (data.action === google.picker.Action.CANCEL) reject(new Error('已取消選取文件。'));
        })
        .build();
      picker.setVisible(true);
    });
  }

  async function exportGoogleDocAsMarkdown(fileId) {
    if (!accessToken) await requestAccessToken();
    const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/markdown')}`;
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) {
      accessToken = null;
      await requestAccessToken();
      return exportGoogleDocAsMarkdown(fileId);
    }
    if (!response.ok) throw new Error(`Google Docs 匯入失敗（${response.status}）。`);
    return response.text();
  }

  async function importGoogleDoc() {
    const picked = await pickGoogleDoc();
    const markdown = await exportGoogleDocAsMarkdown(picked.id);
    return {
      id: picked.id,
      name: picked.name || 'Google Docs',
      url: picked.url || `https://docs.google.com/document/d/${picked.id}/edit`,
      markdown
    };
  }

  function hasGoogleToken() {
    return Boolean(accessToken);
  }

  return {
    restoreOutputDirectory,
    chooseOutputDirectory,
    ensureOutputPermission,
    savePart,
    requestAccessToken,
    importGoogleDoc,
    pickerApiKey,
    setPickerApiKey,
    hasGoogleToken
  };
})();
