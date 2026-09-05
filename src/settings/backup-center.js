// Settings-facing workspace backup center. File IO and validation stay in the
// persistence integration; this module presents normal backup/recovery actions.
(function () {
  let busy = false;
  let importCandidate = null;
  let storageSnapshot = null;
  let cleanupPreviewVisible = false;

  const api = () => window.StoryFlowIntegrations;
  const formatDate = value => value
    ? new Date(value).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })
    : '尚無紀錄';
  const formatBytes = value => {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  function ensureUi() {
    const view = document.getElementById('settingsView');
    if (!view) return null;
    let section = document.getElementById('settingsBackupCenter');
    if (section) return section;

    section = document.createElement('section');
    section.id = 'settingsBackupCenter';
    section.className = 'settings-backup-center';
    section.innerHTML = `
      <div class="settings-backup-head">
        <div>
          <p class="eyebrow">DATA &amp; BACKUP</p>
          <h2>備份與復原</h2>
          <p>StoryFlow 會保留上一版工作區、最多 3 份循環備份，並在刪除或覆寫前建立 Recovery。這些操作不會修改 Google Docs 原稿。</p>
        </div>
        <button id="refreshBackupCenterBtn" class="button ghost" type="button">重新檢查</button>
      </div>
      <div id="backupCenterDisconnected" class="backup-center-disconnected" hidden>
        <div><strong>尚未連接 StoryFlow 資料夾</strong><span>連接後即可檢查 workspace.json、建立備份或匯入工作區。</span></div>
        <button id="connectBackupFolderBtn" class="button ghost" type="button">連接資料夾</button>
      </div>
      <div id="backupCenterConnected" hidden>
        <div class="backup-center-folder-row">
          <span>目前資料夾</span><strong id="backupCenterFolderName">—</strong>
        </div>
        <div class="backup-center-status-grid">
          <article id="backupPrimaryCard" class="backup-status-card"></article>
          <article id="backupLatestCard" class="backup-status-card"></article>
          <article id="backupRecoveryCard" class="backup-status-card"></article>
        </div>
        <div class="backup-center-actions">
          <button id="createWorkspaceBackupBtn" class="button ghost" type="button">建立目前備份</button>
          <button id="downloadWorkspaceBtn" class="button ghost" type="button">下載 workspace.json</button>
          <button id="importWorkspaceCenterBtn" class="button ghost" type="button">匯入工作區</button>
          <button id="restoreLatestBackupBtn" class="button ghost" type="button">從最近備份恢復</button>
        </div>
        <section class="backup-storage-panel" aria-labelledby="backupStorageTitle">
          <div class="backup-storage-head">
            <div>
              <h3 id="backupStorageTitle">儲存空間整理</h3>
              <p>只列出 Recovery 與已不在目前工作區中的圖片。仍被文章或圖文引用的圖片不會列入清理。</p>
            </div>
          </div>
          <div class="backup-storage-grid">
            <article id="backupRecoveryJsonUsage" class="backup-storage-card"></article>
            <article id="backupRecoveryImageUsage" class="backup-storage-card"></article>
            <article id="backupOrphanImageUsage" class="backup-storage-card"></article>
          </div>
          <div class="backup-cleanup-controls">
            <label for="backupCleanupAge">只清理超過</label>
            <select id="backupCleanupAge" class="text-input compact-select">
              <option value="30">30 天</option>
              <option value="90">90 天</option>
              <option value="365">1 年</option>
            </select>
            <button id="previewStorageCleanupBtn" class="button ghost" type="button">預覽可清理內容</button>
          </div>
          <div id="backupCleanupPreview" class="backup-cleanup-preview" hidden>
            <div>
              <strong id="backupCleanupSummary">尚未預覽</strong>
              <p id="backupCleanupBreakdown"></p>
              <small>循環備份固定保留最多 3 份，不在這次清理範圍。清理後無法復原。</small>
            </div>
            <button id="confirmStorageCleanupBtn" class="button backup-cleanup-confirm" type="button" data-mobile-safe-write-control="true">確認清理</button>
          </div>
        </section>
      </div>
      <div id="backupImportPreview" class="backup-import-preview" hidden>
        <div><strong>匯入前確認</strong><p id="backupImportSummary"></p><small>匯入會替換目前工作區；替換前的 workspace.json 會保留在 Recovery/。</small></div>
        <div class="backup-import-actions">
          <button id="confirmWorkspaceImportBtn" class="button primary" type="button">確認匯入</button>
          <button id="cancelWorkspaceImportBtn" class="button ghost" type="button">取消</button>
        </div>
      </div>
      <p id="backupCenterStatus" class="backup-center-message" role="status" aria-live="polite"></p>
      <input id="backupCenterFileInput" type="file" accept="application/json,.json" hidden />`;

    const privacy = document.getElementById('storyflowDevicePrivacySection');
    if (privacy?.parentElement === view) view.insertBefore(section, privacy);
    else view.appendChild(section);

    section.querySelector('#refreshBackupCenterBtn').onclick = () => refresh({ announce: true });
    section.querySelector('#connectBackupFolderBtn').onclick = () => document.getElementById('settingsFolderBtn')?.click();
    section.querySelector('#createWorkspaceBackupBtn').onclick = createBackup;
    section.querySelector('#downloadWorkspaceBtn').onclick = downloadWorkspace;
    section.querySelector('#importWorkspaceCenterBtn').onclick = () => section.querySelector('#backupCenterFileInput').click();
    section.querySelector('#restoreLatestBackupBtn').onclick = restoreBackup;
    section.querySelector('#confirmWorkspaceImportBtn').onclick = confirmImport;
    section.querySelector('#cancelWorkspaceImportBtn').onclick = clearImportPreview;
    section.querySelector('#backupCenterFileInput').onchange = handleImportFile;
    section.querySelector('#previewStorageCleanupBtn').onclick = previewStorageCleanup;
    section.querySelector('#confirmStorageCleanupBtn').onclick = confirmStorageCleanup;
    section.querySelector('#backupCleanupAge').onchange = () => {
      cleanupPreviewVisible = false;
      refresh();
    };
    return section;
  }

  function setMessage(message = '', error = false) {
    const node = document.getElementById('backupCenterStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error-text', error);
  }

  function setBusy(next, message = '') {
    busy = next;
    const section = ensureUi();
    if (next) section?.querySelectorAll('button').forEach(button => { button.disabled = true; });
    else if (storageSnapshot) render(storageSnapshot);
    else section?.querySelectorAll('button').forEach(button => { button.disabled = false; });
    if (message) setMessage(message);
  }

  function workspaceLine(record) {
    if (!record) return '尚未建立 workspace.json';
    if (!record.valid) return `檔案無法讀取：${record.error || '格式錯誤'}`;
    return `${record.projectCount} 部作品 · ${record.chapterCount} 個章節 · ${record.partCount} 篇發布稿`;
  }

  function renderCard(node, label, title, copy, tone = '') {
    if (!node) return;
    node.className = `backup-status-card ${tone}`.trim();
    node.innerHTML = `<span>${label}</span><strong>${title}</strong><small>${copy}</small>`;
  }

  function renderStorageCard(node, label, category, unavailable = false) {
    if (!node) return;
    const fileCount = Number(category?.fileCount || 0);
    node.innerHTML = `<span>${label}</span><strong>${formatBytes(category?.bytes)}</strong><small>${
      unavailable ? 'workspace.json 無法讀取，本次不判定' : `${fileCount} 個檔案`
    }</small>`;
  }

  function cleanupDays() {
    return Number(document.getElementById('backupCleanupAge')?.value || api()?.STORAGE_CLEANUP_DEFAULT_DAYS || 30);
  }

  function renderStorageUsage(storage) {
    const usage = storage?.storageUsage || {};
    const categories = usage.categories || {};
    renderStorageCard(document.getElementById('backupRecoveryJsonUsage'), 'Recovery JSON', categories.recoverySnapshots);
    renderStorageCard(document.getElementById('backupRecoveryImageUsage'), 'Recovery 圖片', categories.recoveryImages);
    renderStorageCard(
      document.getElementById('backupOrphanImageUsage'),
      '未被引用的 Works 圖片',
      categories.orphanedImages,
      usage.workspaceScanAvailable === false
    );

    const select = document.getElementById('backupCleanupAge');
    if (select && usage.olderThanDays) select.value = String(usage.olderThanDays);
    const preview = document.getElementById('backupCleanupPreview');
    if (!preview) return;
    preview.hidden = !cleanupPreviewVisible;
    if (!cleanupPreviewVisible) return;

    const candidate = usage.cleanupPreview || {};
    const parts = [
      `Recovery JSON ${Number(categories.recoverySnapshots?.candidateCount || 0)} 個`,
      `Recovery 圖片 ${Number(categories.recoveryImages?.candidateCount || 0)} 個`,
      `未被引用圖片 ${Number(categories.orphanedImages?.candidateCount || 0)} 個`
    ];
    document.getElementById('backupCleanupSummary').textContent =
      `可清理 ${Number(candidate.fileCount || 0)} 個檔案（${formatBytes(candidate.bytes)}）`;
    document.getElementById('backupCleanupBreakdown').textContent = parts.join(' · ');
    document.getElementById('confirmStorageCleanupBtn').disabled = busy || !Number(candidate.fileCount || 0);
  }

  function render(storage) {
    const section = ensureUi();
    if (!section) return;
    storageSnapshot = storage;
    const disconnected = section.querySelector('#backupCenterDisconnected');
    const connected = section.querySelector('#backupCenterConnected');
    disconnected.hidden = Boolean(storage?.connected);
    connected.hidden = !storage?.connected;
    if (!storage?.connected) {
      const title = disconnected.querySelector('strong');
      const copy = disconnected.querySelector('span');
      if (storage?.needsPermission) {
        title.textContent = 'StoryFlow 資料夾需要重新授權';
        copy.textContent = `Chrome 記得「${storage.folderName || '原資料夾'}」，按下連接即可重新授權。`;
      } else {
        title.textContent = '尚未連接 StoryFlow 資料夾';
        copy.textContent = '連接後即可檢查 workspace.json、建立備份或匯入工作區。';
      }
      return;
    }

    section.querySelector('#backupCenterFolderName').textContent = storage.folderName || 'StoryFlow';
    const primary = storage.primary;
    const backup = storage.backup;
    const artifacts = storage.recoveryArtifacts || [];
    const rollingCount = Number(storage.rollingBackupCount || 0);
    renderCard(
      section.querySelector('#backupPrimaryCard'),
      '目前工作區',
      primary?.valid ? formatDate(primary.updatedAt || primary.lastModified) : (primary ? '需要處理' : '尚未建立'),
      workspaceLine(primary),
      primary && !primary.valid ? 'is-warning' : ''
    );
    renderCard(
      section.querySelector('#backupLatestCard'),
      '最近備份',
      backup?.valid ? formatDate(backup.createdAt || backup.lastModified) : (backup ? '備份無法讀取' : '尚無備份'),
      backup?.valid ? workspaceLine(backup) : (backup?.error || '第一次儲存工作區後會自動建立'),
      backup && !backup.valid ? 'is-warning' : ''
    );
    renderCard(
      section.querySelector('#backupRecoveryCard'),
      'Recovery 備份',
      `${artifacts.length} 個檔案`,
      artifacts[0]
        ? `循環備份 ${rollingCount}/3 · 最近：${artifacts[0].name}`
        : '有變更時循環保留；刪除、覆寫或衝突前另建副本'
    );
    section.querySelector('#createWorkspaceBackupBtn').disabled = busy || !primary?.valid;
    section.querySelector('#downloadWorkspaceBtn').disabled = busy || !primary?.valid;
    section.querySelector('#restoreLatestBackupBtn').disabled = busy || !backup?.valid;
    section.querySelector('#previewStorageCleanupBtn').disabled = busy;
    renderStorageUsage(storage);
  }

  async function refresh({ announce = false } = {}) {
    ensureUi();
    if (busy) return;
    try {
      const folder = await api()?.restoreOutputDirectory?.();
      const storage = folder?.connected
        ? await api()?.inspectWorkspaceStorage?.({ olderThanDays: cleanupDays() })
        : { connected: false, needsPermission: folder?.needsPermission, folderName: folder?.name };
      render(storage);
      if (announce) setMessage(storage?.connected ? '備份狀態已更新。' : '請先連接 StoryFlow 資料夾。');
    } catch (error) {
      render({ connected: false });
      setMessage(`無法檢查備份：${error.message}`, true);
    }
  }

  async function previewStorageCleanup() {
    if (busy) return;
    setBusy(true, '正在重新掃描可清理內容…');
    try {
      const storage = await api().inspectWorkspaceStorage({ olderThanDays: cleanupDays() });
      cleanupPreviewVisible = true;
      storageSnapshot = storage;
      setBusy(false);
      render(storage);
      const count = Number(storage.storageUsage?.cleanupPreview?.fileCount || 0);
      setMessage(count ? '預覽已更新；確認後才會永久清理。' : '這個期限內沒有可安全清理的檔案。');
    } catch (error) {
      cleanupPreviewVisible = false;
      setBusy(false);
      setMessage(error.message || '無法預覽可清理內容。', true);
    }
  }

  async function confirmStorageCleanup() {
    if (busy || !cleanupPreviewVisible) return;
    const preview = storageSnapshot?.storageUsage?.cleanupPreview || {};
    const count = Number(preview.fileCount || 0);
    if (!count) return;
    const message = '永久清理 ' + count + ' 個檔案（' + formatBytes(preview.bytes) + '）？\n\n'
      + '只會清理超過 ' + cleanupDays() + ' 天的 Recovery 副本與目前工作區未引用的圖片。'
      + '循環備份與仍被引用的圖片不會刪除。此操作無法復原。';
    if (!window.confirm(message)) return;

    setBusy(true, '正在清理；系統會先重新掃描一次…');
    try {
      const result = await api().cleanupWorkspaceStorage({ olderThanDays: cleanupDays() });
      cleanupPreviewVisible = false;
      storageSnapshot = result.storage;
      setBusy(false);
      render(result.storage);
      const failed = Number(result.failures?.length || 0);
      const summary = '已清理 ' + Number(result.removedFiles || 0) + ' 個檔案（' + formatBytes(result.removedBytes) + '）';
      setMessage(failed ? summary + '；另有 ' + failed + ' 項無法刪除，請重新檢查。' : summary + '。', failed > 0);
    } catch (error) {
      setBusy(false);
      setMessage(error.message || '清理失敗，沒有繼續刪除其他內容。', true);
    }
  }

  async function createBackup() {
    if (busy) return;
    setBusy(true, '正在建立備份…');
    try {
      const result = await api().backupWorkspace('manual-backup-center');
      if (!result) throw new Error('目前沒有可備份的 workspace.json。');
      setBusy(false);
      await refresh();
      setMessage(`備份已建立：${formatDate(result.createdAt)}`);
    } catch (error) {
      setBusy(false);
      setMessage(error.message, true);
    }
  }

  async function downloadWorkspace() {
    if (busy) return;
    setBusy(true, '正在準備下載…');
    try {
      const exported = await api().exportWorkspaceFile();
      const url = URL.createObjectURL(new Blob([exported.text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setBusy(false);
      setMessage(`已下載 ${exported.filename}`);
    } catch (error) {
      setBusy(false);
      setMessage(error.message, true);
    }
  }

  async function handleImportFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const summary = api().summarizeWorkspace(parsed);
      importCandidate = parsed;
      const preview = document.getElementById('backupImportPreview');
      preview.hidden = false;
      document.getElementById('backupImportSummary').textContent =
        `${file.name}：${summary.projectCount} 部作品、${summary.chapterCount} 個章節、${summary.partCount} 篇發布稿。`;
      setMessage('檔案格式正確，請確認匯入內容。');
      preview.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      importCandidate = null;
      document.getElementById('backupImportPreview').hidden = true;
      setMessage(error.message || '無法讀取這個工作區檔案。', true);
    } finally {
      input.value = '';
    }
  }

  function clearImportPreview() {
    importCandidate = null;
    const preview = document.getElementById('backupImportPreview');
    if (preview) preview.hidden = true;
    setMessage('已取消匯入。');
  }

  async function confirmImport() {
    if (busy || !importCandidate) return;
    setBusy(true, '正在匯入工作區…');
    try {
      await api().importWorkspace(importCandidate);
      importCandidate = null;
      window.StoryFlowPersistenceStatus?.markClean?.();
      setMessage('工作區已匯入，即將重新載入。');
      window.setTimeout(() => location.reload(), 500);
    } catch (error) {
      setBusy(false);
      setMessage(error.message, true);
    }
  }

  async function restoreBackup() {
    if (busy) return;
    if (!window.confirm('從最近備份恢復？\n\n目前的 workspace.json 會先保留到 Recovery/，再替換為 workspace.backup.json。')) return;
    setBusy(true, '正在從最近備份恢復…');
    try {
      const result = await api().restoreLatestWorkspaceBackup();
      window.StoryFlowPersistenceStatus?.markClean?.();
      setMessage(`已從 ${formatDate(result.backupCreatedAt)} 的備份恢復，即將重新載入。`);
      window.setTimeout(() => location.reload(), 500);
    } catch (error) {
      setBusy(false);
      setMessage(error.message, true);
    }
  }

  ensureUi();
  refresh();
  window.addEventListener('storyflow:connection-changed', () => refresh());
  window.addEventListener('storyflow:workspace-write-complete', () => refresh());
  window.addEventListener('storyflow:view-changed', event => {
    if (event.detail?.view === 'settings') refresh();
  });

  window.StoryFlowBackupCenter = { refresh, show: () => window.StoryFlowNavigate?.('settings') };
})();
