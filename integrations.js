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
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
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
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function verifyPermission(handle, request = false) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return Boolean(request && (await handle.requestPermission(opts)) === 'granted');
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

  function requestAccessToken() {
    try { initGoogle(); } catch (error) { return Promise.reject(error); }
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
    if (key) localStorage.setItem(PICKER_KEY_STORAGE, key);
    else localStorage.removeItem(PICKER_KEY_STORAGE);
    return key;
  }

  function loadPickerApi() {
    return new Promise((resolve, reject) => {
      if (!window.gapi) return reject(new Error('Google Picker 元件尚未載入完成，請稍後再試。'));
      gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Google Picker 載入失敗。')) });
    });
  }

  async function pickGoogleDoc() {
    const key = pickerApiKey();
    if (!key) throw new Error('請先在「整合設定」輸入 Google Picker API Key。');
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
          else if (data.action === google.picker.Action.CANCEL) reject(new Error('已取消選取文件。'));
        }).build();
      picker.setVisible(true);
    });
  }

  function docsJsonToPlainText(doc) {
    const lines = [];
    for (const item of doc?.body?.content || []) {
      if (item.paragraph) {
        let text = '';
        for (const element of item.paragraph.elements || []) {
          if (element.textRun?.content) text += element.textRun.content;
        }
        lines.push(text.replace(/\n$/, ''));
      } else if (item.table) {
        for (const row of item.table.tableRows || []) {
          for (const cell of row.tableCells || []) {
            for (const cellItem of cell.content || []) {
              if (!cellItem.paragraph) continue;
              let text = '';
              for (const element of cellItem.paragraph.elements || []) {
                if (element.textRun?.content) text += element.textRun.content;
              }
              lines.push(text.replace(/\n$/, ''));
            }
          }
        }
      }
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  async function readGoogleDocText(fileId) {
    if (!accessToken) await requestAccessToken();
    const endpoint = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}`;
    let response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) {
      accessToken = null;
      await requestAccessToken();
      response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    if (!response.ok) throw new Error(`Google Docs 匯入失敗（${response.status}）。`);
    return docsJsonToPlainText(await response.json());
  }

  async function importGoogleDoc() {
    const picked = await pickGoogleDoc();
    return {
      id: picked.id,
      name: picked.name || 'Google Docs',
      url: picked.url || `https://docs.google.com/document/d/${picked.id}/edit`,
      text: await readGoogleDocText(picked.id)
    };
  }

  return {
    restoreOutputDirectory,
    chooseOutputDirectory,
    ensureOutputPermission,
    savePart,
    requestAccessToken,
    importGoogleDoc,
    readGoogleDocText,
    pickerApiKey,
    setPickerApiKey,
    hasGoogleToken: () => Boolean(accessToken)
  };
})();
