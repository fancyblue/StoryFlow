// Helpers that had grown one copy per module.
//
// These four were duplicated across ten files, byte for byte in most cases. That is not
// only redundancy: every change had to find and patch each copy, and a missed one is a
// silent behaviour split. `partKey` had already drifted — publishing-flow.js grew a
// visual-entry branch the other copies never got — which is why it now extends the
// shared base here rather than restating it.
//
// Only helpers that are pure and identical everywhere belong here. `clone()` looks like
// a fifth candidate and is deliberately left alone: three of its copies differ, two
// falling back to JSON when structuredClone throws, and folding them together would
// change behaviour rather than remove duplication.
(function () {
  // File and directory names written into the user's StoryFlow folder. The stripped set
  // is what Windows rejects; POSIX only objects to the slash.
  function safeName(value, fallback = 'untitled') {
    const cleaned = String(value || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
  }

  // Titles compared across a Google Docs sync need to survive reformatting, so runs of
  // whitespace collapse before any comparison.
  function normalizeTitle(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  // A stable identity for a part that survives a reload. Parts written before ids
  // existed fall back to their position in the source.
  function partKey(part) {
    return part?.id || `${part?.title || 'part'}:${part?.startBlock ?? ''}:${part?.endBlock ?? ''}`;
  }

  // The connection dot is the one place that already knows, and it is rendered before
  // any caller asks.
  function hasConnectedFolder() {
    return Boolean(document.getElementById('folderDot')?.classList.contains('connected'));
  }

  // Every platform <select> in the app, built once.
  //
  // Five modules had their own copy of this, and the copies disagreed: the empty option
  // read 預設格式 in three of them, 預設設定 in a fourth and StoryFlow 預設格式 in the
  // fifth, so the same control showed different text depending on which module rebuilt it
  // last. Two of them also read only the built-in `platforms`, missing any platform the
  // user had added, and one restored the previous value against the wrong list.
  //
  // The globals are read at call time, not at load: this file is first in the manifest and
  // neither exists yet when it runs.
  function platformNames() {
    const builtIn = typeof platforms === 'undefined' ? [] : platforms;
    const added = typeof state === 'undefined' ? {} : (state?.formatting?.platforms || {});
    return [...new Set([...builtIn, ...Object.keys(added)]
      .map(name => String(name || '').trim())
      .filter(Boolean))];
  }

  function fillPlatformSelect(select, { withDefault = true } = {}) {
    if (!select) return;
    const previous = select.value;
    const names = platformNames();
    select.innerHTML = '';
    if (withDefault) select.add(new Option('預設格式', ''));
    names.forEach(name => select.add(new Option(name, name)));
    const values = [...select.options].map(option => option.value);
    select.value = values.includes(previous) ? previous : (withDefault ? '' : (names[0] || ''));
  }

  // 【待補】 and 【待確認】 are the writer's own notes inside the text: something to fill in or
  // check before it goes out (REDESIGN_PROPOSAL B3). Only the opening is matched, so
  // 【待補：照片說明】 and 【待確認 日期】 count as well. Workspace, Publishing and search all ask
  // this one question, so it is answered once here.
  const PENDING_MARK = /【待(?:補|確認)/g;
  function pendingMarkCount(...texts) {
    return texts.reduce((total, text) => total + (String(text || '').match(PENDING_MARK)?.length || 0), 0);
  }

  // Text placed into HTML built as a string. Six modules carried their own copy, identical in
  // what they return; a missing value is an empty string. app.js's global escapeHtml() now
  // returns this too, where it used to render a missing value as "null" or "undefined".
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  // A save button while its save runs. Writing to a phone's synced folder can take seconds,
  // and a button that answered nothing was pressed again and again, each press queueing
  // another full write of the workspace. The button says 保存中… and is disabled until the
  // save ends; a press that still reaches it meanwhile is ignored.
  function whileSaving(handler) {
    return async function savingHandler(event) {
      const button = event?.currentTarget;
      if (button?.getAttribute?.('aria-busy') === 'true') return undefined;
      const label = button?.textContent;
      if (button) {
        button.setAttribute('aria-busy', 'true');
        button.disabled = true;
        button.textContent = '保存中…';
      }
      try {
        return await handler.call(this, event);
      } finally {
        if (button) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = label;
        }
      }
    };
  }

  window.StoryFlowShared = { safeName, normalizeTitle, partKey, hasConnectedFolder, platformNames, fillPlatformSelect, pendingMarkCount, esc, whileSaving };
})();
