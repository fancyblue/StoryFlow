// Keep settings.json import compatible with macOS/iOS native file pickers.
// Some WebKit/macOS combinations grey out JSON files when a hidden file input
// declares `accept="application/json,.json"`, especially for cloud-backed files.
// StoryFlow already validates the selected file by parsing JSON and checking the
// expected Google integration fields, so the native picker does not need a MIME
// filter at all.
(function () {
  function normalizeSettingsFileInput() {
    const input = document.getElementById('settingsBootstrapFileInput');
    if (!input) return false;

    input.type = 'file';
    input.removeAttribute('accept');
    input.removeAttribute('capture');
    input.removeAttribute('directory');
    input.removeAttribute('webkitdirectory');
    input.multiple = false;
    return true;
  }

  // Run before the existing import button handler opens the native picker.
  document.addEventListener('click', event => {
    if (event.target.closest?.('#importSettingsJsonBtn')) normalizeSettingsFileInput();
  }, true);

  if (!normalizeSettingsFileInput()) {
    const observer = new MutationObserver(() => {
      if (normalizeSettingsFileInput()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
