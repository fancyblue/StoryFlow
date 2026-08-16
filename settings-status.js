// Settings mirrors the same folder connection state shown on the workspace header.
(function () {
  const settingsDialog = document.getElementById('settingsDialog');
  const status = document.getElementById('settingsFolderConnection');
  const text = document.getElementById('settingsFolderConnectionText');
  if (!settingsDialog || !status || !text) return;

  function sync() {
    const connected = document.getElementById('folderDot')?.classList.contains('connected');
    const sourceText = document.getElementById('folderStatus')?.textContent?.trim();
    status.classList.toggle('connected', Boolean(connected));
    text.textContent = connected
      ? `已連接${sourceText ? ` · ${sourceText}` : ''}`
      : (sourceText || '尚未連接 StoryFlow 資料夾');
  }

  settingsDialog.addEventListener('toggle', sync);
  document.getElementById('openSettingsBtn')?.addEventListener('click', () => setTimeout(sync, 0));
  document.getElementById('settingsNav')?.addEventListener('click', () => setTimeout(sync, 0));

  const folderDot = document.getElementById('folderDot');
  if (folderDot) new MutationObserver(sync).observe(folderDot, { attributes: true, attributeFilter: ['class'] });
  const folderText = document.getElementById('folderStatus');
  if (folderText) new MutationObserver(sync).observe(folderText, { childList: true, subtree: true, characterData: true });
  sync();
})();