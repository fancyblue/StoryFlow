// Workspace recovery UI. File IO and conflict detection stay in integrations.js;
// this module owns the user-visible decision when automatic saving is paused.
(function () {
  let busy = false;

  function recovery() {
    return window.StoryFlowIntegrations?.getWorkspaceRecovery?.() || null;
  }

  function ensureUi() {
    let alert = document.getElementById('workspaceRecoveryAlert');
    if (!alert) {
      alert = document.createElement('button');
      alert.id = 'workspaceRecoveryAlert';
      alert.type = 'button';
      alert.className = 'workspace-recovery-alert';
      alert.hidden = true;
      alert.textContent = '工作資料需要處理';
      alert.addEventListener('click', showRecovery);
      const anchor = document.querySelector('.connection-bar') || document.querySelector('.topbar') || document.querySelector('main');
      anchor?.appendChild(alert);
    }

    let dialog = document.getElementById('workspaceRecoveryDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'workspaceRecoveryDialog';
      dialog.className = 'workspace-recovery-dialog';
      dialog.innerHTML = `
        <div class="dialog-card workspace-recovery-card">
          <div class="panel-head">
            <div><p class="eyebrow">WORKSPACE SAFETY</p><h3 id="workspaceRecoveryTitle">工作資料需要處理</h3></div>
            <button id="closeWorkspaceRecovery" class="icon-button" type="button" aria-label="稍後處理">×</button>
          </div>
          <p id="workspaceRecoveryMessage" class="workspace-recovery-message"></p>
          <div id="workspaceRecoveryDetails" class="workspace-recovery-details"></div>
          <div id="workspaceRecoveryStatus" class="workspace-recovery-status" role="status"></div>
          <div class="workspace-recovery-actions">
            <button id="restoreWorkspaceBackupBtn" class="button primary" type="button">從備份恢復</button>
            <button id="reloadWorkspaceDiskBtn" class="button primary" type="button">載入較新版本</button>
            <button id="keepLocalWorkspaceBtn" class="button ghost" type="button">保留目前版本並覆蓋</button>
            <button id="importWorkspaceBtn" class="button ghost" type="button">匯入工作區檔案</button>
            <button id="dismissWorkspaceRecoveryBtn" class="button ghost" type="button">稍後處理</button>
          </div>
          <input id="workspaceRecoveryFileInput" type="file" accept="application/json,.json" hidden />
        </div>`;
      document.body.appendChild(dialog);

      dialog.querySelector('#closeWorkspaceRecovery').onclick = () => dialog.close();
      dialog.querySelector('#dismissWorkspaceRecoveryBtn').onclick = () => dialog.close();
      dialog.querySelector('#restoreWorkspaceBackupBtn').onclick = () => restore('backup');
      dialog.querySelector('#reloadWorkspaceDiskBtn').onclick = () => {
        window.StoryFlowPersistenceStatus?.markClean?.();
        location.reload();
      };
      dialog.querySelector('#keepLocalWorkspaceBtn').onclick = async () => {
        if (!confirm('以目前畫面的內容覆蓋資料夾中較新的 workspace.json？\n\n較新的版本會先保留在 Recovery 資料夾。')) return;
        await restore('local');
      };
      const input = dialog.querySelector('#workspaceRecoveryFileInput');
      dialog.querySelector('#importWorkspaceBtn').onclick = () => input.click();
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        setBusy(true, '正在檢查並匯入工作區…');
        try {
          const parsed = JSON.parse(await file.text());
          await StoryFlowIntegrations.importWorkspace(parsed);
          window.StoryFlowPersistenceStatus?.markClean?.();
          location.reload();
        } catch (error) {
          setBusy(false, error.message, true);
          input.value = '';
        }
      };
    }
    return { alert, dialog };
  }

  function setBusy(next, message = '', isError = false) {
    busy = next;
    const dialog = document.getElementById('workspaceRecoveryDialog');
    if (!dialog) return;
    dialog.querySelectorAll('button').forEach(button => { button.disabled = next; });
    const status = dialog.querySelector('#workspaceRecoveryStatus');
    status.textContent = message;
    status.classList.toggle('error-text', isError);
  }

  async function restore(strategy) {
    if (busy) return;
    setBusy(true, '正在恢復工作區…');
    try {
      await StoryFlowIntegrations.restoreWorkspaceRecovery(strategy);
      window.StoryFlowPersistenceStatus?.markClean?.();
      location.reload();
    } catch (error) {
      setBusy(false, error.message, true);
    }
  }

  function syncRecoveryUi() {
    const current = recovery();
    const { alert, dialog } = ensureUi();
    alert.hidden = !current;
    if (!current) return;

    const isConflict = current.kind === 'conflict';
    alert.textContent = isConflict ? '同步已暫停 · 發現較新版本' : '工作資料需要恢復';
    alert.classList.toggle('is-conflict', isConflict);
    dialog.querySelector('#workspaceRecoveryTitle').textContent = isConflict ? '發現另一個較新的工作版本' : 'workspace.json 無法讀取';
    dialog.querySelector('#workspaceRecoveryMessage').textContent = isConflict
      ? 'StoryFlow 已停止覆蓋，並把目前畫面的修改另存到 Recovery 資料夾。你可以載入磁碟中的較新版本，或確認以目前版本覆蓋。'
      : current.recoverable
        ? 'StoryFlow 找到最近一次正常備份。恢復前會先把目前損壞的檔案保留到 Recovery 資料夾。'
        : '沒有找到可自動使用的備份。請匯入既有 workspace.json 或 workspace.backup.json。';

    const details = [];
    if (current.backupCreatedAt) details.push(`備份時間：${new Date(current.backupCreatedAt).toLocaleString('zh-TW')}`);
    if (current.artifactPath) details.push(`本次修改副本：${current.artifactPath}`);
    if (current.message) details.push(`檢查結果：${current.message}`);
    dialog.querySelector('#workspaceRecoveryDetails').textContent = details.join('\n');
    dialog.querySelector('#restoreWorkspaceBackupBtn').hidden = isConflict || !current.recoverable;
    dialog.querySelector('#reloadWorkspaceDiskBtn').hidden = !isConflict;
    dialog.querySelector('#keepLocalWorkspaceBtn').hidden = !isConflict || !current.recoverable;
    setBusy(false);
  }

  function showRecovery() {
    syncRecoveryUi();
    const dialog = document.getElementById('workspaceRecoveryDialog');
    if (dialog && !dialog.open) dialog.showModal();
  }

  window.addEventListener('storyflow:workspace-recovery-needed', () => {
    syncRecoveryUi();
    showRecovery();
  });
  window.addEventListener('storyflow:workspace-write-complete', syncRecoveryUi);
  window.StoryFlowWorkspaceSafety = { show: showRecovery, sync: syncRecoveryUi };

  ensureUi();
  window.setTimeout(() => {
    syncRecoveryUi();
    if (recovery()) showRecovery();
  }, 120);
})();
