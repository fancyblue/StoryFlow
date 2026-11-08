// Visual workspace: one image per article (docs/REDESIGN_PROPOSAL.md Phase C).
//
// A visual work is a series of articles that share one photo library. Each article is a
// title, an optional pull quote, one photo with its caption, and the body — the order the
// article reads in, and the order the live preview beside the editor shows it in.
//
// Photos stay in the writer's Google Drive. The library is a list of references
// (`state.photos`, see content-model.js); an image is read from Drive into this tab's memory
// when it is shown and released when the work changes. Nothing here writes, moves or deletes
// a Drive file, and nothing writes an image into the StoryFlow folder or browser storage.
//
// The interaction follows a photo-first editing pattern: the library sits beside the writing,
// 沒用到的 shows what has not been written about yet, each photo says where it is used, and a
// photo is chosen by clicking it (or dragging it onto the article's image), with a lightbox to
// look closer and 用這張 from there.
(function () {
  const AUTO_SAVE_DELAY = 800;
  const PHOTO_FILTERS = [['all', '全部'], ['unused', '沒用到的'], ['used', '已用']];
  const PREVIEW_WIDTHS = [['phone', '手機寬'], ['desktop', '桌面寬']];

  let activeEntryId = null;
  let photoFilter = 'all';
  let previewWidth = 'phone';
  let previewPlatform = '';
  let narrowPane = 'edit';
  let replacing = false;
  let libraryOpen = true;
  let lightboxIndex = -1;
  let undoTimer = null;

  const dirtyEntryIds = new Set();
  const entrySaveStates = new Map();
  let autoSaveTimer = null;
  let autoSaveQueue = Promise.resolve();
  let autoSaveRevision = 0;
  let pendingAutoSaveEntryId = null;

  const { esc } = window.StoryFlowShared;

  // Images are read and cached by visual-photo-cache.js (window.StoryFlowVisualPhotos); the
  // photo folder is chosen in visual-folder-browser.js. Both load before this file.
  const fillPhotoSlots = root => window.StoryFlowVisualPhotos.fill(root);

  function isVisual() {
    return state?.contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL;
  }

  // The visual editor changes the source, which a phone edits only after the full unlock in
  // Settings — not while 管理發布 has its publishing helpers open.
  function isReadOnly() {
    const mode = window.StoryFlowMobileSafeMode;
    if (!mode) return false;
    return typeof mode.canEditContent === 'function' ? !mode.canEditContent() : Boolean(mode.isReadOnly?.());
  }

  function entries() {
    state.visualEntries ||= [];
    return state.visualEntries;
  }

  function photos() {
    state.photos ||= [];
    return state.photos;
  }

  function sortedPhotos() {
    return [...photos()].sort((left, right) =>
      String(left.takenAt || left.addedAt || '').localeCompare(String(right.takenAt || right.addedAt || ''))
      || String(left.name).localeCompare(String(right.name), 'zh-Hant'));
  }

  function activeEntry() {
    const list = entries();
    if (!list.some(entry => entry.id === activeEntryId)) activeEntryId = list[0]?.id || null;
    return list.find(entry => entry.id === activeEntryId) || null;
  }

  function photoById(id) {
    return id ? photos().find(photo => photo.id === id) || null : null;
  }

  // Which articles use a photo, by title, for the library's labels and the lightbox.
  function usage() {
    const map = new Map();
    entries().forEach(entry => {
      if (!entry.photoId) return;
      if (!map.has(entry.photoId)) map.set(entry.photoId, []);
      map.get(entry.photoId).push(entry);
    });
    return map;
  }

  function entryComplete(entry) {
    return Boolean(String(entry?.title || '').trim())
      && Boolean(String(entry?.body || '').trim() || entry?.photoId || entry?.images?.length);
  }

  function pendingCount(entry) {
    return window.StoryFlowShared.pendingMarkCount(entry?.quote, entry?.caption, entry?.body, entry?.afterword);
  }

  function takenLabel(photo) {
    const date = new Date(photo?.takenAt || '');
    if (!photo?.takenAt || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  // ---------- Autosave ----------

  function autoSaveTimeLabel() {
    return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  }

  function setEntrySaveStatus(entryId, message, isError = false) {
    if (!entryId) return;
    entrySaveStates.set(entryId, { message, isError });
    if (entryId === activeEntryId) renderSaveStatus();
  }

  function renderSaveStatus() {
    const entry = activeEntry();
    const node = document.getElementById('visualEditorSaveStatus');
    const retry = document.getElementById('visualRetrySaveBtn');
    if (!entry || !node || !retry) return;
    const status = entrySaveStates.get(entry.id) || (dirtyEntryIds.has(entry.id)
      ? { message: '尚未儲存 · 準備中', isError: false }
      : { message: '已儲存', isError: false });
    node.textContent = status.message;
    node.classList.toggle('error-text', status.isError);
    retry.hidden = !status.isError;
  }

  async function persistEntrySnapshot(entryId, revision, reason) {
    const entry = entries().find(item => item.id === entryId);
    if (!entry) return true;
    const snapshot = structuredClone(entry);
    setEntrySaveStatus(entryId, '儲存中…');
    try {
      await StoryFlowIntegrations.saveVisualEntry({
        projectTitle: state.projectTitle, entry: snapshot, photo: photoById(snapshot.photoId)
      });
      const workspaceSaved = await window.StoryFlowProjectPersistence?.flush?.(reason);
      if (workspaceSaved === false) throw new Error('工作區尚未寫入 StoryFlow 資料夾。');
      if (autoSaveRevision === revision && pendingAutoSaveEntryId === entryId) {
        pendingAutoSaveEntryId = null;
        dirtyEntryIds.delete(entryId);
        setEntrySaveStatus(entryId, `已儲存 ${autoSaveTimeLabel()}`);
      }
      renderList();
      return true;
    } catch (error) {
      pendingAutoSaveEntryId ||= entryId;
      setEntrySaveStatus(entryId, '儲存失敗 · 請重試', true);
      console.warn('StoryFlow visual entry autosave failed', error);
      return false;
    }
  }

  async function drainAutoSave(reason) {
    while (pendingAutoSaveEntryId) {
      const saved = await persistEntrySnapshot(pendingAutoSaveEntryId, autoSaveRevision, reason);
      if (!saved) return false;
    }
    return true;
  }

  function flushAutoSave(reason = 'visual-entry-autosave') {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    autoSaveQueue = autoSaveQueue.then(() => drainAutoSave(reason));
    return autoSaveQueue;
  }

  function scheduleAutoSave({ immediate = false, reason = 'visual-entry-autosave' } = {}) {
    const entry = activeEntry();
    if (!entry || isReadOnly()) return Promise.resolve(false);
    autoSaveRevision += 1;
    pendingAutoSaveEntryId = entry.id;
    dirtyEntryIds.add(entry.id);
    setEntrySaveStatus(entry.id, '尚未儲存 · 準備中');
    clearTimeout(autoSaveTimer);
    if (immediate) return flushAutoSave(reason);
    autoSaveTimer = window.setTimeout(() => flushAutoSave(reason), AUTO_SAVE_DELAY);
    return Promise.resolve(true);
  }

  function markChanged(label = '圖文編輯中', { immediate = false } = {}) {
    const entry = activeEntry();
    if (entry) entry.updatedAt = new Date().toISOString();
    saveState(label);
    scheduleAutoSave({ immediate, reason: label });
    window.dispatchEvent(new CustomEvent('storyflow:visual-entry-changed', {
      detail: { projectId: window.StoryFlowProjects?.activeId?.(), entryId: entry?.id || null }
    }));
  }

  // ---------- In-place confirmation and undo (REDESIGN_PROPOSAL B5) ----------

  // A small removal inside the article asks on the button itself: the first press turns it
  // into 再按一次確認 for 2.5 seconds, the second does it. Removing whole articles or works
  // stays a dialog with Recovery.
  function confirmInPlace(button, action) {
    if (button.dataset.armed === '1') {
      delete button.dataset.armed;
      button.textContent = button.dataset.label;
      button.classList.remove('is-armed');
      action();
      return;
    }
    button.dataset.label ||= button.textContent;
    button.dataset.armed = '1';
    button.textContent = '再按一次確認';
    button.classList.add('is-armed');
    window.setTimeout(() => {
      if (button.dataset.armed !== '1') return;
      delete button.dataset.armed;
      button.textContent = button.dataset.label;
      button.classList.remove('is-armed');
    }, 2500);
  }

  function offerUndo(message, undo) {
    const bar = document.getElementById('visualUndoBar');
    if (!bar) return;
    clearTimeout(undoTimer);
    bar.querySelector('span').textContent = message;
    bar.hidden = false;
    const button = bar.querySelector('button');
    button.onclick = () => {
      clearTimeout(undoTimer);
      bar.hidden = true;
      undo();
    };
    undoTimer = window.setTimeout(() => { bar.hidden = true; }, 10000);
  }

  // ---------- Markup ----------

  function hasLongformContent() {
    return Array.isArray(state?.chapters)
      && state.chapters.some(chapter => Boolean(String(chapter?.draft || '').trim()) || Boolean(chapter?.parts?.length));
  }

  function syncSharedWorkspaceHeader(visualMode) {
    const header = document.querySelector('#workspaceView > .topbar');
    if (!header) return;
    header.hidden = false;
    header.classList.toggle('visual-workspace-mode', visualMode);
    const title = header.querySelector('h1');
    if (title) title.textContent = visualMode ? '圖文工作台' : '內容發布工作台';
    // 切換作品 is in the page head for both modes (workspace-ux.js): the visual work's button and
    // menu move there from the rail, and each mode shows its own.
    const host = window.StoryFlowWorkspaceTitle?.host?.();
    const visualSwitch = document.getElementById('visualProjectSwitchBtn');
    const visualMenu = document.getElementById('visualProjectMenu');
    if (host && visualSwitch && visualSwitch.parentElement !== host) host.append(visualSwitch, visualMenu);
    if (visualSwitch) visualSwitch.hidden = !visualMode;
    const longformSwitch = document.getElementById('quickSwitchProjectBtn');
    if (longformSwitch) longformSwitch.hidden = visualMode;
    if (visualMode) document.getElementById('workspaceProjectQuickSwitch')?.setAttribute('hidden', '');
    else closeProjectMenu();
    window.StoryFlowWorkspaceTitle?.label?.(visualMode ? visualSwitch : longformSwitch, state.projectTitle);
    const saveStatus = document.getElementById('saveState');
    const save = document.getElementById('saveBtn');
    const generate = document.getElementById('generateBtn');
    if (saveStatus) saveStatus.hidden = visualMode;
    if (save) save.hidden = visualMode || !hasLongformContent();
    if (generate) generate.hidden = visualMode || !hasLongformContent();
  }

  function ensureWorkspace() {
    const workspaceView = document.getElementById('workspaceView');
    if (!workspaceView) return null;
    let root = document.getElementById('visualWorkspace');
    if (root) return root;
    root = document.createElement('section');
    root.id = 'visualWorkspace';
    root.className = 'visual-workspace';
    root.hidden = true;
    root.innerHTML = `
      <div id="visualReadonlyNote" class="visual-readonly-note" hidden>手機目前為唯讀：可以閱讀與預覽，但不會新增、選圖、修改或刪除。</div>
      <div class="visual-workspace-layout" data-pane="edit">
        <aside class="source-panel visual-entry-list-panel">
          <div class="panel-head visual-project-panel-head">
            <div>
              <div class="source-heading-title-row">
                <h2>作品與圖文</h2>
                <div class="source-heading-actions">
                  <button id="visualProjectSwitchBtn" class="workspace-title-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="visualProjectMenu">
                    <span></span><span class="sf-chevron" aria-hidden="true"></span>
                  </button>
                  <div id="visualProjectMenu" class="workspace-project-quick-switch" role="menu" aria-label="切換作品" hidden></div>
                </div>
              </div>
            </div>
          </div>
          <label class="field-label sf-visually-hidden" for="visualProjectTitle">作品名稱</label>
          <input id="visualProjectTitle" class="text-input visual-project-title-input rail-work-name" maxlength="160" title="點一下修改作品名稱" />
          <div class="visual-entry-section-head rail-section-head">
            <div><h3>圖文清單</h3></div>
            <div class="visual-entry-list-actions"><span id="visualEntryCount" class="muted"></span></div>
          </div>
          <div id="visualEntryList" class="visual-entry-list"></div>
          <button id="visualNewEntryBtn" class="button tiny ghost sf-quiet rail-add-button visual-entry-add-button" type="button">＋ 新增圖文</button>
          <section class="visual-photo-library" aria-labelledby="visualPhotoLibraryTitle">
            <button id="visualPhotoLibraryToggle" class="visual-photo-library-toggle" type="button" aria-expanded="true" aria-controls="visualPhotoLibraryBody">
              <h3 id="visualPhotoLibraryTitle">照片庫</h3><span id="visualPhotoCount" class="muted"></span><span class="sf-chevron" aria-hidden="true"></span>
            </button>
            <div id="visualPhotoLibraryBody" class="visual-photo-library-body">
              <div id="visualPhotoSource" class="visual-photo-source">
                <div class="visual-photo-source-name"><span>照片來源</span><strong id="visualPhotoFolderName"></strong></div>
                <div class="visual-photo-source-actions">
                  <button id="visualChooseFolderBtn" class="button tiny ghost" type="button">選擇照片資料夾</button>
                  <button id="visualRefreshFolderBtn" class="button tiny ghost" type="button">重新整理</button>
                  <button id="visualAddPhotosBtn" class="button tiny ghost sf-quiet visual-add-photos" type="button">加入個別照片</button>
                </div>
              </div>
              <div id="visualPhotoFilters" class="content-type-filters visual-photo-filters" role="group" aria-label="篩選照片"></div>
              <p id="visualPhotoHint" class="visual-photo-hint"></p>
              <div id="visualPhotoMode" class="visual-photo-mode" role="status" hidden><span>選一張照片，取代目前圖片</span><button id="visualPhotoModeCancel" class="button tiny ghost" type="button">取消</button></div>
              <div id="visualPhotoGrid" class="visual-photo-grid"></div>
              <p class="visual-photo-note">照片留在你的 Google Drive，StoryFlow 只記住是哪一張。支援 JPEG、PNG、WebP、GIF；HEIC 請先在 Drive 轉成 JPEG。</p>
            </div>
          </section>
        </aside>
        <div class="sf-rail-resizer" role="separator" aria-orientation="vertical" aria-label="調整左欄寬度" aria-valuemin="240" aria-valuemax="640" tabindex="0" title="拖拉調整寬度・按兩下還原"></div>
        <section class="visual-editor-panel" aria-label="編輯">
          <div id="visualEditorEmpty" class="visual-editor-empty" hidden></div>
          <form id="visualEditorForm" class="visual-editor-form" novalidate>
            <div class="visual-editor-status">
              <span id="visualEditorSaveStatus" class="visual-autosave-status" role="status" aria-live="polite">已儲存</span>
              <button id="visualRetrySaveBtn" class="button tiny ghost" type="button" hidden>重試</button>
              <button id="visualPendingMarks" class="pill sf-pending-pill visual-pending-pill" type="button" hidden></button>
              <div class="visual-pane-switch sf-preview-mode-segment" role="group" aria-label="編輯或預覽">
                <button type="button" data-pane="edit" aria-pressed="true">編輯</button>
                <button type="button" data-pane="preview" aria-pressed="false">預覽</button>
              </div>
            </div>
            <div id="visualUndoBar" class="visual-undo-bar" role="status" hidden><span></span><button class="button tiny ghost" type="button">復原</button></div>
            <label class="visual-field"><span>標題</span><input id="visualEntryTitle" class="text-input" maxlength="160" /></label>
            <div class="visual-field">
              <label for="visualEntryQuote">引言 <small>選填</small></label>
              <textarea id="visualEntryQuote" class="text-input visual-quote-input" rows="2" placeholder="放在圖片前的一句話"></textarea>
              <button id="visualQuoteFromBody" class="button tiny ghost sf-quiet visual-quote-from-body" type="button">從正文第一句帶入</button>
            </div>
            <div class="visual-field visual-photo-field">
              <span id="visualEntryPhotoLabel">圖片</span>
              <div class="visual-entry-photo-row">
                <div id="visualEntryPhoto" class="visual-entry-photo" aria-labelledby="visualEntryPhotoLabel"></div>
                <div class="visual-entry-photo-actions">
                  <small id="visualEntryPhotoMeta" class="muted"></small>
                  <div class="visual-entry-photo-buttons">
                    <button id="visualReplacePhoto" class="button tiny ghost" type="button">換一張</button>
                    <button id="visualRemovePhoto" class="button tiny ghost" type="button">移除圖片</button>
                  </div>
                </div>
              </div>
            </div>
            <label class="visual-field"><span>圖說 <small>選填</small></span><input id="visualEntryCaption" class="text-input" maxlength="300" placeholder="例如：2010 年攝於東京" /></label>
            <label class="visual-field"><span>正文</span><textarea id="visualEntryBody" class="text-input visual-body-input" placeholder="輸入正文；可使用 Markdown。"></textarea></label>
            <footer class="visual-editor-footer"><span id="visualEditorMeta" class="muted"></span></footer>
          </form>
        </section>
        <section class="visual-preview-panel" aria-label="預覽">
          <div class="visual-preview-head">
            <strong>預覽</strong>
            <div id="visualPreviewWidths" class="sf-preview-mode-segment" role="group" aria-label="預覽寬度"></div>
            <label class="sf-visually-hidden" for="visualPreviewPlatform">預覽格式</label>
            <select id="visualPreviewPlatform" class="text-input"></select>
            <small id="visualPreviewScale" class="visual-preview-scale" aria-live="polite"></small>
          </div>
          <div class="visual-preview-stage"><article id="visualPreviewArticle" class="visual-article-preview" data-width="phone"></article></div>
        </section>
      </div>`;
    workspaceView.appendChild(root);
    bindWorkspace(root);
    return root;
  }

  // ---------- Dialogs ----------

  function ensureDialogs() {
    if (!document.getElementById('visualTypeDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'visualTypeDialog';
      dialog.className = 'visual-type-dialog';
      dialog.setAttribute('aria-labelledby', 'visualTypeDialogTitle');
      dialog.innerHTML = `<form method="dialog" class="dialog-card">
        <div class="panel-head"><div><h3 id="visualTypeDialogTitle">選擇作品類型</h3></div><button class="icon-button" value="cancel" formnovalidate aria-label="關閉">×</button></div>
        <div id="visualTypeOptions" class="visual-type-options">
          <button id="chooseLongformType" class="visual-type-option" type="button"><strong>長文作品</strong><span>Google Docs／手動來源、Smart Split、切篇確認與發布。</span></button>
          <button id="chooseVisualType" class="visual-type-option" type="button"><strong>圖文作品</strong><span>一圖一文：引言、一張照片與圖說、正文，邊寫邊預覽。照片從 Google Drive 選，留在 Drive。</span></button>
        </div>
        <div id="visualSeriesCreatePanel" class="visual-dialog-fields" hidden>
          <label class="visual-field"><span>作品名稱</span><input id="visualSeriesTitle" class="text-input" required maxlength="160" placeholder="例如：2023 北海道 10 日行" /></label>
          <label class="visual-field"><span>第一則圖文標題</span><input id="visualFirstEntryTitle" class="text-input" maxlength="160" /></label>
          <div class="visual-dialog-actions"><button id="visualTypeBack" class="button ghost" type="button">返回</button><button id="createVisualSeriesBtn" class="button primary" type="button">建立圖文作品</button></div>
        </div>
      </form>`;
      document.body.appendChild(dialog);
      bindTypeDialog(dialog);
    }

    if (!document.getElementById('visualEntryDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'visualEntryDialog';
      dialog.className = 'visual-entry-dialog';
      dialog.setAttribute('aria-labelledby', 'visualEntryDialogTitle');
      dialog.innerHTML = `<form method="dialog" class="dialog-card">
        <div class="panel-head"><div><h3 id="visualEntryDialogTitle">新增圖文</h3></div><button class="icon-button" value="cancel" formnovalidate aria-label="關閉">×</button></div>
        <div class="visual-dialog-fields"><label class="visual-field"><span>圖文標題</span><input id="newVisualEntryTitle" class="text-input" required maxlength="160" /></label></div>
        <div class="visual-dialog-actions"><button class="button ghost" value="cancel" formnovalidate>取消</button><button id="confirmNewVisualEntry" class="button primary" type="button">新增圖文</button></div>
      </form>`;
      document.body.appendChild(dialog);
      dialog.querySelector('#confirmNewVisualEntry').addEventListener('click', createEntryFromDialog);
      dialog.querySelector('#newVisualEntryTitle').addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); createEntryFromDialog(); }
      });
    }


    if (!document.getElementById('visualPhotoDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'visualPhotoDialog';
      dialog.className = 'visual-photo-dialog';
      dialog.setAttribute('aria-labelledby', 'visualPhotoDialogTitle');
      dialog.innerHTML = `<div class="dialog-card visual-photo-dialog-card">
        <div class="panel-head"><div><h3 id="visualPhotoDialogTitle">照片</h3></div><button class="icon-button" type="button" data-photo-close aria-label="關閉">×</button></div>
        <div class="visual-photo-stage">
          <button class="visual-photo-step" type="button" data-photo-step="-1" aria-label="上一張">←</button>
          <div id="visualPhotoDialogImage" class="visual-photo-dialog-image"></div>
          <button class="visual-photo-step" type="button" data-photo-step="1" aria-label="下一張">→</button>
        </div>
        <p id="visualPhotoDialogCaption" class="visual-photo-dialog-caption"></p>
        <label class="visual-field"><span>替代文字（描述照片內容，所有使用它的圖文共用）</span><input id="visualPhotoAlt" class="text-input" maxlength="300" /></label>
        <div class="visual-dialog-actions">
          <button id="visualPhotoRemove" class="button ghost danger" type="button">移出照片庫</button>
          <a id="visualPhotoOpenDrive" class="button ghost" target="_blank" rel="noopener noreferrer">在 Google Drive 開啟</a>
          <button id="visualPhotoUse" class="button primary" type="button">用這張</button>
        </div>
      </div>`;
      document.body.appendChild(dialog);
      bindPhotoDialog(dialog);
    }
  }

  function showTypeOptions(dialog, { focus = false } = {}) {
    dialog.querySelector('#visualTypeOptions').hidden = false;
    dialog.querySelector('#visualSeriesCreatePanel').hidden = true;
    dialog.querySelector('#visualTypeDialogTitle').textContent = '選擇作品類型';
    if (focus) dialog.querySelector('#chooseLongformType')?.focus();
  }

  function bindTypeDialog(dialog) {
    dialog.querySelector('#chooseLongformType').addEventListener('click', () => {
      dialog.close();
      window.StoryFlowStartNewWork?.({ contentMode: 'longform' });
    });
    dialog.querySelector('#chooseVisualType').addEventListener('click', () => {
      dialog.querySelector('#visualTypeOptions').hidden = true;
      dialog.querySelector('#visualSeriesCreatePanel').hidden = false;
      dialog.querySelector('#visualTypeDialogTitle').textContent = '建立圖文作品';
      dialog.querySelector('#visualSeriesTitle').focus();
    });
    dialog.querySelector('#visualTypeBack').addEventListener('click', () => showTypeOptions(dialog, { focus: true }));
    dialog.querySelector('#createVisualSeriesBtn').addEventListener('click', () => {
      if (isReadOnly()) return notify('手機目前為唯讀，無法建立圖文作品。', true);
      const titleInput = dialog.querySelector('#visualSeriesTitle');
      const title = titleInput.value.trim();
      if (!title) return titleInput.reportValidity();
      const now = new Date().toISOString();
      const entryTitle = dialog.querySelector('#visualFirstEntryTitle').value.trim() || '第一則圖文';
      const visualEntry = { id: crypto.randomUUID(), title: entryTitle, createdAt: now, updatedAt: now };
      const project = window.StoryFlowProjects?.createProject?.({ title, contentMode: 'visual', visualEntry }, { quiet: true });
      if (!project) return;
      activeEntryId = visualEntry.id;
      dialog.close();
      markChanged('圖文系列已建立', { immediate: true });
      window.StoryFlowNavigate?.('workspace');
      render();
      notify(`已建立圖文作品：${title}`);
    });
    // Closing, Escape or 返回 never creates anything: the work exists only after 建立圖文作品.
    dialog.addEventListener('close', () => showTypeOptions(dialog));
  }

  function openTypeChooser() {
    ensureDialogs();
    const dialog = document.getElementById('visualTypeDialog');
    dialog.querySelector('#visualSeriesTitle').value = '';
    dialog.querySelector('#visualFirstEntryTitle').value = '第一則圖文';
    showTypeOptions(dialog);
    dialog.showModal();
    dialog.querySelector('#chooseLongformType').focus();
    return true;
  }

  function openEntryDialog() {
    if (isReadOnly()) return notify('手機目前為唯讀，無法新增圖文。', true);
    ensureDialogs();
    const dialog = document.getElementById('visualEntryDialog');
    dialog.querySelector('#newVisualEntryTitle').value = '';
    dialog.showModal();
    dialog.querySelector('#newVisualEntryTitle').focus();
  }

  async function createEntryFromDialog() {
    const dialog = document.getElementById('visualEntryDialog');
    const input = dialog.querySelector('#newVisualEntryTitle');
    const title = input.value.trim();
    if (!title) return input.reportValidity();
    await flushAutoSave('visual-entry-switch');
    const now = new Date().toISOString();
    const entry = StoryFlowContentModel.normalizeVisualEntry({ id: crypto.randomUUID(), title, createdAt: now, updatedAt: now });
    entries().push(entry);
    activeEntryId = entry.id;
    dialog.close();
    markChanged('圖文已新增', { immediate: true });
    render();
    notify(`已新增圖文：${title}`);
    requestAnimationFrame(() => document.getElementById('visualEntryQuote')?.focus({ preventScroll: true }));
  }

  // ---------- Photo library ----------

  async function addPhotosFromDrive() {
    if (isReadOnly()) return notify('手機目前為唯讀，無法加入照片。', true);
    let picked = [];
    try {
      picked = await StoryFlowIntegrations.pickDrivePhotos();
    } catch (error) {
      notify(`無法開啟 Google Drive：${error.message}`, true);
      return;
    }
    if (!picked.length) return;
    const known = new Set(photos().map(photo => photo.driveFileId));
    const now = new Date().toISOString();
    const added = picked
      .filter(item => item?.driveFileId && !known.has(item.driveFileId) && known.add(item.driveFileId))
      .map(item => StoryFlowContentModel.normalizeVisualPhoto({ ...item, id: crypto.randomUUID(), addedAt: now }));
    const skipped = picked.length - added.length;
    const leftOut = [
      picked.unsupported ? `${picked.unsupported} 個其他格式的檔案（例如 HEIC）沒有加入` : '',
      picked.truncated ? '資料夾太大，只加入了前 2000 張' : ''
    ].filter(Boolean).join('；');
    if (!added.length) {
      notify(picked.length ? '這些照片都已在照片庫裡。' : (leftOut || '選的資料夾裡沒有 JPEG、PNG、WebP 或 GIF 照片。'), !picked.length);
      return;
    }
    photos().push(...added);
    // An article without a photo takes the first one picked, which is what picking for it means.
    const entry = activeEntry();
    if (entry && !entry.photoId) entry.photoId = added[0].id;
    markChanged('照片已加入', { immediate: true });
    render();
    notify(`已加入 ${added.length} 張照片${skipped ? `（${skipped} 張已在照片庫）` : ''}${leftOut ? `；${leftOut}` : ''}`);
  }

  function filteredPhotos() {
    const used = usage();
    const list = sortedPhotos();
    if (photoFilter === 'unused') return list.filter(photo => !used.has(photo.id));
    if (photoFilter === 'used') return list.filter(photo => used.has(photo.id));
    return list;
  }

  function usePhoto(photoId) {
    const entry = activeEntry();
    const photo = photoById(photoId);
    if (isReadOnly() || !entry || !photo) return;
    const wasReplacing = replacing;
    replacing = false;
    if (entry.photoId === photo.id) {
      if (wasReplacing) render();
      return;
    }
    const others = (usage().get(photo.id) || []).filter(item => item.id !== entry.id);
    entry.photoId = photo.id;
    markChanged('圖文圖片已更新', { immediate: true });
    render();
    if (others.length) notify(`這張也用在《${others[0].title}》`);
  }

  function removePhotoFromEntry() {
    const entry = activeEntry();
    if (!entry?.photoId || isReadOnly()) return;
    const previous = entry.photoId;
    entry.photoId = '';
    markChanged('圖文圖片已更新', { immediate: true });
    render();
    offerUndo('已移除圖片', () => {
      entry.photoId = previous;
      markChanged('圖文圖片已更新', { immediate: true });
      render();
    });
  }

  // Other articles changed by one action (a photo taken out of the library) are written
  // after the open one, through the same queue, so their exports stop naming the photo.
  function queueEntryWrites(list, reason) {
    const others = list.filter(entry => entry.id !== activeEntryId);
    if (!others.length) return;
    autoSaveQueue = autoSaveQueue.then(async () => {
      for (const entry of others) {
        try {
          await StoryFlowIntegrations.saveVisualEntry({
            projectTitle: state.projectTitle, entry: structuredClone(entry), photo: photoById(entry.photoId)
          });
        } catch (error) {
          notify(`《${entry.title}》尚未寫入資料夾：${error.message}`, true);
        }
      }
      await window.StoryFlowProjectPersistence?.flush?.(reason);
    });
  }

  // Taking a photo out of the library removes the reference only — the Drive file is
  // untouched — and clears it from the articles that used it, which 復原 puts back.
  function removePhotoFromLibrary(photoId) {
    const list = photos();
    const index = list.findIndex(photo => photo.id === photoId);
    if (index < 0 || isReadOnly()) return;
    const [removed] = list.splice(index, 1);
    const users = entries().filter(entry => entry.photoId === photoId);
    users.forEach(entry => { entry.photoId = ''; entry.updatedAt = new Date().toISOString(); });
    markChanged('照片已移出照片庫', { immediate: true });
    queueEntryWrites(users, 'visual-photo-removed');
    render();
    offerUndo(`已移出照片庫：${removed.name}`, () => {
      list.splice(Math.min(index, list.length), 0, removed);
      users.forEach(entry => { entry.photoId = photoId; });
      markChanged('照片已放回照片庫', { immediate: true });
      queueEntryWrites(users, 'visual-photo-restored');
      render();
    });
  }

  // ---------- The work's photo folder ----------

  function leftOutText(listed) {
    return [
      listed.unsupported ? `${listed.unsupported} 個其他格式的檔案（例如 HEIC）沒有加入` : '',
      listed.truncated ? '資料夾太大，只加入了前 2000 張' : ''
    ].filter(Boolean).join('；');
  }

  // Make a folder the work's photo source, or bring the current one up to date. Changing it
  // takes the old folder's photos that no article uses out of the library — references only,
  // so 復原 puts them back — and keeps every photo an article uses. Refreshing only adds.
  async function applyFolder(folder, { refresh = false } = {}) {
    if (isReadOnly()) return notify('手機目前為唯讀，無法更改照片資料夾。', true);
    if (!folder?.id) return;
    const status = document.getElementById('visualPhotoHint');
    if (status) status.textContent = `正在讀取「${folder.name}」裡的照片…`;
    let listed;
    try {
      listed = await StoryFlowIntegrations.listDriveFolderPhotos(folder.id);
    } catch (error) {
      notify(`無法讀取資料夾「${folder.name}」：${error.message}`, true);
      renderLibrary();
      return;
    }
    const library = photos();
    const used = usage();
    const previous = state.photoFolder ? { ...state.photoFolder } : null;
    const removed = [];
    if (!refresh && previous && previous.id !== folder.id) {
      for (let index = library.length - 1; index >= 0; index -= 1) {
        const photo = library[index];
        if (photo.sourceFolderId === previous.id && !used.has(photo.id)) removed.unshift({ index, photo: library.splice(index, 1)[0] });
      }
    }
    const known = new Set(library.map(photo => photo.driveFileId));
    const now = new Date().toISOString();
    const added = listed
      .filter(item => item?.driveFileId && !known.has(item.driveFileId) && known.add(item.driveFileId))
      .map(item => StoryFlowContentModel.normalizeVisualPhoto({ ...item, id: crypto.randomUUID(), addedAt: now, sourceFolderId: folder.id }));
    library.push(...added);
    state.photoFolder = { id: folder.id, name: folder.name };
    window.StoryFlowVisualFolderBrowser.remember(folder);
    markChanged(refresh ? '照片資料夾已重新整理' : '照片資料夾已更換', { immediate: true });
    photoFilter = 'all';
    render();
    const leftOut = leftOutText(listed);
    const message = refresh
      ? `已重新整理「${folder.name}」：${added.length ? `新增 ${added.length} 張照片` : '沒有新照片'}`
      : `照片來源改為「${folder.name}」：加入 ${added.length} 張照片${removed.length ? `，移出 ${removed.length} 張舊資料夾裡沒用到的照片` : ''}`;
    notify(leftOut ? `${message}；${leftOut}` : message);
    if (!refresh && (removed.length || added.length || previous?.id !== folder.id)) {
      offerUndo(`照片來源已改為「${folder.name}」`, () => {
        const addedIds = new Set(added.map(photo => photo.id));
        for (let index = library.length - 1; index >= 0; index -= 1) {
          if (addedIds.has(library[index].id)) library.splice(index, 1);
        }
        removed.forEach(({ index, photo }) => library.splice(Math.min(index, library.length), 0, photo));
        state.photoFolder = previous;
        markChanged('照片資料夾已還原', { immediate: true });
        render();
      });
    }
  }

  function openFolderDialog() {
    if (isReadOnly()) return notify('手機目前為唯讀，無法選擇照片資料夾。', true);
    window.StoryFlowVisualFolderBrowser.open({ onChoose: folder => applyFolder(folder) });
  }

  // ---------- Lightbox ----------

  function openPhotoDialog(photoId) {
    ensureDialogs();
    const list = filteredPhotos();
    lightboxIndex = Math.max(0, list.findIndex(photo => photo.id === photoId));
    renderPhotoDialog();
    const dialog = document.getElementById('visualPhotoDialog');
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('#visualPhotoUse').focus({ preventScroll: true });
  }

  function renderPhotoDialog() {
    const dialog = document.getElementById('visualPhotoDialog');
    const list = filteredPhotos();
    const photo = list[lightboxIndex];
    if (!dialog || !photo) return dialog?.close?.();
    const users = usage().get(photo.id) || [];
    const entry = activeEntry();
    dialog.querySelector('#visualPhotoDialogTitle').textContent = photo.name;
    const image = dialog.querySelector('#visualPhotoDialogImage');
    image.dataset.photoSlot = photo.id;
    fillPhotoSlots(dialog);
    const where = users.length ? `用在${users.map(item => `《${item.title}》`).join('、')}` : '還沒用到';
    dialog.querySelector('#visualPhotoDialogCaption').textContent =
      [photo.name, takenLabel(photo), where].filter(Boolean).join(' · ');
    const alt = dialog.querySelector('#visualPhotoAlt');
    alt.value = photo.alt || '';
    alt.disabled = isReadOnly();
    const use = dialog.querySelector('#visualPhotoUse');
    use.textContent = replacing ? '用這張取代' : entry ? `用在《${entry.title}》` : '用這張';
    use.disabled = isReadOnly() || !entry || entry.photoId === photo.id;
    const remove = dialog.querySelector('#visualPhotoRemove');
    remove.disabled = isReadOnly();
    delete remove.dataset.armed;
    remove.textContent = '移出照片庫';
    remove.dataset.label = '移出照片庫';
    dialog.querySelector('#visualPhotoOpenDrive').href = `https://drive.google.com/file/d/${encodeURIComponent(photo.driveFileId)}/view`;
    dialog.querySelectorAll('[data-photo-step]').forEach(button => { button.disabled = list.length < 2; });
  }

  function stepPhotoDialog(delta) {
    const list = filteredPhotos();
    if (list.length < 2) return;
    lightboxIndex = (lightboxIndex + delta + list.length) % list.length;
    renderPhotoDialog();
  }

  function bindPhotoDialog(dialog) {
    dialog.querySelector('[data-photo-close]').addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-photo-step]').forEach(button =>
      button.addEventListener('click', () => stepPhotoDialog(Number(button.dataset.photoStep))));
    dialog.addEventListener('keydown', event => {
      if (event.target.matches?.('input, textarea')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); stepPhotoDialog(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); stepPhotoDialog(1); }
    });
    dialog.querySelector('#visualPhotoUse').addEventListener('click', () => {
      const photo = filteredPhotos()[lightboxIndex];
      if (!photo) return;
      usePhoto(photo.id);
      renderPhotoDialog();
    });
    dialog.querySelector('#visualPhotoAlt').addEventListener('change', event => {
      const photo = filteredPhotos()[lightboxIndex];
      if (!photo || isReadOnly()) return;
      photo.alt = event.target.value.trim();
      markChanged('照片替代文字已更新');
      renderPreview();
    });
    dialog.querySelector('#visualPhotoRemove').addEventListener('click', event => {
      const photo = filteredPhotos()[lightboxIndex];
      if (!photo) return;
      confirmInPlace(event.currentTarget, () => {
        dialog.close();
        removePhotoFromLibrary(photo.id);
      });
    });
  }

  // ---------- Rendering ----------

  function closeProjectMenu() {
    const menu = document.getElementById('visualProjectMenu');
    const button = document.getElementById('visualProjectSwitchBtn');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function closeEntryMenus(except = null) {
    document.querySelectorAll('#visualEntryList .visual-entry-action-menu').forEach(menu => {
      if (menu === except) return;
      menu.hidden = true;
      menu.classList.remove('opens-up');
      window.StoryFlowAnchoredMenu?.close?.(menu);
      menu.closest('.visual-entry-row')?.querySelector('.visual-entry-more')?.setAttribute('aria-expanded', 'false');
    });
  }

  function renderProjectSwitcher() {
    const api = window.StoryFlowProjects;
    const menu = document.getElementById('visualProjectMenu');
    const title = document.getElementById('visualProjectTitle');
    if (!api || !menu || !title) return;
    const projects = api.list?.() || [];
    const activeId = api.activeId?.();
    if (document.activeElement !== title) title.value = state.projectTitle || '未命名作品';
    window.StoryFlowWorkspaceTitle?.label?.(document.getElementById('visualProjectSwitchBtn'), state.projectTitle);
    menu.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'workspace-project-quick-switch-title';
    heading.textContent = '切換作品';
    menu.appendChild(heading);
    // Same label and shape as the longform switcher: 新增作品 is this menu's secondary action.
    const newWork = document.createElement('button');
    newWork.id = 'visualProjectNewWork';
    newWork.type = 'button';
    newWork.className = 'workspace-project-quick-switch-new';
    newWork.innerHTML = '<span aria-hidden="true">＋</span><strong>新增作品</strong>';
    newWork.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await flushAutoSave('visual-new-work');
      closeProjectMenu();
      window.StoryFlowStartNewWork?.();
    });
    menu.appendChild(newWork);
    projects.forEach(project => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `workspace-project-quick-switch-item${project.id === activeId ? ' active' : ''}`;
      item.disabled = project.id === activeId;
      item.innerHTML = `<span>${esc(project.title || '未命名作品')}</span>${project.id === activeId ? '<small>目前</small>' : ''}`;
      item.addEventListener('click', async () => {
        if (project.id === api.activeId?.()) return;
        await flushAutoSave('visual-project-switch');
        api.switchProject?.(project.id, { quiet: true });
        closeProjectMenu();
        window.StoryFlowNavigate?.('workspace');
      });
      menu.appendChild(item);
    });
  }

  function renderList() {
    const root = document.getElementById('visualWorkspace');
    if (!root) return;
    const list = root.querySelector('#visualEntryList');
    const items = entries();
    root.querySelector('#visualEntryCount').textContent = `${items.length} 則`;
    list.innerHTML = items.length ? items.map(entry => {
      const meta = [
        entryComplete(entry) ? `${charCount(entry.body).toLocaleString()} 字` : '內容尚未完成',
        entry.photoId ? '有圖片' : '沒有圖片',
        pendingCount(entry) ? `待補 ${pendingCount(entry)}` : '',
        dirtyEntryIds.has(entry.id) ? '尚未儲存' : ''
      ].filter(Boolean).join(' · ');
      return `
      <div class="visual-entry-row ${entry.id === activeEntryId ? 'active' : ''}">
        <button type="button" data-entry-id="${esc(entry.id)}" class="visual-entry-select" aria-current="${entry.id === activeEntryId ? 'true' : 'false'}">
          <strong>${esc(entry.title || '未命名圖文')}</strong><small>${esc(meta)}</small>
        </button>
        <button type="button" class="chapter-delete-button chapter-more-button visual-entry-more" aria-label="更多「${esc(entry.title || '未命名圖文')}」操作" aria-haspopup="menu" aria-expanded="false" ${isReadOnly() ? 'disabled' : ''}>⋯</button>
        <div class="chapter-row-action-menu visual-entry-action-menu" role="menu" hidden>
          <button type="button" class="chapter-row-edit-menu-item" role="menuitem" data-edit-entry="${esc(entry.id)}"><span aria-hidden="true">✎</span><span>編輯圖文</span></button>
          <button type="button" class="chapter-row-delete-menu-item" role="menuitem" data-delete-entry="${esc(entry.id)}"><span aria-hidden="true">×</span><span>刪除圖文</span></button>
        </div>
      </div>`;
    }).join('') : '<div class="visual-entry-empty">這個作品還沒有圖文。</div>';
  }

  function renderLibrary() {
    const root = document.getElementById('visualWorkspace');
    if (!root) return;
    const all = photos();
    const used = usage();
    const counts = {
      all: all.length,
      unused: all.filter(photo => !used.has(photo.id)).length,
      used: all.filter(photo => used.has(photo.id)).length
    };
    root.querySelector('#visualPhotoCount').textContent = all.length ? `用了 ${counts.used} / ${all.length} 張` : '';
    const toggle = root.querySelector('#visualPhotoLibraryToggle');
    toggle.setAttribute('aria-expanded', String(libraryOpen));
    root.querySelector('#visualPhotoLibraryBody').hidden = !libraryOpen;
    root.querySelector('#visualPhotoFilters').innerHTML = PHOTO_FILTERS.map(([key, label]) =>
      `<button type="button" class="content-type-filter${photoFilter === key ? ' active' : ''}" data-photo-filter="${key}" aria-pressed="${photoFilter === key}">${label} ${counts[key]}</button>`).join('');
    const entry = activeEntry();
    root.querySelector('#visualPhotoHint').textContent = !all.length
      ? '還沒有照片。選一個 Google Drive 照片資料夾，整趟的照片都會進來；點一張就會成為目前圖文的圖片。'
      : entry ? `點照片會設為《${entry.title || '未命名圖文'}》的圖片；也可以直接拖到圖片欄。` : '先新增一則圖文，再從這裡選它的圖片。';
    root.querySelector('#visualPhotoMode').hidden = !replacing;
    const list = filteredPhotos();
    const grid = root.querySelector('#visualPhotoGrid');
    grid.innerHTML = list.length ? list.map(photo => {
      const users = used.get(photo.id) || [];
      const current = entry && entry.photoId === photo.id;
      const label = users.length ? `用在${users.map(item => `《${item.title}》`).join('、')}` : '還沒用到';
      return `<div class="visual-photo-tile${users.length ? ' is-used' : ''}${current ? ' is-current' : ''}" data-photo-id="${esc(photo.id)}" draggable="${isReadOnly() ? 'false' : 'true'}">
        <button type="button" class="visual-photo-choose" aria-label="${esc(`${photo.name}，${label}`)}" aria-pressed="${current ? 'true' : 'false'}">
          <span class="visual-photo-thumb" data-photo-slot="${esc(photo.id)}" data-photo-size="thumb"><span>${esc(photo.name)}</span></span>
        </button>
        <button type="button" class="visual-photo-zoom" aria-label="${esc(`放大檢視「${photo.name}」`)}" title="放大檢視">⤢</button>
        ${users.length ? `<span class="visual-photo-used" aria-hidden="true">${esc(users.length > 1 ? `${users.length} 則` : users[0].title)}</span>` : ''}
      </div>`;
    }).join('') : `<p class="visual-photo-empty">${all.length ? '沒有符合篩選的照片。' : ''}</p>`;
    root.querySelector('#visualAddPhotosBtn').disabled = isReadOnly();
    const folder = state.photoFolder;
    root.querySelector('#visualPhotoFolderName').textContent = folder?.name || '尚未選擇資料夾';
    root.querySelector('#visualChooseFolderBtn').textContent = folder ? '更換資料夾' : '選擇照片資料夾';
    root.querySelector('#visualChooseFolderBtn').disabled = isReadOnly();
    root.querySelector('#visualRefreshFolderBtn').hidden = !folder;
    root.querySelector('#visualRefreshFolderBtn').disabled = isReadOnly();
    fillPhotoSlots(grid);
  }

  function renderEditor() {
    const root = document.getElementById('visualWorkspace');
    const entry = activeEntry();
    const empty = root.querySelector('#visualEditorEmpty');
    const form = root.querySelector('#visualEditorForm');
    if (!entry) {
      form.hidden = true;
      empty.hidden = false;
      empty.innerHTML = `<div><h2>建立第一則圖文</h2><p class="muted">一則圖文是一張照片配一段文字：引言、照片與圖說、正文。照片從 Google Drive 選。</p><button id="visualEmptyNewEntry" class="button primary" type="button" ${isReadOnly() ? 'disabled' : ''}>新增第一則圖文</button></div>`;
      return;
    }
    empty.hidden = true;
    form.hidden = false;
    const setValue = (id, value) => {
      const field = root.querySelector(`#${id}`);
      if (document.activeElement !== field && field.value !== value) field.value = value;
    };
    setValue('visualEntryTitle', entry.title || '');
    setValue('visualEntryQuote', entry.quote || '');
    setValue('visualEntryCaption', entry.caption || '');
    setValue('visualEntryBody', entry.body || '');
    const photo = photoById(entry.photoId);
    const slot = root.querySelector('#visualEntryPhoto');
    if (entry.photoId) {
      slot.innerHTML = `<button type="button" class="visual-entry-photo-open" aria-label="放大檢視圖片"><span class="visual-photo-thumb" data-photo-slot="${esc(entry.photoId)}"></span></button>`;
      fillPhotoSlots(slot);
    } else {
      slot.innerHTML = `<button type="button" class="visual-entry-photo-pick" ${isReadOnly() ? 'disabled' : ''}>${photos().length ? '從照片庫選一張，或把照片拖到這裡' : '選擇照片資料夾'}</button>`;
    }
    const others = photo ? (usage().get(photo.id) || []).filter(item => item.id !== entry.id) : [];
    root.querySelector('#visualEntryPhotoMeta').textContent = photo
      ? [photo.name, takenLabel(photo), others.length ? `也用在${others.map(item => `《${item.title}》`).join('、')}` : ''].filter(Boolean).join(' · ')
      : entry.photoId ? '照片庫裡已沒有這張照片' : '';
    root.querySelector('#visualReplacePhoto').hidden = !entry.photoId;
    root.querySelector('#visualRemovePhoto').hidden = !entry.photoId;
    root.querySelector('#visualReplacePhoto').textContent = replacing ? '取消替換' : '換一張';
    root.querySelectorAll('#visualEditorForm input, #visualEditorForm textarea, .visual-entry-photo-actions button, #visualQuoteFromBody').forEach(control => {
      control.disabled = isReadOnly();
    });
    renderMeta();
    renderSaveStatus();
  }

  function renderMeta() {
    const root = document.getElementById('visualWorkspace');
    const entry = activeEntry();
    if (!root || !entry) return;
    root.querySelector('#visualEditorMeta').textContent = [
      `${charCount(entry.body).toLocaleString()} 字`,
      entry.photoId ? '1 張圖片' : '沒有圖片',
      entryComplete(entry) ? '' : '內容尚未完成：需要標題，以及正文或圖片'
    ].filter(Boolean).join(' · ');
    const pending = pendingCount(entry);
    const pill = root.querySelector('#visualPendingMarks');
    pill.hidden = !pending;
    pill.textContent = `${pending} 處待補／待確認`;
    pill.title = '跳到下一處【待補】／【待確認】';
  }

  function renderPreviewControls() {
    const root = document.getElementById('visualWorkspace');
    root.querySelector('#visualPreviewWidths').innerHTML = PREVIEW_WIDTHS.map(([key, label]) =>
      `<button type="button" data-preview-width="${key}" class="${previewWidth === key ? 'active' : ''}" aria-pressed="${previewWidth === key}">${label}</button>`).join('');
    const select = root.querySelector('#visualPreviewPlatform');
    window.StoryFlowShared.fillPlatformSelect(select);
    if ([...select.options].some(option => option.value === previewPlatform)) select.value = previewPlatform;
    else previewPlatform = select.value;
    root.querySelector('.visual-workspace-layout').dataset.pane = narrowPane;
    root.querySelectorAll('.visual-pane-switch [data-pane]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.pane === narrowPane));
      button.classList.toggle('active', button.dataset.pane === narrowPane);
    });
  }

  // Text as it will be copied, line for line, with a scene-marker line centred the way the
  // longform preview centres it; only its placement differs from the copy.
  function articleText(text) {
    const marker = String(state?.sceneMarker || '').trim();
    return String(text || '').split('\n').map(line => {
      const value = line.trim();
      const isMarker = value && ((marker && value === marker) || /^[＊*]{3,}$/.test(value));
      return isMarker ? `<span class="visual-article-scene">${esc(value)}</span>` : esc(line);
    }).join('\n');
  }

  // The article as a reader will see it: what the copy will contain, in the same order, with
  // the platform's paragraph and indent rules when one is chosen.
  function renderArticle(container, entry, { platform = '', includeAfterword, titleStyle = 'heading' } = {}) {
    if (!container || !entry) return;
    const sections = window.StoryFlowPublishingOutput.visualSections(entry, platform, includeAfterword);
    const title = window.StoryFlowPublishingOutput.publishTitleFor(entry, platform);
    container.innerHTML = `
      ${titleStyle ? `<h1 class="visual-article-title">${esc(title)}</h1>` : ''}
      ${sections.quote ? `<blockquote class="visual-article-quote"><span aria-hidden="true">❝</span><p>${esc(sections.quote)}</p></blockquote>` : ''}
      ${sections.photo ? `<figure class="visual-article-figure"><span class="visual-photo-thumb" data-photo-slot="${esc(sections.photo.id)}"></span>${sections.caption ? `<figcaption>${esc(sections.caption)}</figcaption>` : ''}</figure>` : (sections.caption ? `<p class="visual-article-caption-only">${esc(sections.caption)}</p>` : '')}
      ${sections.body ? `<div class="visual-article-body">${articleText(sections.body)}</div>` : '<p class="visual-article-empty">正文會顯示在這裡。</p>'}
      ${sections.afterword ? `<div class="visual-article-afterword"><hr /><p class="visual-article-afterword-label">後記</p><div>${articleText(sections.afterword)}</div></div>` : ''}`;
    fillPhotoSlots(container);
  }

  function renderPreview() {
    const root = document.getElementById('visualWorkspace');
    const entry = activeEntry();
    const article = root?.querySelector('#visualPreviewArticle');
    if (!article) return;
    article.dataset.width = previewWidth;
    if (!entry) {
      article.innerHTML = '<p class="visual-article-empty">新增一則圖文後，預覽會顯示在這裡。</p>';
      return;
    }
    renderArticle(article, entry, { platform: previewPlatform });
    fitPreview();
  }

  // Scale the page to the column it sits in, never up; say so when it is smaller than life.
  const PREVIEW_WIDTH_PX = { phone: 390, desktop: 760 };
  let previewResize = null;
  function fitPreview() {
    const root = document.getElementById('visualWorkspace');
    const stage = root?.querySelector('.visual-preview-stage');
    const article = root?.querySelector('#visualPreviewArticle');
    const label = root?.querySelector('#visualPreviewScale');
    if (!stage || !article || !label) return;
    if (!previewResize && 'ResizeObserver' in window) {
      previewResize = new ResizeObserver(() => fitPreview());
      previewResize.observe(stage);
    }
    const width = PREVIEW_WIDTH_PX[previewWidth] || 390;
    const available = stage.clientWidth - 8;
    const scale = available > 0 ? Math.min(1, available / width) : 1;
    article.style.zoom = scale < 1 ? scale.toFixed(3) : '';
    label.textContent = `${previewWidth === 'phone' ? '手機' : '桌面'}寬 ${width}px${scale < 1 ? `，縮小為 ${Math.round(scale * 100)}% 顯示` : ''}`;
  }

  function render() {
    const root = ensureWorkspace();
    ensureDialogs();
    if (!root || !isVisual()) return hide();
    window.StoryFlowVisualPhotos.ensureForProject();
    root.hidden = false;
    syncSharedWorkspaceHeader(true);
    document.querySelectorAll('#workspaceView > .workspace-grid').forEach(node => {
      node.hidden = true;
      node.classList.add('visual-workspace-suppressed');
    });
    root.querySelector('#visualReadonlyNote').hidden = !isReadOnly();
    root.querySelector('#visualNewEntryBtn').disabled = isReadOnly();
    renderProjectSwitcher();
    renderList();
    renderLibrary();
    renderEditor();
    renderPreviewControls();
    renderPreview();
  }

  function hide() {
    const root = document.getElementById('visualWorkspace');
    if (root) root.hidden = true;
    replacing = false;
    syncSharedWorkspaceHeader(false);
    document.querySelectorAll('#workspaceView > .workspace-grid').forEach(node => {
      node.hidden = false;
      node.classList.remove('visual-workspace-suppressed');
    });
  }

  // ---------- Behaviour ----------

  function firstSentence(text) {
    const source = String(text || '').trim().split(/\n/)[0] || '';
    const match = /^[\s\S]*?[。！？!?]/.exec(source);
    return (match ? match[0] : source).trim();
  }

  function jumpToNextMark() {
    const entry = activeEntry();
    if (!entry) return;
    const fields = ['visualEntryQuote', 'visualEntryCaption', 'visualEntryBody'].map(id => document.getElementById(id));
    const marks = [];
    fields.forEach(field => {
      const pattern = /【待(?:補|確認)[^】\n]{0,40}】?/g;
      for (let match = pattern.exec(field.value); match; match = pattern.exec(field.value)) {
        marks.push({ field, start: match.index, end: match.index + match[0].length });
      }
    });
    if (!marks.length) return;
    const active = document.activeElement;
    const after = marks.find(mark => fields.indexOf(mark.field) > fields.indexOf(active)
      || (mark.field === active && mark.start >= (active.selectionEnd ?? 0)));
    const target = after || marks[0];
    target.field.focus();
    target.field.setSelectionRange(target.start, target.end);
  }

  function bindWorkspace(root) {
    root.querySelector('#visualNewEntryBtn').addEventListener('click', openEntryDialog);
    root.querySelector('#visualEditorEmpty').addEventListener('click', event => {
      if (event.target.closest?.('#visualEmptyNewEntry')) openEntryDialog();
    });
    root.querySelector('#visualEntryList').addEventListener('click', async event => {
      const more = event.target.closest('.visual-entry-more');
      if (more) {
        event.preventDefault();
        event.stopPropagation();
        const menu = more.closest('.visual-entry-row')?.querySelector('.visual-entry-action-menu');
        if (!menu) return;
        const opening = menu.hidden;
        closeEntryMenus(opening ? menu : null);
        menu.hidden = !opening;
        more.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) {
          window.StoryFlowAnchoredMenu?.open?.(menu);
          menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
        } else {
          window.StoryFlowAnchoredMenu?.close?.(menu);
        }
        return;
      }
      const edit = event.target.closest('[data-edit-entry]');
      const remove = event.target.closest('[data-delete-entry]');
      const select = event.target.closest('.visual-entry-select[data-entry-id]');
      const targetId = edit?.dataset.editEntry || select?.dataset.entryId;
      if (remove) {
        event.preventDefault();
        closeEntryMenus();
        await deleteEntry(remove.dataset.deleteEntry);
        return;
      }
      if (!targetId) return;
      event.preventDefault();
      closeEntryMenus();
      await flushAutoSave('visual-entry-switch');
      activeEntryId = targetId;
      replacing = false;
      render();
      if (edit) requestAnimationFrame(() => document.getElementById('visualEntryTitle')?.focus({ preventScroll: true }));
    });

    root.querySelector('#visualProjectTitle').addEventListener('input', event => {
      state.projectTitle = event.target.value;
      saveState('作品名稱已更新');
    });
    const bindField = (id, key) => root.querySelector(`#${id}`).addEventListener('input', event => {
      const entry = activeEntry();
      if (!entry || isReadOnly()) return;
      entry[key] = event.target.value;
      markChanged();
      renderMeta();
      renderPreview();
      if (key === 'title') { renderList(); renderLibrary(); }
    });
    bindField('visualEntryTitle', 'title');
    bindField('visualEntryQuote', 'quote');
    bindField('visualEntryCaption', 'caption');
    bindField('visualEntryBody', 'body');
    root.querySelector('#visualEditorForm').addEventListener('submit', event => event.preventDefault());

    root.querySelector('#visualQuoteFromBody').addEventListener('click', () => {
      const entry = activeEntry();
      const sentence = firstSentence(entry?.body);
      if (!entry || isReadOnly()) return;
      if (!sentence) return notify('正文還沒有可以帶入的句子。', true);
      const previous = entry.quote;
      entry.quote = sentence;
      markChanged();
      render();
      if (previous.trim()) offerUndo('已帶入引言', () => { entry.quote = previous; markChanged(); render(); });
    });

    root.querySelector('#visualRetrySaveBtn').addEventListener('click', () => flushAutoSave('visual-entry-retry'));
    root.querySelector('#visualPendingMarks').addEventListener('click', jumpToNextMark);

    root.querySelector('#visualReplacePhoto').addEventListener('click', () => {
      replacing = !replacing;
      libraryOpen = true;
      render();
      if (replacing) root.querySelector('#visualPhotoGrid .visual-photo-choose')?.focus({ preventScroll: false });
    });
    root.querySelector('#visualPhotoModeCancel').addEventListener('click', () => { replacing = false; render(); });
    root.querySelector('#visualRemovePhoto').addEventListener('click', event => confirmInPlace(event.currentTarget, removePhotoFromEntry));

    const photoSlot = root.querySelector('#visualEntryPhoto');
    photoSlot.addEventListener('click', event => {
      if (event.target.closest('.visual-entry-photo-open')) return openPhotoDialog(activeEntry()?.photoId);
      if (event.target.closest('.visual-entry-photo-pick')) {
        if (!photos().length) return openFolderDialog();
        libraryOpen = true;
        renderLibrary();
        root.querySelector('#visualPhotoGrid .visual-photo-choose')?.focus();
      }
    });
    photoSlot.addEventListener('dragover', event => {
      if (isReadOnly() || !event.dataTransfer?.types?.includes('text/storyflow-photo')) return;
      event.preventDefault();
      photoSlot.classList.add('is-drop-target');
    });
    photoSlot.addEventListener('dragleave', () => photoSlot.classList.remove('is-drop-target'));
    photoSlot.addEventListener('drop', event => {
      photoSlot.classList.remove('is-drop-target');
      const photoId = event.dataTransfer?.getData('text/storyflow-photo');
      if (!photoId) return;
      event.preventDefault();
      usePhoto(photoId);
    });

    root.querySelector('#visualPhotoLibraryToggle').addEventListener('click', () => {
      libraryOpen = !libraryOpen;
      renderLibrary();
    });
    root.querySelector('#visualPhotoFilters').addEventListener('click', event => {
      const button = event.target.closest('[data-photo-filter]');
      if (!button) return;
      photoFilter = button.dataset.photoFilter;
      renderLibrary();
    });
    const grid = root.querySelector('#visualPhotoGrid');
    // A photo is chosen by clicking it; ⤢ (or a double click) looks closer first.
    grid.addEventListener('click', event => {
      const tile = event.target.closest('.visual-photo-tile');
      if (!tile) return;
      if (event.target.closest('.visual-photo-zoom') || isReadOnly() || !activeEntry()) {
        return openPhotoDialog(tile.dataset.photoId);
      }
      if (event.target.closest('.visual-photo-choose')) usePhoto(tile.dataset.photoId);
    });
    grid.addEventListener('dblclick', event => {
      const tile = event.target.closest('.visual-photo-tile');
      if (tile) openPhotoDialog(tile.dataset.photoId);
    });
    grid.addEventListener('dragstart', event => {
      const tile = event.target.closest('.visual-photo-tile');
      if (!tile || isReadOnly()) return event.preventDefault();
      event.dataTransfer.setData('text/storyflow-photo', tile.dataset.photoId);
      event.dataTransfer.effectAllowed = 'copy';
    });
    root.querySelector('#visualAddPhotosBtn').addEventListener('click', addPhotosFromDrive);
    root.querySelector('#visualChooseFolderBtn').addEventListener('click', openFolderDialog);
    root.querySelector('#visualRefreshFolderBtn').addEventListener('click', () => applyFolder(state.photoFolder, { refresh: true }));

    root.querySelector('#visualPreviewWidths').addEventListener('click', event => {
      const button = event.target.closest('[data-preview-width]');
      if (!button) return;
      previewWidth = button.dataset.previewWidth;
      renderPreviewControls();
      renderPreview();
    });
    root.querySelector('#visualPreviewPlatform').addEventListener('change', event => {
      previewPlatform = event.target.value;
      renderPreview();
    });
    root.querySelector('.visual-pane-switch').addEventListener('click', event => {
      const button = event.target.closest('[data-pane]');
      if (!button) return;
      narrowPane = button.dataset.pane;
      renderPreviewControls();
    });
  }

  async function deleteEntry(entryId = activeEntry()?.id) {
    if (isReadOnly()) {
      notify('手機目前為唯讀，無法刪除圖文。', true);
      return false;
    }
    if (!isVisual()) return false;
    const list = entries();
    const entry = list.find(item => item.id === entryId);
    if (!entry || !confirm(`刪除圖文「${entry.title}」？\n\n文字會先備份到 Recovery。照片留在 Google Drive 與照片庫，不會刪除。`)) return false;
    try {
      await flushAutoSave('before-visual-entry-delete');
      await window.StoryFlowProjectPersistence?.prepareRecovery?.('before-visual-entry-delete');
      await StoryFlowIntegrations.removeVisualEntryFiles({ projectTitle: state.projectTitle, entryId: entry.id, entry });
      const index = list.findIndex(item => item.id === entry.id);
      list.splice(index, 1);
      dirtyEntryIds.delete(entry.id);
      if (pendingAutoSaveEntryId === entry.id) pendingAutoSaveEntryId = null;
      if (activeEntryId === entry.id || !list.some(item => item.id === activeEntryId)) {
        activeEntryId = list[Math.min(index, list.length - 1)]?.id || null;
      }
      saveState('圖文已刪除');
      const saved = await window.StoryFlowProjectPersistence?.flush?.('visual-entry-delete');
      if (saved === false) throw new Error('工作區尚未寫入 StoryFlow 資料夾；Recovery 已保存刪除前的內容。');
      window.dispatchEvent(new CustomEvent('storyflow:visual-entry-changed', {
        detail: { projectId: window.StoryFlowProjects?.activeId?.(), entryId: entry.id, deleted: true }
      }));
      render();
      notify(`已刪除圖文：${entry.title}`);
      return true;
    } catch (error) {
      notify(`尚未刪除圖文：${error.message}`, true);
      return false;
    }
  }

  async function openEntry(entryId) {
    if (!isVisual() || !entries().some(entry => entry.id === entryId)) return false;
    await flushAutoSave('visual-entry-switch');
    activeEntryId = entryId;
    window.StoryFlowNavigate?.('workspace');
    queueMicrotask(render);
    return true;
  }

  window.addEventListener('storyflow:projects-changed', () => {
    activeEntryId = null;
    replacing = false;
    if (isVisual()) queueMicrotask(render);
    else hide();
  });
  window.addEventListener('storyflow:view-changed', event => {
    if (event.detail?.view === 'workspace' && isVisual()) queueMicrotask(render);
    else if (isVisual()) flushAutoSave('visual-view-change');
  });
  window.addEventListener('storyflow:mobile-safe-mode-changed', () => { if (isVisual()) render(); });
  // Signing in to Google makes photos that could not be read readable.
  window.addEventListener('storyflow:connection-changed', () => {
    if (!isVisual() || !StoryFlowIntegrations.hasGoogleToken?.()) return;
    window.StoryFlowVisualPhotos.clearSignedOutErrors();
    queueMicrotask(render);
  });

  document.addEventListener('click', event => {
    if (!event.target.closest?.('#visualProjectSwitchBtn, #visualProjectMenu')) closeProjectMenu();
    if (!event.target.closest?.('.visual-entry-more, .visual-entry-action-menu')) closeEntryMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    closeProjectMenu();
    // Esc leaves 換一張 before it closes anything else (REDESIGN_PROPOSAL B2).
    if (replacing && ![...document.querySelectorAll('dialog[open]')].some(dialog => dialog.matches(':modal'))) {
      replacing = false;
      render();
    }
  });
  document.addEventListener('click', event => {
    const switchButton = event.target.closest?.('#visualProjectSwitchBtn');
    if (!switchButton || switchButton.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const menu = document.getElementById('visualProjectMenu');
    if (!menu) return;
    const opening = menu.hidden;
    menu.hidden = !opening;
    switchButton.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  });
  // The empty-workspace starters offer Google/manual before a work exists; intercept them so
  // every new work chooses its type first, and source selection stays the second step.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#createProjectFromGoogle, #createProjectManually');
    if (!button || !window.StoryFlowProjects?.isActivePlaceholder?.()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTypeChooser();
  }, true);

  window.addEventListener('beforeunload', event => {
    if (!autoSaveTimer && !pendingAutoSaveEntryId) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.StoryFlowVisualWorkspace = {
    openTypeChooser, openEntry, deleteEntry, render, hide, renderArticle,
    flush: flushAutoSave,
    activeEntry: () => activeEntry()
  };
  if (isVisual()) render();
})();
