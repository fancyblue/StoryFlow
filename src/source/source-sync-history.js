// One-session undo record for source synchronization. Durable Recovery artifacts
// are created by StoryFlowIntegrations; this module keeps only the immediate UI undo.
(function () {
  let lastUndo = null;

  function clone(value) {
    return structuredClone(value);
  }

  function dispatch() {
    window.dispatchEvent(new CustomEvent('storyflow:source-sync-undo-changed', {
      detail: lastUndo ? metadata(lastUndo) : null
    }));
  }

  function metadata(record) {
    if (!record) return null;
    return {
      id: record.id,
      projectId: record.projectId,
      createdAt: record.createdAt,
      affectedCount: record.affectedCount,
      affectedTitles: [...record.affectedTitles],
      artifactPath: record.artifactPath || null
    };
  }

  function stage(projectState, options = {}) {
    const changes = Array.isArray(options.changes) ? options.changes : [];
    return {
      id: crypto.randomUUID(),
      projectId: options.projectId || null,
      createdAt: new Date().toISOString(),
      affectedCount: changes.length,
      affectedTitles: changes.map(change => change?.incoming?.title || change?.label || '未命名章節'),
      artifactPath: null,
      state: clone(projectState)
    };
  }

  async function prepare(projectState, options = {}) {
    const staged = stage(projectState, options);
    try {
      const flushed = typeof options.flush === 'function' ? await options.flush() : true;
      if (flushed !== false && typeof options.createArtifact === 'function') {
        const artifact = await options.createArtifact();
        staged.artifactPath = artifact?.artifactPath || null;
      }
    } catch (error) {
      staged.snapshotError = error?.message || String(error);
      options.onSnapshotError?.(error);
    }
    return staged;
  }

  function commit(staged, options = {}) {
    if (!staged?.state) throw new Error('缺少可復原的來源同步快照。');
    lastUndo = {
      ...staged,
      artifactPath: options.artifactPath || staged.artifactPath || null,
      state: clone(staged.state)
    };
    dispatch();
    return metadata(lastUndo);
  }

  function peek() {
    return metadata(lastUndo);
  }

  function take(projectId = null) {
    if (!lastUndo || (projectId && lastUndo.projectId && projectId !== lastUndo.projectId)) return null;
    const restored = { ...metadata(lastUndo), state: clone(lastUndo.state) };
    lastUndo = null;
    dispatch();
    return restored;
  }

  function clear() {
    lastUndo = null;
    dispatch();
  }

  window.StoryFlowSourceSyncHistory = Object.freeze({ stage, prepare, commit, peek, take, clear });
})();
