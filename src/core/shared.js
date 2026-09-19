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

  window.StoryFlowShared = { safeName, normalizeTitle, partKey, hasConnectedFolder, platformNames, fillPlatformSelect };
})();
