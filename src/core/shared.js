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

  window.StoryFlowShared = { safeName, normalizeTitle, partKey, hasConnectedFolder };
})();
