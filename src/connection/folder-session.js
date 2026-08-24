// Keep the StoryFlow folder connected across normal page reloads, but do not
// automatically revive it on a cold browser/tab session.
// The FileSystemDirectoryHandle is still stored in IndexedDB because handles
// cannot live in sessionStorage. sessionStorage only gates whether it may be
// restored automatically in the current browser session.
(function () {
  const SESSION_KEY = 'storyflow.folder.session.v1';

  function hasSessionHint() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
    catch (_) { return false; }
  }

  function rememberSession() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); }
    catch (_) {}
  }

  const baseRestore = StoryFlowIntegrations.restoreOutputDirectory.bind(StoryFlowIntegrations);
  const baseChoose = StoryFlowIntegrations.chooseOutputDirectory.bind(StoryFlowIntegrations);

  StoryFlowIntegrations.restoreOutputDirectory = async function restoreOutputDirectoryForSession() {
    if (!('showDirectoryPicker' in window)) return { supported: false };
    if (!hasSessionHint()) {
      return { supported: true, connected: false, sessionExpired: true };
    }
    return baseRestore();
  };

  StoryFlowIntegrations.chooseOutputDirectory = async function chooseOutputDirectoryForSession(...args) {
    const result = await baseChoose(...args);
    if (result?.name) rememberSession();
    return result;
  };
})();
