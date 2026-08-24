// Cold-session return path. A persisted directory handle contains no story data;
// it only lets Chrome identify the folder the user previously selected. Reconnect
// remains explicit, and Leave this device removes the handle entirely.
(function () {
  const LEFT_QUERY_KEY = 'storyflow-left';
  let folderHint = null;

  function shouldSuppress() {
    return new URL(location.href).searchParams.get(LEFT_QUERY_KEY) === '1';
  }

  function ensureDialog() {
    let dialog = document.getElementById('storyflowQuickStartDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'storyflowQuickStartDialog';
    dialog.className = 'storyflow-recovery-dialog storyflow-quick-start-dialog';
    dialog.innerHTML = `
      <div class="storyflow-recovery-card">
        <div class="storyflow-recovery-mark" aria-hidden="true">S</div>
        <p class="eyebrow">WELCOME BACK</p>
        <h1>繼續上次工作</h1>
        <p>Chrome 記得你先前選擇的 StoryFlow 資料夾。重新連接後，會一起載入工作區與 settings.json。</p>
        <div class="storyflow-quick-start-folder"><span>上次資料夾</span><strong id="quickStartFolderName">StoryFlow</strong></div>
        <div class="storyflow-recovery-actions">
          <button id="quickReconnectFolderBtn" class="button primary" type="button">快速重新連接</button>
          <button id="quickChooseOtherFolderBtn" class="button ghost" type="button">選擇其他 StoryFlow 資料夾</button>
          <button id="quickImportSettingsBtn" class="button ghost" type="button">只載入 settings.json</button>
          <button id="quickStartOfflineBtn" class="button quiet" type="button">暫時離線使用</button>
        </div>
        <p id="quickStartStatus" class="storyflow-recovery-status" role="status" aria-live="polite"></p>
        <input id="quickStartSettingsInput" type="file" accept="application/json,.json" hidden />
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      close(dialog);
    });

    dialog.querySelector('#quickReconnectFolderBtn').onclick = event => connect(dialog, event.currentTarget, true);
    dialog.querySelector('#quickChooseOtherFolderBtn').onclick = event => connect(dialog, event.currentTarget, false);
    dialog.querySelector('#quickImportSettingsBtn').onclick = () => dialog.querySelector('#quickStartSettingsInput').click();
    dialog.querySelector('#quickStartOfflineBtn').onclick = () => close(dialog);
    dialog.querySelector('#quickStartSettingsInput').onchange = event => importSettings(dialog, event.currentTarget);
    return dialog;
  }

  function setBusy(dialog, button, message) {
    dialog.querySelectorAll('button').forEach(node => { node.disabled = true; });
    if (button) button.textContent = '連接中…';
    dialog.querySelector('#quickStartStatus').textContent = message;
  }

  function resetBusy(dialog) {
    dialog.querySelectorAll('button').forEach(node => { node.disabled = false; });
    dialog.querySelector('#quickReconnectFolderBtn').textContent = '快速重新連接';
    dialog.querySelector('#quickChooseOtherFolderBtn').textContent = '選擇其他 StoryFlow 資料夾';
  }

  function close(dialog) {
    if (dialog?.open) dialog.close();
    window.StoryFlowSaveStatus?.set?.('尚未保存 · 請連接資料夾');
  }

  async function connect(dialog, button, reuseRemembered) {
    setBusy(dialog, button, reuseRemembered ? '正在重新授權並載入工作區…' : '請選擇 StoryFlow 資料夾…');
    const result = await window.StoryFlowFolderConnection?.choose?.({ reuseRemembered });
    if (!result) {
      resetBusy(dialog);
      dialog.querySelector('#quickStartStatus').textContent = '尚未連接資料夾。';
      return;
    }
    dialog.querySelector('#quickStartStatus').textContent = '工作區與 settings.json 已載入。';
    if (dialog.open) dialog.close();
    window.StoryFlowNavigate?.('workspace');
  }

  async function importSettings(dialog, input) {
    const file = input.files?.[0];
    if (!file) return;
    dialog.querySelectorAll('button').forEach(node => { node.disabled = true; });
    dialog.querySelector('#quickStartStatus').textContent = '正在載入 settings.json…';
    try {
      const importer = window.StoryFlowSettingsBootstrap?.importSettingsFile;
      if (typeof importer !== 'function') throw new Error('設定載入元件尚未準備完成，請稍後再試。');
      await importer(file);
      dialog.querySelector('#quickStartStatus').textContent = 'settings.json 已載入；工作區仍需連接資料夾。';
      window.setTimeout(() => {
        if (dialog.open) dialog.close();
        window.StoryFlowNavigate?.('settings');
      }, 350);
    } catch (error) {
      resetBusy(dialog);
      dialog.querySelector('#quickStartStatus').textContent = error.message;
      input.value = '';
    }
  }

  function show(folder = folderHint) {
    if (shouldSuppress() || !folder?.remembered) return false;
    folderHint = folder;
    const dialog = ensureDialog();
    dialog.querySelector('#quickStartFolderName').textContent = folder.name || 'StoryFlow';
    dialog.querySelector('#quickStartStatus').textContent = '';
    resetBusy(dialog);
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('#quickReconnectFolderBtn')?.focus());
    return true;
  }

  async function check() {
    if (shouldSuppress()) return;
    try {
      const folder = await window.StoryFlowIntegrations?.restoreOutputDirectory?.();
      if (folder?.sessionExpired && folder?.remembered) show(folder);
    } catch (_) {}
  }

  window.StoryFlowQuickStart = { check, show };
  window.setTimeout(check, 160);
})();
