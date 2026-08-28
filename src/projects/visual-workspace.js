// Phase 1 visual-content workspace. Visual series share StoryFlow's project store,
// persistence queue and Recovery rules, but never enter the longform split UI.
(function () {
  let activeEntryId = null;
  let draggedImageId = null;
  let objectUrls = [];
  const dirtyEntryIds = new Set();

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[char]));

  function isVisual() {
    return state?.contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL;
  }

  function isReadOnly() {
    return Boolean(window.StoryFlowMobileSafeMode?.isReadOnly?.());
  }

  function entries() {
    state.visualEntries ||= [];
    return state.visualEntries;
  }

  function activeEntry() {
    const list = entries();
    if (!list.some(entry => entry.id === activeEntryId)) activeEntryId = list[0]?.id || null;
    return list.find(entry => entry.id === activeEntryId) || null;
  }

  function revokeObjectUrls() {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];
  }

  function markChanged(label = '圖文編輯中') {
    const entry = activeEntry();
    if (entry) {
      entry.updatedAt = new Date().toISOString();
      dirtyEntryIds.add(entry.id);
    }
    saveState(label);
    renderPublishingAction();
    window.dispatchEvent(new CustomEvent('storyflow:visual-entry-changed', {
      detail: { projectId: window.StoryFlowProjects?.activeId?.(), entryId: entry?.id || null }
    }));
  }

  function ensureWorkspace() {
    const workspaceView = document.getElementById('workspaceView');
    if (!workspaceView) return null;
    let visual = document.getElementById('visualWorkspace');
    if (visual) return visual;
    visual = document.createElement('section');
    visual.id = 'visualWorkspace';
    visual.className = 'visual-workspace';
    visual.hidden = true;
    visual.innerHTML = `
      <header class="visual-workspace-head">
        <div>
          <p class="eyebrow">STORYFLOW / VISUAL WORKSPACE</p>
          <div class="visual-workspace-head-copy"><h1 id="visualProjectTitle"></h1><span class="visual-mode-badge">圖文系列</span></div>
          <p class="muted">編排文字與私人圖片；StoryFlow 不會把圖片上傳到發布平台。</p>
        </div>
        <button id="visualNewEntryBtn" class="button primary" type="button">＋ 新增圖文</button>
      </header>
      <div id="visualReadonlyNote" class="visual-readonly-note" hidden>手機目前為唯讀：可以閱讀與預覽，但不會新增、排序、匯入、刪除或保存。</div>
      <div class="visual-workspace-layout">
        <aside class="panel visual-entry-list-panel">
          <div class="panel-head"><div><p class="eyebrow">ENTRIES</p><h2>圖文清單</h2></div><span id="visualEntryCount" class="muted"></span></div>
          <div id="visualEntryList" class="visual-entry-list"></div>
        </aside>
        <section class="panel visual-editor-panel">
          <div id="visualEditorEmpty" class="visual-editor-empty"></div>
          <form id="visualEditorForm" class="visual-editor-form" hidden>
            <div class="visual-editor-toolbar">
              <label class="visual-field" style="flex:1"><span>圖文標題</span><input id="visualEntryTitle" class="text-input" required maxlength="160" /></label>
              <label class="visual-field visual-editor-status"><span>準備狀態</span><select id="visualEntryStatus" class="text-input"><option value="draft">草稿</option><option value="ready">可發布</option></select></label>
            </div>
            <label class="visual-field"><span>正文</span><textarea id="visualEntryBody" class="text-input visual-body-input" placeholder="輸入圖文正文；可使用 Markdown。"></textarea></label>
            <section class="visual-image-section">
              <div class="visual-image-section-head"><div><strong>圖片與封面</strong><p class="muted">拖曳或使用箭頭排序；點「編輯」維護替代文字、圖說與封面。</p></div><button id="visualImportImagesBtn" class="button ghost" type="button">匯入圖片</button></div>
              <input id="visualImageInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden />
              <div id="visualImageGrid" class="visual-image-grid"></div>
            </section>
            <section class="visual-preview" aria-label="圖文基本預覽">
              <p class="eyebrow">PREVIEW</p><h2 id="visualPreviewTitle"></h2><div id="visualPreviewBody" class="visual-preview-body"></div><div id="visualPreviewImages" class="visual-preview-images"></div>
            </section>
            <footer class="visual-editor-footer"><span id="visualEditorMeta" class="muted"></span><div class="visual-editor-footer-actions"><button id="visualDeleteEntryBtn" class="button ghost" type="button">刪除圖文</button><button id="visualOpenPublishingBtn" class="button ghost" type="button" hidden>前往發布 →</button><button id="visualSaveEntryBtn" class="button primary" type="submit">保存草稿</button></div></footer>
          </form>
        </section>
      </div>`;
    workspaceView.appendChild(visual);
    bindWorkspace(visual);
    return visual;
  }

  function ensureDialogs() {
    if (!document.getElementById('visualTypeDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'visualTypeDialog';
      dialog.className = 'visual-type-dialog';
      dialog.setAttribute('aria-labelledby', 'visualTypeDialogTitle');
      dialog.innerHTML = `<form method="dialog" class="dialog-card">
        <div class="panel-head"><div><p class="eyebrow">NEW WORK</p><h3 id="visualTypeDialogTitle">選擇作品類型</h3></div><button class="icon-button" value="cancel" aria-label="關閉">×</button></div>
        <div id="visualTypeOptions" class="visual-type-options">
          <button id="chooseLongformType" class="visual-type-option" type="button"><strong>長文作品</strong><span>Google Docs／手動來源、Smart Split、切篇確認與發布。</span></button>
          <button id="chooseVisualType" class="visual-type-option" type="button"><strong>圖文系列</strong><span>文字、多張圖片、封面、圖說、替代文字、排序與基本預覽。</span></button>
        </div>
        <div id="visualSeriesCreatePanel" class="visual-dialog-fields" hidden>
          <label class="visual-field"><span>系列名稱</span><input id="visualSeriesTitle" class="text-input" required maxlength="160" /></label>
          <label class="format-check"><input id="visualCreateFirstEntry" type="checkbox" checked /><span>同時新增第一則圖文</span></label>
          <label id="visualFirstEntryField" class="visual-field"><span>第一則圖文標題</span><input id="visualFirstEntryTitle" class="text-input" value="第一則圖文" maxlength="160" /></label>
          <div class="visual-dialog-actions"><button id="visualTypeBack" class="button ghost" type="button">返回</button><button id="createVisualSeriesBtn" class="button primary" type="button">建立圖文系列</button></div>
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
        <div class="panel-head"><div><p class="eyebrow">NEW ENTRY</p><h3 id="visualEntryDialogTitle">新增圖文</h3></div><button class="icon-button" value="cancel" aria-label="關閉">×</button></div>
        <div class="visual-dialog-fields"><label class="visual-field"><span>圖文標題</span><input id="newVisualEntryTitle" class="text-input" required maxlength="160" /></label></div>
        <div class="visual-dialog-actions"><button class="button ghost" value="cancel">取消</button><button id="confirmNewVisualEntry" class="button primary" type="button">新增圖文</button></div>
      </form>`;
      document.body.appendChild(dialog);
      dialog.querySelector('#confirmNewVisualEntry').addEventListener('click', createEntryFromDialog);
    }

    if (!document.getElementById('visualImageDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'visualImageDialog';
      dialog.className = 'visual-image-dialog';
      dialog.setAttribute('aria-labelledby', 'visualImageDialogTitle');
      dialog.innerHTML = `<form method="dialog" class="dialog-card">
        <div class="panel-head"><div><p class="eyebrow">IMAGE</p><h3 id="visualImageDialogTitle">編輯圖片資訊</h3></div><button class="icon-button" value="cancel" aria-label="關閉">×</button></div>
        <img id="visualImageDialogPreview" class="visual-image-dialog-preview" alt="" hidden />
        <div class="visual-dialog-fields"><label class="visual-field"><span>替代文字</span><input id="visualImageAlt" class="text-input" maxlength="300" /></label><label class="visual-field"><span>圖說（選填）</span><textarea id="visualImageCaption" class="text-input" rows="3"></textarea></label><label class="format-check"><input id="visualImageCover" type="checkbox" /><span>設為這則圖文的封面</span></label></div>
        <div class="visual-dialog-actions"><button id="visualRemoveImageAssociation" class="button ghost" type="button">移除關聯並保留檔案</button><button id="visualDeleteImageFile" class="button ghost" type="button">備份後刪除檔案</button><button id="visualSaveImageMeta" class="button primary" type="button">保存圖片資訊</button></div>
      </form>`;
      document.body.appendChild(dialog);
      bindImageDialog(dialog);
    }
  }

  function bindTypeDialog(dialog) {
    const options = dialog.querySelector('#visualTypeOptions');
    const panel = dialog.querySelector('#visualSeriesCreatePanel');
    const firstToggle = dialog.querySelector('#visualCreateFirstEntry');
    const showOptions = () => { options.hidden = false; panel.hidden = true; };
    dialog.querySelector('#chooseLongformType').addEventListener('click', () => {
      dialog.close();
      window.StoryFlowStartNewWork?.({ contentMode: 'longform' });
    });
    dialog.querySelector('#chooseVisualType').addEventListener('click', () => {
      options.hidden = true; panel.hidden = false;
      dialog.querySelector('#visualSeriesTitle').focus();
    });
    dialog.querySelector('#visualTypeBack').addEventListener('click', showOptions);
    firstToggle.addEventListener('change', () => {
      dialog.querySelector('#visualFirstEntryField').hidden = !firstToggle.checked;
    });
    dialog.querySelector('#createVisualSeriesBtn').addEventListener('click', () => {
      if (isReadOnly()) return notify('手機目前為唯讀，無法建立圖文系列。', true);
      const title = dialog.querySelector('#visualSeriesTitle').value.trim();
      if (!title) return dialog.querySelector('#visualSeriesTitle').reportValidity();
      const now = new Date().toISOString();
      const entryTitle = dialog.querySelector('#visualFirstEntryTitle').value.trim();
      const visualEntry = firstToggle.checked ? {
        id: crypto.randomUUID(), title: entryTitle || '第一則圖文', body: '', status: 'draft', images: [],
        coverImageId: '', platformTitles: {}, platformStatus: {}, publicationRecords: {}, createdAt: now, updatedAt: now
      } : null;
      const project = window.StoryFlowProjects?.createProject?.({ title, contentMode: 'visual', visualEntry }, { quiet: true });
      if (!project) return;
      activeEntryId = visualEntry?.id || null;
      dialog.close();
      saveState('圖文系列已建立');
      window.StoryFlowNavigate?.('workspace');
      render();
      notify(`已建立圖文系列：${title}`);
      showOptions();
    });
    dialog.addEventListener('close', showOptions);
  }

  function openTypeChooser() {
    ensureDialogs();
    const dialog = document.getElementById('visualTypeDialog');
    dialog.querySelector('#visualSeriesTitle').value = '';
    dialog.querySelector('#visualFirstEntryTitle').value = '第一則圖文';
    dialog.querySelector('#visualCreateFirstEntry').checked = true;
    dialog.querySelector('#visualFirstEntryField').hidden = false;
    dialog.showModal();
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

  function createEntryFromDialog() {
    const dialog = document.getElementById('visualEntryDialog');
    const title = dialog.querySelector('#newVisualEntryTitle').value.trim();
    if (!title) return dialog.querySelector('#newVisualEntryTitle').reportValidity();
    const now = new Date().toISOString();
    const entry = StoryFlowContentModel.normalizeVisualEntry({
      id: crypto.randomUUID(), title, body: '', status: 'draft', images: [], coverImageId: '',
      platformTitles: {}, platformStatus: {}, publicationRecords: {}, createdAt: now, updatedAt: now
    });
    entries().push(entry);
    activeEntryId = entry.id;
    dialog.close();
    markChanged('圖文已新增');
    render();
    notify(`已新增圖文：${title}`);
  }

  function bindWorkspace(root) {
    root.querySelector('#visualNewEntryBtn').addEventListener('click', openEntryDialog);
    root.querySelector('#visualEditorEmpty').addEventListener('click', event => {
      if (event.target.closest?.('#visualEmptyNewEntry')) openEntryDialog();
    });
    root.querySelector('#visualEntryList').addEventListener('click', event => {
      const button = event.target.closest('[data-entry-id]');
      if (!button) return;
      activeEntryId = button.dataset.entryId;
      render();
    });
    const title = root.querySelector('#visualEntryTitle');
    const body = root.querySelector('#visualEntryBody');
    const status = root.querySelector('#visualEntryStatus');
    title.addEventListener('input', () => { const entry = activeEntry(); if (entry) { entry.title = title.value; markChanged(); renderPreview(); renderList(); } });
    body.addEventListener('input', () => { const entry = activeEntry(); if (entry) { entry.body = body.value; markChanged(); renderPreview(); renderMeta(); } });
    status.addEventListener('change', () => { const entry = activeEntry(); if (entry) { entry.status = status.value; markChanged(); renderList(); renderMeta(); } });
    root.querySelector('#visualEditorForm').addEventListener('submit', saveEntry);
    root.querySelector('#visualDeleteEntryBtn').addEventListener('click', deleteEntry);
    root.querySelector('#visualOpenPublishingBtn').addEventListener('click', () => {
      const entry = activeEntry();
      if (!entry || !canPublish(entry)) return;
      window.StoryFlowNavigate?.('publishing');
      window.setTimeout(() => window.StoryFlowPublishing?.openPart?.(`visual:${window.StoryFlowProjects?.activeId?.() || state.projectTitle}:${entry.id}`), 0);
    });
    const fileInput = root.querySelector('#visualImageInput');
    root.querySelector('#visualImportImagesBtn').addEventListener('click', () => {
      if (isReadOnly()) return notify('手機目前為唯讀，無法匯入圖片。', true);
      fileInput.click();
    });
    fileInput.addEventListener('change', () => importImages(fileInput));
    root.querySelector('#visualImageGrid').addEventListener('click', handleImageGridClick);
    root.querySelector('#visualImageGrid').addEventListener('dragstart', event => {
      if (isReadOnly()) return event.preventDefault();
      const card = event.target.closest('[data-image-id]');
      if (!card) return;
      draggedImageId = card.dataset.imageId;
      card.classList.add('dragging');
    });
    root.querySelector('#visualImageGrid').addEventListener('dragend', event => {
      event.target.closest('[data-image-id]')?.classList.remove('dragging');
      root.querySelectorAll('.drag-over').forEach(card => card.classList.remove('drag-over'));
      draggedImageId = null;
    });
    root.querySelector('#visualImageGrid').addEventListener('dragover', event => {
      const card = event.target.closest('[data-image-id]');
      if (!card || !draggedImageId || card.dataset.imageId === draggedImageId) return;
      event.preventDefault();
      root.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
      card.classList.add('drag-over');
    });
    root.querySelector('#visualImageGrid').addEventListener('drop', event => {
      const card = event.target.closest('[data-image-id]');
      if (!card || !draggedImageId) return;
      event.preventDefault();
      reorderImage(draggedImageId, card.dataset.imageId);
    });
  }

  async function fileDimensions(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch (_) { return { width: 0, height: 0 }; }
  }

  async function importImages(input) {
    const entry = activeEntry();
    const files = Array.from(input.files || []);
    input.value = '';
    if (!entry || !files.length) return;
    try {
      window.StoryFlowSaveStatus?.set?.('正在匯入圖片…');
      const imported = await StoryFlowIntegrations.importVisualImages({ projectTitle: state.projectTitle, entryId: entry.id, files });
      const dimensions = await Promise.all(files.map(fileDimensions));
      const start = entry.images.length;
      imported.forEach((image, index) => entry.images.push(StoryFlowContentModel.normalizeVisualImage({
        ...image, ...dimensions[index], order: start + index
      }, start + index)));
      if (!entry.coverImageId && entry.images.length) entry.coverImageId = entry.images[0].id;
      markChanged('圖文圖片已更新');
      render();
      const large = imported.filter(image => image.large).length;
      notify(`已匯入 ${imported.length} 張圖片${large ? `；其中 ${large} 張超過 8 MB` : ''}`);
    } catch (error) { notify(`圖片匯入失敗：${error.message}`, true); }
  }

  function moveImage(imageId, delta) {
    if (isReadOnly()) return;
    const entry = activeEntry();
    const index = entry?.images.findIndex(image => image.id === imageId) ?? -1;
    const target = index + delta;
    if (!entry || index < 0 || target < 0 || target >= entry.images.length) return;
    const [image] = entry.images.splice(index, 1);
    entry.images.splice(target, 0, image);
    entry.images.forEach((item, order) => { item.order = order; });
    markChanged('圖文圖片已更新');
    renderImages(); renderPreview();
  }

  function reorderImage(sourceId, targetId) {
    if (isReadOnly() || sourceId === targetId) return;
    const entry = activeEntry();
    const source = entry?.images.findIndex(image => image.id === sourceId) ?? -1;
    const target = entry?.images.findIndex(image => image.id === targetId) ?? -1;
    if (!entry || source < 0 || target < 0) return;
    const [image] = entry.images.splice(source, 1);
    entry.images.splice(target, 0, image);
    entry.images.forEach((item, order) => { item.order = order; });
    markChanged('圖文圖片已更新');
    renderImages(); renderPreview();
  }

  function handleImageGridClick(event) {
    const card = event.target.closest('[data-image-id]');
    if (!card) return;
    if (event.target.closest('[data-move="previous"]')) moveImage(card.dataset.imageId, -1);
    else if (event.target.closest('[data-move="next"]')) moveImage(card.dataset.imageId, 1);
    else if (event.target.closest('[data-edit-image]')) openImageDialog(card.dataset.imageId);
  }

  async function imageUrl(image) {
    try {
      const entry = activeEntry();
      const file = await StoryFlowIntegrations.getVisualImageFile({ projectTitle: state.projectTitle, entryId: entry.id, storedName: image.storedName });
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      return url;
    } catch (_) { return ''; }
  }

  async function openImageDialog(imageId) {
    ensureDialogs();
    const entry = activeEntry();
    const image = entry?.images.find(item => item.id === imageId);
    if (!image) return;
    const dialog = document.getElementById('visualImageDialog');
    dialog.dataset.imageId = image.id;
    dialog.querySelector('#visualImageAlt').value = image.alt || '';
    dialog.querySelector('#visualImageCaption').value = image.caption || '';
    dialog.querySelector('#visualImageCover').checked = entry.coverImageId === image.id;
    const preview = dialog.querySelector('#visualImageDialogPreview');
    const url = await imageUrl(image);
    preview.hidden = !url;
    preview.src = url;
    ['#visualImageAlt', '#visualImageCaption', '#visualImageCover', '#visualRemoveImageAssociation', '#visualDeleteImageFile', '#visualSaveImageMeta']
      .forEach(selector => { const node = dialog.querySelector(selector); if (node) node.disabled = isReadOnly(); });
    dialog.showModal();
  }

  function bindImageDialog(dialog) {
    dialog.querySelector('#visualSaveImageMeta').addEventListener('click', () => {
      const entry = activeEntry();
      const image = entry?.images.find(item => item.id === dialog.dataset.imageId);
      if (!image || isReadOnly()) return;
      image.alt = dialog.querySelector('#visualImageAlt').value.trim();
      image.caption = dialog.querySelector('#visualImageCaption').value.trim();
      if (dialog.querySelector('#visualImageCover').checked) entry.coverImageId = image.id;
      else if (entry.coverImageId === image.id) entry.coverImageId = '';
      dialog.close();
      markChanged('圖文圖片已更新');
      renderImages(); renderPreview();
    });
    dialog.querySelector('#visualRemoveImageAssociation').addEventListener('click', () => removeImage(dialog, false));
    dialog.querySelector('#visualDeleteImageFile').addEventListener('click', () => removeImage(dialog, true));
  }

  async function removeImage(dialog, deleteFile) {
    if (isReadOnly()) return;
    const entry = activeEntry();
    const index = entry?.images.findIndex(item => item.id === dialog.dataset.imageId) ?? -1;
    if (!entry || index < 0) return;
    const image = entry.images[index];
    const message = deleteFile
      ? `刪除圖片檔「${image.storedName}」？\n\nStoryFlow 會先複製到 Recovery/Assets，再刪除私人 assets 中的檔案。`
      : `從這則圖文移除「${image.storedName}」？\n\n圖片檔會保留在私人 assets 資料夾。`;
    if (!confirm(message)) return;
    try {
      await window.StoryFlowProjectPersistence?.prepareRecovery?.('before-visual-image-remove');
      if (deleteFile) await StoryFlowIntegrations.removeVisualImage({ projectTitle: state.projectTitle, entryId: entry.id, storedName: image.storedName });
      entry.images.splice(index, 1);
      entry.images.forEach((item, order) => { item.order = order; });
      if (entry.coverImageId === image.id) entry.coverImageId = '';
      dialog.close();
      markChanged('圖文圖片已更新');
      render();
      notify(deleteFile ? '圖片已備份後刪除' : '已移除圖片關聯；原檔仍保留');
    } catch (error) { notify(`尚未移除圖片：${error.message}`, true); }
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (isReadOnly()) return notify('手機目前為唯讀，無法保存。', true);
    const entry = activeEntry();
    if (!entry) return;
    entry.title = document.getElementById('visualEntryTitle').value.trim();
    if (!entry.title) return document.getElementById('visualEntryTitle').reportValidity();
    entry.body = document.getElementById('visualEntryBody').value;
    entry.status = document.getElementById('visualEntryStatus').value;
    entry.updatedAt = new Date().toISOString();
    try {
      window.StoryFlowSaveStatus?.set?.('保存圖文中…');
      const path = await StoryFlowIntegrations.saveVisualEntry({ projectTitle: state.projectTitle, entry });
      dirtyEntryIds.delete(entry.id);
      saveState('圖文已保存');
      await window.StoryFlowProjectPersistence?.flush?.('visual-entry-save');
      renderList(); renderMeta(); renderPublishingAction();
      notify(`圖文已保存：${path}`);
    } catch (error) { notify(`圖文尚未完整保存：${error.message}`, true); }
  }

  async function deleteEntry() {
    if (isReadOnly()) return notify('手機目前為唯讀，無法刪除圖文。', true);
    const entry = activeEntry();
    if (!entry || !confirm(`刪除圖文「${entry.title}」？\n\n工作區關聯與文字輸出會移除；私人 assets 圖檔預設保留。`)) return;
    try {
      await window.StoryFlowProjectPersistence?.prepareRecovery?.('before-visual-entry-delete');
      await StoryFlowIntegrations.removeVisualEntryFiles({ projectTitle: state.projectTitle, entryId: entry.id, entry });
      const index = entries().findIndex(item => item.id === entry.id);
      entries().splice(index, 1);
      activeEntryId = entries()[Math.min(index, entries().length - 1)]?.id || null;
      markChanged('圖文已刪除');
      render();
      notify(`已刪除圖文：${entry.title}；圖片檔仍保留`);
    } catch (error) { notify(`尚未刪除圖文：${error.message}`, true); }
  }

  function renderList() {
    const root = document.getElementById('visualWorkspace');
    if (!root) return;
    const list = root.querySelector('#visualEntryList');
    const items = entries();
    root.querySelector('#visualEntryCount').textContent = `${items.length} 則`;
    list.innerHTML = items.length ? items.map(entry => `
      <button type="button" data-entry-id="${esc(entry.id)}" class="${entry.id === activeEntryId ? 'active' : ''}">
        <strong>${esc(entry.title || '未命名圖文')}</strong><small>${entry.status === 'ready' ? '可發布' : '草稿'} · ${entry.images?.length || 0} 張圖片</small>
      </button>`).join('') : '<div class="visual-entry-empty">這個系列還沒有圖文。</div>';
  }

  async function renderImages() {
    const grid = document.getElementById('visualImageGrid');
    const entry = activeEntry();
    if (!grid || !entry) return;
    grid.innerHTML = entry.images.length ? entry.images.map((image, index) => `
      <article class="visual-image-card" draggable="${isReadOnly() ? 'false' : 'true'}" data-image-id="${esc(image.id)}">
        ${entry.coverImageId === image.id ? '<span class="visual-cover-badge">封面</span>' : ''}
        <div class="visual-image-thumb" data-image-preview="${esc(image.id)}"><span>正在載入 ${esc(image.storedName)}</span></div>
        <strong title="${esc(image.storedName)}">${esc(image.storedName)}</strong>
        <small>${image.alt ? esc(image.alt) : '尚未填寫替代文字'}${image.caption ? ` · ${esc(image.caption)}` : ''}</small>
        <div class="visual-image-actions"><button class="button tiny ghost" type="button" data-edit-image>編輯</button><button class="button tiny ghost" type="button" data-move="previous" aria-label="向前移動" ${index === 0 || isReadOnly() ? 'disabled' : ''}>←</button><button class="button tiny ghost" type="button" data-move="next" aria-label="向後移動" ${index === entry.images.length - 1 || isReadOnly() ? 'disabled' : ''}>→</button></div>
      </article>`).join('') : '<div class="visual-entry-empty">尚未匯入圖片。文字圖文也可以直接保存。</div>';
    for (const image of entry.images) {
      const holder = grid.querySelector(`[data-image-preview="${CSS.escape(image.id)}"]`);
      const url = await imageUrl(image);
      if (!holder?.isConnected) continue;
      holder.innerHTML = url ? `<img src="${url}" alt="${esc(image.alt || '')}" />` : `<span>找不到私人圖片檔<br>${esc(image.storedName)}</span>`;
    }
  }

  function renderPreview() {
    const entry = activeEntry();
    if (!entry) return;
    document.getElementById('visualPreviewTitle').textContent = entry.title || '未命名圖文';
    document.getElementById('visualPreviewBody').textContent = entry.body || '尚未輸入正文。';
    const preview = document.getElementById('visualPreviewImages');
    preview.innerHTML = entry.images.map(image => `<figure data-preview-image-id="${esc(image.id)}"><div class="visual-image-thumb"><span>正在載入 ${esc(image.storedName)}</span></div>${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ''}</figure>`).join('');
    entry.images.forEach(async image => {
      const figure = preview.querySelector(`[data-preview-image-id="${CSS.escape(image.id)}"]`);
      const url = await imageUrl(image);
      if (!figure?.isConnected) return;
      const holder = figure.querySelector('.visual-image-thumb');
      holder.innerHTML = url ? `<img src="${url}" alt="${esc(image.alt || '')}" />` : `<span>找不到圖片：${esc(image.storedName)}</span>`;
    });
  }

  function renderMeta() {
    const entry = activeEntry();
    const node = document.getElementById('visualEditorMeta');
    if (!entry || !node) return;
    node.textContent = `${charCount(entry.body).toLocaleString()} 字 · ${entry.images.length} 張圖片 · ${entry.status === 'ready' ? '可發布' : '草稿'}`;
  }

  function canPublish(entry) {
    return entry?.status === 'ready'
      && Boolean(String(entry.title || '').trim())
      && (Boolean(String(entry.body || '').trim()) || Boolean(entry.images?.length))
      && !dirtyEntryIds.has(entry.id);
  }

  function renderPublishingAction() {
    const entry = activeEntry();
    const button = document.getElementById('visualOpenPublishingBtn');
    if (!button) return;
    button.hidden = !canPublish(entry);
    button.disabled = isReadOnly() || !canPublish(entry);
  }

  function renderEditor() {
    const root = document.getElementById('visualWorkspace');
    const entry = activeEntry();
    const empty = root.querySelector('#visualEditorEmpty');
    const form = root.querySelector('#visualEditorForm');
    if (!entry) {
      form.hidden = true;
      empty.hidden = false;
      empty.innerHTML = `<div><span class="visual-mode-badge">圖文系列</span><h2>建立第一則圖文</h2><p class="muted">用文字與多張私人圖片組成一則內容；圖片不會上傳至 GitHub Pages。</p><button id="visualEmptyNewEntry" class="button primary" type="button" ${isReadOnly() ? 'disabled' : ''}>新增第一則圖文</button></div>`;
      return;
    }
    empty.hidden = true;
    form.hidden = false;
    root.querySelector('#visualEntryTitle').value = entry.title;
    root.querySelector('#visualEntryBody').value = entry.body;
    root.querySelector('#visualEntryStatus').value = entry.status;
    root.querySelectorAll('#visualEditorForm input, #visualEditorForm textarea, #visualEditorForm select, #visualEditorForm button').forEach(control => {
      if (control.id !== 'visualDeleteEntryBtn') control.disabled = isReadOnly();
    });
    root.querySelector('#visualDeleteEntryBtn').disabled = isReadOnly();
    renderImages(); renderPreview(); renderMeta(); renderPublishingAction();
  }

  function render() {
    const root = ensureWorkspace();
    ensureDialogs();
    if (!root || !isVisual()) return hide();
    revokeObjectUrls();
    root.hidden = false;
    document.querySelectorAll('#workspaceView > .topbar, #workspaceView > .connection-bar, #workspaceView > .stats-grid, #workspaceView > .workspace-grid, #workspacePublishingSummary')
      .forEach(node => {
        node.hidden = true;
        node.classList.add('visual-workspace-suppressed');
      });
    root.querySelector('#visualProjectTitle').textContent = state.projectTitle || '未命名圖文系列';
    root.querySelector('#visualReadonlyNote').hidden = !isReadOnly();
    root.querySelector('#visualNewEntryBtn').disabled = isReadOnly();
    renderList(); renderEditor();
  }

  function openEntry(entryId) {
    if (!isVisual() || !entries().some(entry => entry.id === entryId)) return false;
    activeEntryId = entryId;
    window.StoryFlowNavigate?.('workspace');
    queueMicrotask(render);
    return true;
  }

  function hide() {
    revokeObjectUrls();
    const root = document.getElementById('visualWorkspace');
    if (root) root.hidden = true;
    document.querySelectorAll('#workspaceView > .topbar, #workspaceView > .connection-bar, #workspaceView > .stats-grid, #workspaceView > .workspace-grid, #workspacePublishingSummary')
      .forEach(node => {
        node.hidden = false;
        node.classList.remove('visual-workspace-suppressed');
      });
  }

  window.addEventListener('storyflow:projects-changed', () => {
    activeEntryId = null;
    if (isVisual()) queueMicrotask(render);
  });
  window.addEventListener('storyflow:view-changed', event => {
    if (event.detail?.view === 'workspace' && isVisual()) queueMicrotask(render);
  });
  window.addEventListener('storyflow:mobile-safe-mode-changed', () => { if (isVisual()) render(); });

  // The legacy empty-workspace chooser offered Google/manual before content type.
  // Intercept only the internal starter so every real work now chooses longform or
  // visual first; source selection remains the second step for longform.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#createProjectFromGoogle, #createProjectManually');
    if (!button || !window.StoryFlowProjects?.isActivePlaceholder?.()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTypeChooser();
  }, true);

  window.StoryFlowVisualWorkspace = { openTypeChooser, openEntry, render, hide, activeEntry: () => activeEntry() };
  if (isVisual()) render();
})();
