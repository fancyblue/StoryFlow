const StoryFlowIntegrations = (() => {
  const DB_NAME = 'storyflow-handles';
  const STORE_NAME = 'handles';
  const OUTPUT_KEY = 'output-directory';
  const PICKER_KEY_STORAGE = 'storyflow.googlePickerApiKey';
  const SETTINGS_FILENAME = 'settings.json';
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

  async function saveStoryFlowSettings(settings) {
    if (!(await ensureOutputPermission())) throw new Error('StoryFlow 尚未取得輸出資料夾寫入權限。');
    await writeTextFile(outputDirectoryHandle, SETTINGS_FILENAME, JSON.stringify(settings, null, 2));
    return `${outputDirectoryHandle.name}/${SETTINGS_FILENAME}`;
  }

  async function loadStoryFlowSettings() {
    if (!(await ensureOutputPermission())) return null;
    try {
      const fileHandle = await outputDirectoryHandle.getFileHandle(SETTINGS_FILENAME);
      const file = await fileHandle.getFile();
      return JSON.parse(await file.text());
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
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
    if (!window.google?.accounts?.oauth2 || !window.STORYFLOW_CONFIG?.googleClientId) {
      throw new Error('Google 登入元件尚未載入完成，請稍後再試。');
    }
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

  async function authenticatedFetch(url) {
    if (!accessToken) await requestAccessToken();
    let response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) {
      accessToken = null;
      await requestAccessToken();
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    return response;
  }

  async function fetchGoogleDocument(fileId) {
    const endpoint = `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}?includeTabsContent=true`;
    const response = await authenticatedFetch(endpoint);
    if (!response.ok) throw new Error(`Google Docs 讀取失敗（${response.status}）。`);
    return response.json();
  }

  function escapeMarkdown(text) {
    return String(text || '').replace(/([\\`])/g, '\\$1');
  }

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
    let markdown = '';
    let plain = '';
    for (const element of paragraph?.elements || []) {
      if (element.textRun) {
        const raw = element.textRun.content || '';
        const text = raw.replace(/\n$/, '');
        markdown += styleText(text, element.textRun.textStyle || {}, warnings);
        plain += text;
      } else if (element.inlineObjectElement) {
        const objectId = element.inlineObjectElement.inlineObjectId;
        const object = inlineObjects?.[objectId];
        const title = object?.inlineObjectProperties?.embeddedObject?.title || '圖片';
        markdown += `![${title}](storyflow-google-image:${objectId})`;
        plain += '[圖片]';
        warnings.add('原稿含有 Google Docs 內嵌圖片；目前會先保留圖片位置，圖片檔下載會在後續版本接上。');
      }
    }
    const empty = plain.trim().length === 0 && markdown.trim().length === 0;
    return { markdown: markdown.trimEnd(), plain: plain.trimEnd(), namedStyle, empty };
  }

  function blocksToDraft(blocks) {
    const lines = [];
    for (const block of blocks) {
      if (block.empty) {
        if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      } else if (!/^HEADING_[1-6]$/.test(block.namedStyle)) {
        lines.push(block.markdown);
      }
    }
    while (lines[0] === '') lines.shift();
    while (lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  function chaptersFromTab(tab) {
    const content = tab?.documentTab?.body?.content || [];
    const inlineObjects = tab?.documentTab?.inlineObjects || {};
    const warnings = new Set();
    const blocks = [];
    for (const structural of content) {
      if (structural.paragraph) blocks.push(paragraphToBlock(structural.paragraph, inlineObjects, warnings));
    }
    const headingIndexes = [];
    blocks.forEach((block, index) => {
      if (block.namedStyle === 'HEADING_1' && !block.empty) headingIndexes.push(index);
    });
    if (!headingIndexes.length) {
      return {
        chapters: [{ title: tab.tabProperties?.title || '未命名章節', draft: blocksToDraft(blocks), headingOrdinal: null }],
        warnings: [...warnings]
      };
    }
    return {
      chapters: headingIndexes.map((start, ordinal) => {
        const end = headingIndexes[ordinal + 1] ?? blocks.length;
        return {
          title: blocks[start].plain.trim() || `第 ${ordinal + 1} 章`,
          draft: blocksToDraft(blocks.slice(start + 1, end)),
          headingOrdinal: ordinal
        };
      }),
      warnings: [...warnings]
    };
  }

  function flattenTabs(tabs, depth = 0, output = []) {
    for (const tab of tabs || []) {
      const parsed = chaptersFromTab(tab);
      output.push({
        id: tab.tabProperties?.tabId,
        title: tab.tabProperties?.title || '未命名分頁',
        index: tab.tabProperties?.index ?? output.length,
        depth,
        chapters: parsed.chapters,
        warnings: parsed.warnings
      });
      flattenTabs(tab.childTabs || [], depth + 1, output);
    }
    return output;
  }

  async function inspectGoogleDoc() {
    const picked = await pickGoogleDoc();
    const document = await fetchGoogleDocument(picked.id);
    return {
      id: picked.id,
      name: picked.name || document.title || 'Google Docs',
      url: picked.url || `https://docs.google.com/document/d/${picked.id}/edit`,
      title: document.title || picked.name || 'Google Docs',
      tabs: flattenTabs(document.tabs || [])
    };
  }

  async function refreshChapterSource(source) {
    if (!source?.id || !source?.tabId) throw new Error('這個章節沒有完整的 Google Docs 來源資訊。');
    const document = await fetchGoogleDocument(source.id);
    const tabs = flattenTabs(document.tabs || []);
    const tab = tabs.find(item => item.id === source.tabId);
    if (!tab) throw new Error('找不到原本的 Google Docs 分頁，可能已被刪除或重新建立。');
    let chapter = null;
    if (source.headingOrdinal != null) chapter = tab.chapters[source.headingOrdinal];
    if (!chapter && source.headingTitle) chapter = tab.chapters.find(item => item.title === source.headingTitle);
    if (!chapter && tab.chapters.length === 1) chapter = tab.chapters[0];
    if (!chapter) throw new Error('找不到原本的章節 Heading，請重新匯入這個分頁。');
    return { ...chapter, tabTitle: tab.title, warnings: tab.warnings };
  }

  return {
    restoreOutputDirectory,
    chooseOutputDirectory,
    ensureOutputPermission,
    saveStoryFlowSettings,
    loadStoryFlowSettings,
    savePart,
    requestAccessToken,
    inspectGoogleDoc,
    refreshChapterSource,
    pickerApiKey,
    setPickerApiKey,
    hasGoogleToken: () => Boolean(accessToken)
  };
})();