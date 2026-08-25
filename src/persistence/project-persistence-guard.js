// Multi-project persistence guard.
// The legacy settings bootstrap starts restoring workspace.json before every later
// project/source layer is guaranteed to be installed. Re-run the authoritative
// workspace load after all synchronous app scripts are ready, then persist structural
// project changes immediately instead of relying only on the generic 300ms debounce.
(function () {
  let hydrating = false;
  let ready = false;
  let persistTimer = null;

  const CRITICAL_SAVE_LABELS = new Set([
    '已建立作品',
    '作品已刪除',
    '手動作品已建立',
    'Google Docs 作品已建立',
    '文章已新增',
    '來源已加入',
    '來源已更新',
    '已復原來源更新',
    '章節已刪除',
    '已刪除並退回切篇',
    '發布狀態已更新'
  ]);

  function normalizeLoadedState(next) {
    if (!next?.chapters?.length) return false;
    state = next;
    state.chapters.forEach(chapter => {
      chapter.parts ||= [];
      chapter.source ||= null;
      if (typeof chapter.confirmedBlockCount !== 'number') chapter.confirmedBlockCount = 0;
    });
    state.activeChapterId = state.chapters.some(chapter => chapter.id === state.activeChapterId)
      ? state.activeChapterId
      : state.chapters[0].id;
    return true;
  }

  async function connectedFolder() {
    try {
      const folder = await StoryFlowIntegrations.restoreOutputDirectory();
      return folder?.connected ? folder : null;
    } catch (_) {
      return null;
    }
  }

  async function persistWorkspaceNow(reason = 'project-change') {
    if (hydrating) return false;
    const folder = await connectedFolder();
    if (!folder) {
      window.StoryFlowSaveStatus?.set?.('尚未保存 · 請連接資料夾');
      return false;
    }

    try {
      window.StoryFlowSaveStatus?.set?.('保存中…');
      // projects.js owns StoryFlowIntegrations.saveWorkspace by this point. Passing
      // the active state lets that wrapper serialize the complete schema-v2 project store.
      await StoryFlowIntegrations.saveWorkspace({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        state
      });
      const time = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
      window.StoryFlowSaveStatus?.set?.(`已保存 ${time}`);
      window.dispatchEvent(new CustomEvent('storyflow:workspace-persisted', {
        detail: { reason }
      }));
      return true;
    } catch (error) {
      console.warn('StoryFlow immediate workspace persistence failed', error);
      const message = error?.code === 'WORKSPACE_CONFLICT'
        ? '保存已暫停 · 發現較新版本'
        : error?.code === 'WORKSPACE_CORRUPT'
          ? '工作資料損壞 · 請先恢復'
          : '保存失敗 · 請重試';
      window.StoryFlowSaveStatus?.set?.(message, true);
      return false;
    }
  }

  async function prepareRecovery(reason = 'before-destructive-action') {
    const saved = await persistWorkspaceNow(reason);
    if (!saved) throw new Error('目前工作區尚未完整保存。');
    const snapshot = await StoryFlowIntegrations.createWorkspaceRecoverySnapshot?.(reason);
    if (!snapshot) throw new Error('Recovery 安全元件尚未準備完成。');
    return snapshot;
  }

  function scheduleImmediatePersist(reason) {
    clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => persistWorkspaceNow(reason), 30);
  }

  async function rehydrateMultiProjectWorkspace() {
    if (hydrating) return;
    const folder = await connectedFolder();
    if (!folder) {
      ready = true;
      return;
    }

    hydrating = true;
    try {
      // By the time this file runs, projects.js has replaced loadWorkspace. Calling it
      // again restores the full schema-v2 store instead of only the legacy active state.
      const saved = await StoryFlowIntegrations.loadWorkspace();
      if (normalizeLoadedState(saved?.state)) {
        suggestion = null;
        renderAll();
        if (activeChapter()?.draft) suggestNextPart();
        window.StoryFlowRenderProjects?.();
        window.StoryFlowProjectSourceSync?.syncUi?.();
        window.dispatchEvent(new CustomEvent('storyflow:workspace-loaded', {
          detail: { hasWorkspace: true, source: 'multi-project-rehydrate' }
        }));
      }
    } catch (error) {
      console.warn('StoryFlow multi-project rehydrate failed', error);
    } finally {
      hydrating = false;
      ready = true;
    }
  }

  // Structural project mutations already dispatch this event from projects.js. Save
  // those mutations immediately so a refresh right after creating/deleting a work
  // cannot beat the normal debounced workspace write.
  window.addEventListener('storyflow:projects-changed', () => {
    if (!ready || hydrating) return;
    scheduleImmediatePersist('projects-changed');
  });

  // Critical content mutations (notably adding the first manual article) should also
  // get a fast workspace write. Routine typing keeps using settings-sync's debounce.
  try {
    const baseSaveState = saveState;
    saveState = function guardedSaveState(label = '準備保存') {
      const result = baseSaveState(label);
      if (CRITICAL_SAVE_LABELS.has(label)) scheduleImmediatePersist(label);
      return result;
    };
  } catch (_) {}

  // settings-sync schedules its remembered-folder restore with setTimeout(0). Run one
  // authoritative multi-project pass immediately after that bootstrap has had a chance
  // to finish, without waiting for Google scripts or other external resources.
  window.setTimeout(rehydrateMultiProjectWorkspace, 80);

  window.StoryFlowProjectPersistence = {
    flush: persistWorkspaceNow,
    prepareRecovery,
    rehydrate: rehydrateMultiProjectWorkspace
  };
})();
