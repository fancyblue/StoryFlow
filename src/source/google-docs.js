// Google sign-in, Picker and Google Docs import. Kept apart from the folder and workspace I/O in
// integrations.js because the two share nothing: this half holds only the session's access
// token, the token client and the Picker key, and never touches the StoryFlow folder. Its
// methods join StoryFlowIntegrations here, before anything that wraps them loads
// (session-auth, settings-sync, google-auth, mobile-google-auth), so callers and wrappers see
// one API as before. Google Docs are source inputs only: nothing here edits or deletes them.
(function () {
  let accessToken = null;
  let tokenClient = null;
  let pickerKey = '';

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

  // Photos for visual works stay in the writer's Google Drive (REDESIGN_PROPOSAL C3). The
  // Picker grants this app the files it returns under the drive.file scope it already holds;
  // StoryFlow keeps only their ids and reads an image into the tab's memory when it is shown.
  // Nothing here writes, moves, renames or deletes a Drive file.
  const DRIVE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const DRIVE_PHOTO_FIELDS = 'id,name,mimeType,createdTime,imageMediaMetadata(width,height,time)';

  async function ensureGoogleAccess() {
    if (accessToken) return;
    const restored = await restoreGoogleAccess();
    if (!restored) await requestAccessToken();
  }

  async function pickDrivePhotoFiles() {
    const key = pickerApiKey();
    if (!key) throw new Error('請先在整合設定輸入 Google Picker API Key，才能從 Google Drive 選照片。');
    await ensureGoogleAccess();
    await loadPickerApi();
    return new Promise((resolve, reject) => {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
        .setMimeTypes(DRIVE_PHOTO_TYPES.join(','))
        .setIncludeFolders(true).setSelectFolderEnabled(false);
      const picker = new google.picker.PickerBuilder()
        .setAppId(window.STORYFLOW_CONFIG.googleProjectNumber)
        .setOAuthToken(accessToken).setDeveloperKey(key).addView(view)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setTitle('選擇照片')
        .setCallback(data => {
          if (data.action === google.picker.Action.PICKED) resolve(data.docs || []);
          else if (data.action === google.picker.Action.CANCEL) resolve([]);
        }).build();
      picker.setVisible(true);
    });
  }

  function drivePhotoFromFile(file) {
    const meta = file?.imageMediaMetadata || {};
    // Drive writes the camera's time as "YYYY:MM:DD HH:MM:SS"; anything else falls back to
    // when the file reached Drive.
    const taken = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(String(meta.time || ''));
    return {
      driveFileId: file.id,
      name: file.name || '未命名照片',
      mimeType: file.mimeType || '',
      width: Number(meta.width) || 0,
      height: Number(meta.height) || 0,
      takenAt: taken ? `${taken[1]}-${taken[2]}-${taken[3]}T${taken[4]}` : (file.createdTime || '')
    };
  }

  async function fetchDrivePhotoMeta(fileId) {
    const response = await authenticatedFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_PHOTO_FIELDS)}`);
    if (!response.ok) {
      const error = new Error(`Google Drive 讀取照片資訊失敗（${response.status}）。`);
      error.status = response.status;
      throw error;
    }
    return drivePhotoFromFile(await response.json());
  }

  // Picked files, with the metadata the Picker does not return. A file whose metadata cannot
  // be read is still offered with what the Picker gave, so one failure does not lose the rest.
  async function pickDrivePhotos() {
    const picked = await pickDrivePhotoFiles();
    const photos = [];
    for (const doc of picked) {
      if (!DRIVE_PHOTO_TYPES.includes(String(doc.mimeType || '').toLowerCase())) continue;
      try { photos.push(await fetchDrivePhotoMeta(doc.id)); }
      catch (_) { photos.push(drivePhotoFromFile({ id: doc.id, name: doc.name, mimeType: doc.mimeType })); }
    }
    return photos;
  }

  // The image bytes, as a Blob held only by the caller. Errors carry the HTTP status so the
  // editor can tell 找不到 (404) and 沒有權限 (403) apart from a sign-in problem.
  async function fetchDrivePhoto(fileId) {
    if (!accessToken && !(await restoreGoogleAccess())) {
      const error = new Error('登入 Google 後顯示照片');
      error.code = 'GOOGLE_SIGNED_OUT';
      throw error;
    }
    const response = await authenticatedFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) {
      const error = new Error(response.status === 404 || response.status === 403
        ? 'Google Drive 上找不到這張照片'
        : `Google Drive 讀取照片失敗（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return response.blob();
  }

  Object.assign(StoryFlowIntegrations, {
    requestAccessToken, restoreGoogleAccess, inspectGoogleDoc, refreshChapterSource,
    pickerApiKey, setPickerApiKey, hasGoogleToken: () => Boolean(accessToken),
    pickDrivePhotos, fetchDrivePhoto, DRIVE_PHOTO_TYPES
  });
})();
