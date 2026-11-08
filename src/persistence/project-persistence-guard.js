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
    '發布狀態已更新',
    '發布紀錄已更新',
    '發布標題已更新',
    '文章圖片已更新',
    '後記已更新',
    '後記輸出設定已更新',
    '圖文系列已建立',
    '圖文已新增',
    '圖文已保存',
    '圖文已刪除',
    '圖文圖片已更新'
  ]);

  function normalizeLoadedState(next) {
    if (!StoryFlowContentModel.isProjectState(next)) return false;
    state = StoryFlowContentModel.normalizeProject(next);
    if (state.contentMode === StoryFlowContentModel.CONTENT_MODES.VISUAL) return true;
    state.chapters.forEach(chapter => {
      chapter.parts ||= [];
      chapter.parts.forEach(normalizePublishingPart);
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
    if (window.StoryFlowMobileSafeMode?.isReadOnly?.()) {
      window.StoryFlowSaveStatus?.set?.('手機唯讀 · 不會寫入資料夾');
      return false;
    }
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
          : error?.code === 'MOBILE_READ_ONLY'
            ? '手機唯讀 · 不會寫入資料夾'
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

  // A critical saveState() is already one of settings-sync's scheduled saves. Writing it here
  // as well wrote the whole workspace twice for every such change — an afterword, a
  // publication mark — which a desktop never noticed and a phone's synced folder did, in
  // seconds and in memory. Bringing settings-sync's own save forward writes it once.
  function persistSaveStateNow(reason) {
    const status = window.StoryFlowPersistenceStatus;
    if (typeof status?.settle !== 'function') return scheduleImmediatePersist(reason);
    clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => { status.settle(); }, 30);
    return undefined;
  }

  async function rehydrateMultiProjectWorkspace() {
    if (hydrating) return false;
    const folder = await connectedFolder();
    if (!folder) {
      ready = true;
      return false;
    }

    hydrating = true;
    try {
      // By the time this file runs, projects.js has replaced loadWorkspace. Calling it
      // again restores the full schema-v2 store instead of only the legacy active state.
      const saved = await StoryFlowIntegrations.loadWorkspace();
      const loaded = normalizeLoadedState(saved?.state);
      if (loaded) {
        suggestion = null;
        renderAll();
        if (state.contentMode === StoryFlowContentModel.CONTENT_MODES.LONGFORM && activeChapter()?.draft) suggestNextPart();
        window.StoryFlowRenderProjects?.();
        window.StoryFlowProjectSourceSync?.syncUi?.();
        window.dispatchEvent(new CustomEvent('storyflow:workspace-loaded', {
          detail: { hasWorkspace: true, source: 'multi-project-rehydrate' }
        }));
      }
      return loaded;
    } catch (error) {
      console.warn('StoryFlow multi-project rehydrate failed', error);
      return false;
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
      if (CRITICAL_SAVE_LABELS.has(label)) persistSaveStateNow(label);
      return result;
    };
  } catch (_) {}

  // settings-sync schedules its remembered-folder restore with setTimeout(0). Run one
  // authoritative multi-project pass immediately after that bootstrap has had a chance
  // to finish, without waiting for Google scripts or other external resources.
  window.setTimeout(rehydrateMultiProjectWorkspace, 80);

  // ⌘S／Ctrl S writes now (REDESIGN_PROPOSAL B2). Editing already saves on its own; the
  // shortcut is for the moment the writer wants it on disk before leaving, and it replaces
  // the browser's "save page" dialog, which would save a copy of the app rather than the work.
  // Pending visual-entry autosave is flushed first so the write carries it.
  document.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    if (String(event.key).toLowerCase() !== 's') return;
    event.preventDefault();
    Promise.resolve(window.StoryFlowVisualWorkspace?.flush?.('shortcut-save'))
      .catch(() => {})
      .then(() => persistWorkspaceNow('shortcut-save'));
  });

  window.StoryFlowProjectPersistence = {
    flush: persistWorkspaceNow,
    prepareRecovery,
    rehydrate: rehydrateMultiProjectWorkspace
  };
})();
