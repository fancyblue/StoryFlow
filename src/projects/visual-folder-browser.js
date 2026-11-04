// Visual folder browser: StoryFlow's own Drive folder chooser for a visual work's photos.
//
// Lists folders under drive.readonly (StoryFlowIntegrations.listDriveFolders /
// describeDriveFolder, src/source/google-docs.js) and hands the chosen folder back to the
// caller. It changes nothing itself: the visual workspace applies the folder to the library,
// with its own read-only guard and 復原.
(function () {
  const { esc } = window.StoryFlowShared;

  let onChoose = null;

  // Folders used before, newest work first, for 最近使用.
  function recentFolders() {
    const seen = new Set();
    const list = [];
    const add = folder => {
      if (!folder?.id || seen.has(folder.id)) return;
      seen.add(folder.id);
      list.push(folder);
    };
    add(state?.photoFolder);
    sessionFolders.forEach(add);
    (window.StoryFlowProjects?.searchSnapshot?.() || []).forEach(project => add(project.state?.photoFolder));
    return list;
  }
  const sessionFolders = [];

  // A folder the writer chose in this tab, so 最近使用 lists it before the work is saved.
  function remember(folder) {
    if (folder?.id && !sessionFolders.some(item => item.id === folder.id)) sessionFolders.unshift({ id: folder.id, name: folder.name });
  }

  function ensureDialog() {
    if (document.getElementById('visualFolderDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'visualFolderDialog';
    dialog.className = 'visual-folder-dialog';
    dialog.setAttribute('aria-labelledby', 'visualFolderDialogTitle');
    dialog.innerHTML = `<div class="dialog-card visual-folder-dialog-card">
      <div class="panel-head"><div><h3 id="visualFolderDialogTitle">選擇照片資料夾</h3></div><button class="icon-button" type="button" data-folder-close aria-label="關閉">×</button></div>
      <div class="visual-folder-toolbar">
        <div class="sf-preview-mode-segment visual-folder-places" role="group" aria-label="位置">
          <button type="button" data-folder-place="mine" aria-pressed="true">我的雲端硬碟</button>
          <button type="button" data-folder-place="shared" aria-pressed="false">與我共用</button>
          <button type="button" data-folder-place="recent" aria-pressed="false">最近使用</button>
        </div>
        <label class="sf-visually-hidden" for="visualFolderSearch">搜尋資料夾名稱</label>
        <input id="visualFolderSearch" class="text-input visual-folder-search" type="search" placeholder="搜尋資料夾名稱" autocomplete="off" />
      </div>
      <nav id="visualFolderPath" class="visual-folder-path" aria-label="資料夾路徑"></nav>
      <div class="visual-folder-body">
        <div id="visualFolderList" class="visual-folder-list" aria-live="polite"></div>
        <aside id="visualFolderSummary" class="visual-folder-summary" aria-live="polite"></aside>
      </div>
    </div>`;
    document.body.appendChild(dialog);
    bindFolderDialog(dialog);
  }

  const folderNav = { place: 'mine', path: [], search: '', token: 0, summaryToken: 0 };
  let folderSearchTimer = null;

  function currentFolder() {
    const last = folderNav.path[folderNav.path.length - 1];
    return last?.id && last.id !== 'root' ? last : null;
  }

  function openFolderDialog({ onChoose: choose } = {}) {
    onChoose = choose || null;
    ensureDialog();
    const dialog = document.getElementById('visualFolderDialog');
    dialog.querySelector('#visualFolderSearch').value = '';
    folderNav.search = '';
    const recent = recentFolders();
    if (state.photoFolder?.id) showFolderPlace('recent', { open: state.photoFolder });
    else showFolderPlace(recent.length ? 'recent' : 'mine');
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('#visualFolderSearch').focus({ preventScroll: true });
  }

  function showFolderPlace(place, { open = null } = {}) {
    folderNav.place = place;
    const root = place === 'mine' ? { id: 'root', name: '我的雲端硬碟' }
      : place === 'shared' ? { id: '', name: '與我共用' }
        : { id: '', name: '最近使用' };
    folderNav.path = open ? [root, open] : [root];
    renderFolderBrowser();
  }

  function renderFolderPath() {
    const nav = document.getElementById('visualFolderPath');
    nav.innerHTML = folderNav.path.map((item, index) => index === folderNav.path.length - 1
      ? `<span aria-current="location">${esc(item.name)}</span>`
      : `<button type="button" data-folder-depth="${index}">${esc(item.name)}</button><span aria-hidden="true">›</span>`).join('');
    document.querySelectorAll('#visualFolderDialog [data-folder-place]').forEach(button =>
      button.setAttribute('aria-pressed', String(!folderNav.search && button.dataset.folderPlace === folderNav.place)));
  }

  function folderRows(folders, empty) {
    return folders.length
      ? folders.map(folder => `<button type="button" class="visual-folder-row${state.photoFolder?.id === folder.id ? ' is-current' : ''}" data-folder-id="${esc(folder.id)}" data-folder-name="${esc(folder.name)}"><span class="visual-folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg></span><span class="visual-folder-name">${esc(folder.name)}</span>${state.photoFolder?.id === folder.id ? '<small>目前的照片來源</small>' : ''}<span aria-hidden="true">›</span></button>`).join('')
      : `<p class="visual-folder-empty">${empty}</p>`;
  }

  async function renderFolderBrowser() {
    renderFolderPath();
    const list = document.getElementById('visualFolderList');
    const token = ++folderNav.token;
    const current = currentFolder();
    renderFolderSummary(current);
    if (!folderNav.search && folderNav.place === 'recent' && !current) {
      list.innerHTML = folderRows(recentFolders(), '還沒有用過的照片資料夾。到「我的雲端硬碟」找一個吧。');
      return;
    }
    list.innerHTML = '<p class="visual-folder-empty">讀取中…</p>';
    try {
      const folders = folderNav.search
        ? await StoryFlowIntegrations.listDriveFolders({ search: folderNav.search })
        : await StoryFlowIntegrations.listDriveFolders(current
          ? { parentId: current.id }
          : folderNav.place === 'shared' ? { shared: true } : { parentId: 'root' });
      if (token !== folderNav.token) return;
      list.innerHTML = folderRows(folders, folderNav.search ? '沒有名稱符合的資料夾。' : current ? '這裡沒有子資料夾。' : '這裡沒有資料夾。');
    } catch (error) {
      if (token !== folderNav.token) return;
      list.innerHTML = `<p class="visual-folder-empty error-text">讀不到資料夾：${esc(error.message)}</p>`;
    }
  }

  async function renderFolderSummary(folder) {
    const aside = document.getElementById('visualFolderSummary');
    const token = ++folderNav.summaryToken;
    if (!folder) {
      aside.innerHTML = '<p class="visual-folder-empty">點左邊的資料夾，這裡會顯示裡面有幾張照片。</p>';
      return;
    }
    aside.innerHTML = `<strong class="visual-folder-summary-name">${esc(folder.name)}</strong><p class="visual-folder-empty">讀取中…</p>`;
    try {
      const info = await StoryFlowIntegrations.describeDriveFolder(folder.id);
      if (token !== folderNav.summaryToken) return;
      const current = state.photoFolder?.id === folder.id;
      aside.innerHTML = `
        <strong class="visual-folder-summary-name">${esc(folder.name)}</strong>
        <p class="visual-folder-summary-count">這一層 ${info.photoCount}${info.more ? '+' : ''} 張照片${info.subfolderCount ? ` · ${info.subfolderCount} 個子資料夾（裡面的照片也會一併加入）` : ''}</p>
        <div class="visual-folder-samples">${info.samples.map(sample => `<span class="visual-photo-thumb" data-drive-thumb="${esc(sample.driveFileId)}"><span>${esc(sample.name)}</span></span>`).join('')}</div>
        <button id="visualUseFolderBtn" class="button primary" type="button" ${current ? 'disabled' : ''}>${current ? '已是目前的照片來源' : '使用這個資料夾'}</button>`;
      aside.querySelectorAll('[data-drive-thumb]').forEach(slot => {
        const sample = { driveFileId: slot.dataset.driveThumb };
        window.StoryFlowVisualPhotos.loadThumb(sample).then(url => {
          if (!slot.isConnected) return;
          // A preview that cannot be read says why, rather than leaving only the file name.
          if (url) slot.innerHTML = `<img src="${url}" alt="" />`;
          else {
            slot.classList.add('is-missing');
            slot.innerHTML = `<span>${esc(window.StoryFlowVisualPhotos.problem(sample) || '照片暫時讀不到')}</span>`;
          }
        });
      });
    } catch (error) {
      if (token !== folderNav.summaryToken) return;
      aside.innerHTML = `<strong class="visual-folder-summary-name">${esc(folder.name)}</strong><p class="visual-folder-empty error-text">讀不到這個資料夾：${esc(error.message)}</p>`;
    }
  }

  function bindFolderDialog(dialog) {
    dialog.querySelector('[data-folder-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('.visual-folder-places').addEventListener('click', event => {
      const button = event.target.closest('[data-folder-place]');
      if (!button) return;
      dialog.querySelector('#visualFolderSearch').value = '';
      folderNav.search = '';
      showFolderPlace(button.dataset.folderPlace);
    });
    dialog.querySelector('#visualFolderSearch').addEventListener('input', event => {
      clearTimeout(folderSearchTimer);
      folderSearchTimer = window.setTimeout(() => {
        folderNav.search = event.target.value.trim();
        folderNav.path = [{ id: '', name: folderNav.search ? `搜尋「${folderNav.search}」` : '我的雲端硬碟' }];
        if (!folderNav.search) return showFolderPlace('mine');
        renderFolderBrowser();
      }, 300);
    });
    dialog.querySelector('#visualFolderPath').addEventListener('click', event => {
      const button = event.target.closest('[data-folder-depth]');
      if (!button) return;
      folderNav.path = folderNav.path.slice(0, Number(button.dataset.folderDepth) + 1);
      renderFolderBrowser();
    });
    dialog.querySelector('#visualFolderList').addEventListener('click', event => {
      const row = event.target.closest('[data-folder-id]');
      if (!row) return;
      folderNav.search = '';
      folderNav.path = [...folderNav.path, { id: row.dataset.folderId, name: row.dataset.folderName }];
      renderFolderBrowser();
    });
    dialog.querySelector('#visualFolderSummary').addEventListener('click', async event => {
      if (!event.target.closest('#visualUseFolderBtn')) return;
      const folder = currentFolder();
      if (!folder) return;
      dialog.close();
      await onChoose?.(folder);
    });
  }

  window.StoryFlowVisualFolderBrowser = { open: openFolderDialog, remember };
})();
