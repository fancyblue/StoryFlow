// Mobile storage safety.
// Google Drive mobile providers can expose a stale local cache while transfers are
// waiting for Wi-Fi. Keep file-backed work read-only on phones unless the user
// explicitly reloads the workspace and enables editing for this tab session.
(function () {
  const SESSION_EDIT_KEY = 'storyflow.mobile-edit-enabled.v1';
  const WRITE_ACTION_PATTERN = /(新增|建立|儲存|保存|產生|確認|刪除|移除|清除|更新|同步|復原|還原|匯入|載入|套用|標註|解除|重新連結)/;
  const EXPLICIT_WRITE_CONTROL_SELECTOR = [
    '#saveBtn',
    '#generateBtn',
    '#confirmBtn',
    '#projectsNewWorkBtn',
    '#workspaceQuickNewProject',
    '#newProjectBtn',
    '#createProjectManually',
    '#createProjectFromGoogle',
    '#workspaceLoadSourceBtn',
    '#resetWorkspaceBtn',
    // A chapter's ⋯ holds only 編輯章節 and 刪除章節. It was caught by accident before:
    // it starts life labelled as a delete button and keeps the mark after it becomes ⋯.
    '.chapter-row > .chapter-more-button',
    '.chapter-row-edit-menu-item',
    // The other ⋯ whose menus hold only a deletion: an article's in Publishing, an entry's in
    // the visual rail and a platform's in Settings. With the deletion gone they opened empty.
    '.publish-more-btn',
    '.visual-entry-more',
    '.platform-row-more',
    // A visual work's controls that only add or change: they were left disabled in place,
    // which on a phone is a page of grey buttons around the article being read.
    '#visualNewEntryBtn',
    '#visualEmptyNewEntry',
    '#visualAddPhotosBtn',
    '#visualChooseFolderBtn',
    '#visualRefreshFolderBtn',
    '.visual-entry-photo-pick',
    '.visual-entry-photo-actions button',
    '#visualQuoteFromBody',
    '#visualPhotoUse',
    '#visualPhotoRemove',
    // A platform's own title, summary and Hashtags open their field with 編輯.
    '#editPlatformTitle',
    '#editPlatformPreviewSummary',
    '#editPlatformPreviewHashtags',
    // A phone does not publish (UX_FLOW 〈Phone editing〉), so it does not record publishing.
    '#platformPreviewRecordBtn',
    // Nor does it split: moving the next part's end only leads to 確認並存成 Markdown.
    '#shrinkBtn',
    '#expandBtn',
    '#readingShrinkBtn',
    '#readingExpandBtn',
    '#readingViewSwitch [data-reading-view="seam"]'
  ].join(',');
  // What a phone may edit after 開始編輯 in 管理發布: an article's summary, Hashtags and
  // afterword, and a platform's own title, summary and Hashtags. Nothing here touches the
  // manuscript, the split or a file other than the article's own Markdown or entry.
  const HELPER_SCOPE_SELECTOR = [
    '.visual-publish-helpers',
    '.publish-afterword-editor',
    '#editPlatformTitle',
    '#platformPreviewTitleEditor',
    '#platformPreviewSummaryBlock',
    '#platformPreviewHashtagsBlock'
  ].join(',');
  // The writes those editors make. settings.json is not among them: the reload before
  // editing reloads workspace.json only, so the phone's copy of the settings may be older
  // than the desktop's, and writing it back would undo the newer one.
  const HELPER_WRITE_METHODS = new Set([
    'saveWorkspace',
    'savePart',
    'saveVisualEntry',
    'backupWorkspace',
    'createWorkspaceRecoverySnapshot'
  ]);
  const SPLIT_GROUP_SELECTOR = '#suggestionCard .boundary-control, .reading-view-actions .sf-button-group, #readingViewSwitch';
  // Rows whose text is the writer's own: a work, a chapter, an article, a search result.
  // Choosing one is reading. Guessing from their text locked any work whose card said
  // 「手動建立」, and would lock a chapter called 「確認身分」.
  const NAVIGATION_CONTROL_SELECTOR = [
    '.project-library-main',
    '.chapter-item',
    '.visual-entry-select',
    '.workspace-project-quick-switch-item',
    '.global-search-result'
  ].join(',');
  const SAFE_READ_CONTROL_SELECTOR = [
    '#folderBtn',
    '#settingsFolderBtn',
    '#connectBackupFolderBtn',
    '#reconnectStoryFlowFolderBtn',
    '#quickReconnectFolderBtn',
    '#importSettingsJsonBtn',
    '#reimportStoryFlowSettingsBtn',
    '#quickImportSettingsBtn',
    '.publish-helpers-edit-start'
  ].join(',');
  // The file inputs those import buttons open. Allowing the button but intercepting the
  // change event that follows it let the user start an import that could never finish:
  // the capture-phase guard called stopImmediatePropagation before the bootstrap's own
  // handler ran, so the picker opened, a file was chosen, and the only response was
  // "手機目前是唯讀模式". Importing settings writes nothing to the folder — it only tells
  // this tab which Google project to use, which is what makes reading on a phone
  // possible at all. Inputs that do write (image import, workspace recovery, backup
  // restore) are deliberately absent.
  const SAFE_READ_INPUT_SELECTOR = [
    '#settingsBootstrapFileInput',
    '#quickStartSettingsInput',
    '#storyflowRecoveryFileInput'
  ].join(',');
  const WRITE_METHODS = [
    'saveWorkspace',
    'saveStoryFlowSettings',
    'savePart',
    'importPartImages',
    'removePartImage',
    'saveVisualEntry',
    'pickDrivePhotos',
    'importVisualImages',
    'removeVisualImage',
    'removeVisualEntryFiles',
    'backupWorkspace',
    'createWorkspaceRecoverySnapshot',
    'restoreLatestWorkspaceBackup',
    'restoreWorkspaceRecovery',
    'importWorkspace'
  ];

  function isPhone() {
    if (navigator.userAgentData?.mobile === true) return true;
    if (/Android.+Mobile|iPhone|iPod|Windows Phone/i.test(navigator.userAgent || '')) return true;
    return Boolean(window.matchMedia?.('(max-width: 760px) and (pointer: coarse)')?.matches
      && Number(navigator.maxTouchPoints || 0) > 0);
  }

  if (!isPhone()) return;

  let readOnly = sessionStorage.getItem(SESSION_EDIT_KEY) !== '1';
  let observer = null;
  let lastBlockedNoticeAt = 0;
  let modeChangeInProgress = false;
  // Editing limited to the publishing helpers, for one visit to 管理發布. Never kept across a
  // reload: the next tab, and the next lightbox, start read-only again.
  let helpersOnly = false;
  let helpersStarting = false;
  // What 管理發布 says about saving while the helpers are open: a save returns at once and
  // writes in the background, so the state is said where the editing happens.
  let helperSaveLabel = '';
  function setHelperSaveLabel(label) {
    helperSaveLabel = label;
    document.querySelectorAll('.publish-helpers-save-state').forEach(node => { node.textContent = label; });
  }
  window.addEventListener('storyflow:workspace-persisted', () => {
    if (!helpersOnly) return;
    if (window.StoryFlowPersistenceStatus?.dirty?.()) return;
    const time = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    setHelperSaveLabel(`已保存 ${time}`);
  });

  function readonlyError() {
    const error = new Error('手機目前是唯讀模式。請先確認 Google Drive 已同步，再到「設定 → 手機使用模式」開啟本次編輯。');
    error.code = 'MOBILE_READ_ONLY';
    return error;
  }

  function setSaveStatus() {
    if (!readOnly || helpersOnly) return;
    window.StoryFlowSaveStatus?.set?.('手機唯讀 · 不會寫入資料夾');
  }

  function inHelperScope(control) {
    return helpersOnly && Boolean(control?.closest?.(HELPER_SCOPE_SELECTOR));
  }

  function notifyBlocked() {
    const now = Date.now();
    if (now - lastBlockedNoticeAt < 900) return;
    lastBlockedNoticeAt = now;
    window.notify?.('手機目前是唯讀模式；確認 Drive 同步完成後，可到設定開啟本次編輯。', true);
    setSaveStatus();
  }

  function isUiOnlyControl(control) {
    return Boolean(control?.closest?.(
      '.publishing-project-filter-control, #publishingFilters, .preview-mode-toggle, .source-preview-tabs, .mobile-safe-mode-settings, #suggestionPlatformSelect, #readingPlatformSelect, #visualPreviewPlatform'
    ));
  }

  function isSafeReadInput(control) {
    return Boolean(control?.matches?.(SAFE_READ_INPUT_SELECTOR));
  }

  function isWriteButton(button) {
    if (!button || button.id === 'mobileSafeModeToggle') return false;
    if (button.matches(SAFE_READ_CONTROL_SELECTOR) || button.matches(NAVIGATION_CONTROL_SELECTOR)) return false;
    if (button.matches(EXPLICIT_WRITE_CONTROL_SELECTOR)) return true;
    // An accessible name, when there is one, says what the button does; its text may also
    // carry the writer's content. Names quoted in 「」 are content, never the action.
    const name = button.getAttribute('aria-label') || `${button.title || ''} ${button.textContent || ''}`;
    return WRITE_ACTION_PATTERN.test(name.replace(/「[^」]*」/g, ''));
  }

  function decorateControls(root = document) {
    if (!readOnly) return;
    root.querySelectorAll?.('button').forEach(button => {
      if (isWriteButton(button) && !inHelperScope(button)) button.dataset.mobileSafeWriteControl = 'true';
    });
    // The groups that hold only split controls go with them rather than standing empty.
    root.querySelectorAll?.(SPLIT_GROUP_SELECTOR).forEach(group => { group.dataset.mobileSafeWriteControl = 'true'; });
    root.querySelectorAll?.('input, textarea, select, [contenteditable="true"]').forEach(control => {
      if (control.dataset.mobileSafeLocked === 'true' || isUiOnlyControl(control) || inHelperScope(control)) return;
      if (isSafeReadInput(control)) return;
      control.dataset.mobileSafeLocked = 'true';
      control.setAttribute('aria-readonly', 'true');
      if (control.matches('input:not([type="checkbox"]):not([type="radio"]), textarea')) {
        control.dataset.mobileSafeWasReadonly = control.readOnly ? '1' : '0';
        control.readOnly = true;
      }
      if (control.matches('select, input[type="checkbox"], input[type="radio"]')) {
        control.dataset.mobileSafeWasDisabled = control.disabled ? '1' : '0';
        control.disabled = true;
      }
      if (control.matches('[contenteditable="true"]')) {
        control.dataset.mobileSafeContenteditable = 'true';
        control.setAttribute('contenteditable', 'false');
      }
    });
  }

  function unlockControls() {
    document.querySelectorAll('[data-mobile-safe-write-control]').forEach(control => {
      delete control.dataset.mobileSafeWriteControl;
    });
    document.querySelectorAll('[data-mobile-safe-locked]').forEach(control => {
      delete control.dataset.mobileSafeLocked;
      control.removeAttribute('aria-readonly');
      if (control.dataset.mobileSafeWasReadonly === '0') control.readOnly = false;
      delete control.dataset.mobileSafeWasReadonly;
      if (control.dataset.mobileSafeWasDisabled === '0') control.disabled = false;
      delete control.dataset.mobileSafeWasDisabled;
      if (control.dataset.mobileSafeContenteditable === 'true') control.setAttribute('contenteditable', 'true');
      delete control.dataset.mobileSafeContenteditable;
    });
  }

  function renderIndicator() {
    let indicator = document.getElementById('mobileSafeModeIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'mobileSafeModeIndicator';
      indicator.className = 'mobile-safe-mode-indicator';
      indicator.setAttribute('role', 'status');
      const main = document.querySelector('.main');
      (main || document.body).insertBefore(indicator, main?.firstChild || document.body.firstChild);
    }
    indicator.classList.toggle('editing-enabled', !readOnly || helpersOnly);
    indicator.textContent = helpersOnly ? '編輯發布資料' : readOnly ? '唯讀' : '可編輯';
    indicator.setAttribute('aria-label', helpersOnly ? '手機模式：編輯發布資料' : readOnly ? '手機模式：唯讀' : '手機模式：本次可編輯');
    indicator.title = readOnly ? '手機預設唯讀；可到設定開啟本次編輯。' : '本頁籤目前允許手機編輯。';
  }

  function renderSettingsControl() {
    const form = document.querySelector('#settingsView .settings-page-form, #settingsDialog .settings-dialog');
    if (!form) return;

    let section = document.getElementById('mobileSafeModeSettings');
    if (!section) {
      section = document.createElement('section');
      section.id = 'mobileSafeModeSettings';
      section.className = 'settings-section mobile-safe-mode-settings';
      form.prepend(section);
    }

    section.innerHTML = `
      <div class="mobile-safe-mode-settings-head">
        <div>
          <strong>手機使用模式</strong>
          <p>手機預設只供閱讀，避免 Google Drive 尚未完成上傳或下載時覆蓋檔案。需要修改時，請先確認 Drive 已完成傳輸，再開啟本次編輯。</p>
        </div>
        <button id="mobileSafeModeToggle" class="mobile-safe-mode-switch" type="button" role="switch" aria-checked="${readOnly ? 'false' : 'true'}"${modeChangeInProgress ? ' disabled' : ''}>
          <span class="mobile-safe-mode-switch-track" aria-hidden="true"><span></span></span>
          <span>${readOnly ? '允許本次手機編輯' : '結束本次手機編輯'}</span>
        </button>
      </div>
      <div class="mobile-safe-mode-settings-status ${readOnly ? '' : 'editing-enabled'}">
        <strong>${readOnly ? '目前：唯讀' : '目前：可編輯'}</strong>
        <span>${readOnly ? '不會寫入 workspace、settings 或作品 Markdown。' : '只在本頁籤有效；儲存時仍會檢查 workspace 版本衝突。'}</span>
      </div>`;
    section.querySelector('#mobileSafeModeToggle')?.addEventListener('click', toggleEditing);
  }

  function applyMode() {
    document.body.dataset.storyflowMobileSafeMode = readOnly ? 'readonly' : 'editing';
    if (helpersOnly) document.body.dataset.storyflowMobileHelpers = 'editing';
    else delete document.body.dataset.storyflowMobileHelpers;
    renderIndicator();
    renderSettingsControl();
    if (readOnly) {
      // Entering or leaving the helpers changes what is in scope, so marks start over.
      unlockControls();
      decorateControls();
      setSaveStatus();
    } else {
      unlockControls();
    }
  }

  // Every way into editing on a phone starts from the folder's latest workspace.json, and
  // stops at the first thing that could let an older copy overwrite a newer one.
  async function reloadBeforeEditing(confirmText, onConfirmed = () => {}) {
    if (!navigator.onLine) {
      window.notify?.('目前沒有網路連線；為避免舊檔覆蓋，暫時不能開啟手機編輯。', true);
      return false;
    }
    const folder = await StoryFlowIntegrations.restoreOutputDirectory();
    if (!folder?.connected) {
      window.notify?.('請先重新連接 StoryFlow 資料夾，再開啟本次編輯。', true);
      return false;
    }
    if (!window.confirm(confirmText)) return false;
    onConfirmed();
    const reloaded = await window.StoryFlowProjectPersistence?.rehydrate?.();
    if (!reloaded) {
      window.notify?.('無法從資料夾重新載入 workspace.json；為避免覆蓋檔案，手機仍維持唯讀。', true);
      setSaveStatus();
      return false;
    }
    if (StoryFlowIntegrations.getWorkspaceRecovery?.()) {
      window.notify?.('工作區需要先處理 Recovery／版本衝突，尚未開啟手機編輯。', true);
      return false;
    }
    return true;
  }

  async function enableEditing() {
    if (!readOnly) return true;
    try {
      const ready = await reloadBeforeEditing(
        '請先確認手機已連上網路，而且 Google Drive 沒有等待上傳或下載的檔案。\n\nStoryFlow 會重新載入 workspace.json，捨棄尚未保存的畫面變更，然後只在本分頁開啟編輯。\n\n要繼續嗎？'
      );
      if (!ready) return false;
      helpersOnly = false;
      sessionStorage.setItem(SESSION_EDIT_KEY, '1');
      readOnly = false;
      observer?.disconnect();
      applyMode();
      observeNewControls();
      window.StoryFlowSaveStatus?.set?.('手機編輯已開啟 · 儲存前會檢查版本');
      window.notify?.('已重新載入 workspace.json；本次手機編輯已開啟。');
      return true;
    } catch (error) {
      console.warn('StoryFlow could not enable mobile editing safely', error);
      window.notify?.(`尚未開啟手機編輯：${error.message}`, true);
      setSaveStatus();
      return false;
    }
  }

  async function disableEditing() {
    if (readOnly) return true;
    try {
      const saved = await window.StoryFlowProjectPersistence?.flush?.('mobile-readonly');
      if (!saved) {
        window.notify?.('尚未切回唯讀：請先確認目前變更已保存。', true);
        return false;
      }
      sessionStorage.removeItem(SESSION_EDIT_KEY);
      readOnly = true;
      applyMode();
      observeNewControls();
      window.notify?.('目前變更已保存，手機已切回唯讀。');
      return true;
    } catch (error) {
      console.warn('StoryFlow could not return to mobile read-only mode safely', error);
      window.notify?.(`尚未切回唯讀：${error.message}`, true);
      return false;
    }
  }

  function openLightboxKey() {
    const box = document.querySelector('#partsList .publish-lightbox:not([hidden])');
    return box && box.getClientRects().length ? box.closest('.publish-list-item')?.dataset.partKey || '' : '';
  }

  // 開始編輯 in 管理發布: reload, then unlock the summary, Hashtags and afterword of this visit
  // only. The article stays open across the reload, even when the folder's workspace had
  // another work active.
  // One start at a time: on a phone the reload takes seconds, and a second 開始編輯 — from
  // 管理發布 or from inside a tool opened meanwhile — waits for the same one instead of being
  // ignored. While it reloads, 管理發布 and the tools say so (helperAccess() is 'reloading').
  let helperStart = null;
  let helperReloading = false;
  function startHelperEditing() {
    if (helpersOnly) return Promise.resolve(true);
    if (!readOnly) return Promise.resolve(false);
    helperStart ||= startHelperEditingOnce().finally(() => {
      helperStart = null;
      helperReloading = false;
      window.renderParts?.();
      window.dispatchEvent(new CustomEvent('storyflow:helper-access-changed', { detail: { access: helperAccess() } }));
    });
    return helperStart;
  }

  function helperAccess() {
    if (!readOnly) return '';
    if (helpersOnly) return 'open';
    return helperReloading ? 'reloading' : 'locked';
  }

  async function startHelperEditingOnce() {
    if (modeChangeInProgress) return false;
    const key = openLightboxKey();
    const projectId = window.StoryFlowProjects?.activeId?.();
    if (!key) return false;
    modeChangeInProgress = true;
    helpersStarting = true;
    try {
      const ready = await reloadBeforeEditing(
        '請先確認手機已連上網路，而且 Google Drive 沒有等待上傳或下載的檔案。\n\nStoryFlow 會重新載入 workspace.json，然後開放這次「管理發布」裡的摘要、Hashtags、後記與平台標題。關閉「管理發布」時會保存並回到唯讀。\n\n要繼續嗎？',
        () => {
          helperReloading = true;
          window.renderParts?.();
          window.dispatchEvent(new CustomEvent('storyflow:helper-access-changed', { detail: { access: 'reloading' } }));
        }
      );
      if (!ready) return false;
      if (projectId && window.StoryFlowProjects?.activeId?.() !== projectId) {
        window.StoryFlowProjects?.switchProject?.(projectId, { quiet: true });
      }
      helpersOnly = true;
      applyMode();
      if (openLightboxKey() !== key) window.StoryFlowPublishing?.openPart?.(key);
      else window.renderParts?.();
      window.StoryFlowSaveStatus?.set?.('編輯發布資料 · 關閉時保存');
      window.notify?.('已重新載入 workspace.json；可以編輯摘要、Hashtags、後記與平台標題。');
      return true;
    } catch (error) {
      console.warn('StoryFlow could not open the publishing helpers for editing', error);
      window.notify?.(`尚未開啟編輯：${error.message}`, true);
      return false;
    } finally {
      helpersStarting = false;
      modeChangeInProgress = false;
    }
  }

  // Closing 管理發布 (or leaving Publishing) saves, then returns to read-only. A failed save
  // keeps the helpers editable so nothing typed is lost; the next close tries again.
  async function endHelperEditing() {
    if (!helpersOnly || helpersStarting || modeChangeInProgress) return true;
    modeChangeInProgress = true;
    try {
      // Each edited article's own file was left for now (publishing-flow.js); write them,
      // then whatever of workspace.json is still unsaved.
      const publishing = window.StoryFlowPublishing;
      if (publishing?.hasDeferredPartFiles?.()) {
        window.notify?.('正在寫入發布資料…');
        if (!(await publishing.flushDeferredPartFiles())) {
          window.notify?.('文章檔案尚未寫入，仍可編輯；請確認資料夾連線後再關閉一次。', true);
          return false;
        }
      }
      const status = window.StoryFlowPersistenceStatus;
      const saved = typeof status?.settle === 'function'
        ? await status.settle()
        : await window.StoryFlowProjectPersistence?.flush?.('mobile-helpers');
      if (!saved) {
        window.notify?.('發布資料尚未保存，仍可編輯；請確認資料夾連線後再關閉一次。', true);
        return false;
      }
      helpersOnly = false;
      setHelperSaveLabel('');
      applyMode();
      window.renderParts?.();
      window.notify?.('發布資料已保存，手機已回到唯讀。');
      return true;
    } catch (error) {
      console.warn('StoryFlow could not save the publishing helpers', error);
      window.notify?.(`發布資料尚未保存，仍可編輯：${error.message}`, true);
      return false;
    } finally {
      modeChangeInProgress = false;
    }
  }

  async function toggleEditing() {
    if (modeChangeInProgress) return false;
    modeChangeInProgress = true;
    renderSettingsControl();
    try {
      return readOnly ? await enableEditing() : await disableEditing();
    } finally {
      modeChangeInProgress = false;
      renderSettingsControl();
    }
  }

  const integrations = window.StoryFlowIntegrations;
  WRITE_METHODS.forEach(name => {
    const base = integrations?.[name];
    if (typeof base !== 'function' || base.__mobileSafeMode) return;
    const wrapped = async function mobileSafeWriteGuard(...args) {
      if (readOnly && !(helpersOnly && HELPER_WRITE_METHODS.has(name))) throw readonlyError();
      return base.apply(integrations, args);
    };
    wrapped.__mobileSafeMode = true;
    integrations[name] = wrapped;
  });

  try {
    const baseSaveState = saveState;
    saveState = function mobileSafeSaveState(...args) {
      if (helpersOnly) setHelperSaveLabel('保存中…');
      if (readOnly && !helpersOnly) {
        notifyBlocked();
        return false;
      }
      return baseSaveState.apply(this, args);
    };
  } catch (_) {}

  document.addEventListener('click', event => {
    if (!readOnly) return;
    const button = event.target.closest?.('button');
    if (!button || !isWriteButton(button) || inHelperScope(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notifyBlocked();
  }, true);
  document.addEventListener('beforeinput', event => {
    if (!readOnly || isUiOnlyControl(event.target) || inHelperScope(event.target)) return;
    if (!event.target.matches?.('input, textarea, [contenteditable]')) return;
    event.preventDefault();
    notifyBlocked();
  }, true);
  document.addEventListener('change', event => {
    if (!readOnly || isUiOnlyControl(event.target) || isSafeReadInput(event.target) || inHelperScope(event.target)) return;
    if (!event.target.matches?.('input, textarea, select')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notifyBlocked();
  }, true);

  function observeNewControls() {
    if (!observer) {
      observer = new MutationObserver(mutations => {
        if (!document.getElementById('mobileSafeModeSettings')) renderSettingsControl();
        if (!readOnly) return;
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.('input, textarea, select, [contenteditable="true"]')) decorateControls(node.parentElement || document);
          decorateControls(node);
          if (node.matches?.('button') && isWriteButton(node) && !inHelperScope(node)) node.dataset.mobileSafeWriteControl = 'true';
        }));
      });
    }
    observer.disconnect();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.StoryFlowMobileSafeMode = {
    applies: () => true,
    // Whether writes to the folder are refused. False while the publishing helpers are
    // open for editing, so their saves and the workspace flush go through.
    isReadOnly: () => readOnly && !helpersOnly,
    // Whether the manuscript, the split and the visual editor may change: only after the
    // full unlock in Settings, never for the publishing helpers alone.
    canEditContent: () => !readOnly,
    helpersOnly: () => helpersOnly,
    helperSaveLabel: () => helperSaveLabel,
    // What 管理發布 offers: 'locked' (開始編輯 is available), 'open' (the helpers are
    // editable) or '' (the full unlock is on; nothing to offer).
    helperAccess,
    startHelperEditing,
    endHelperEditing,
    enableEditing,
    disableEditing,
    assertWritable: () => {
      if (readOnly && !helpersOnly) throw readonlyError();
      return true;
    }
  };

  window.addEventListener('storyflow:workspace-loaded', setSaveStatus);
  window.addEventListener('storyflow:workspace-persisted', setSaveStatus);
  applyMode();
  observeNewControls();
  // A phone opens Publishing on what is still to be published (UX_FLOW 〈Phone editing〉).
  window.StoryFlowPublishing?.setFilter?.('pending');
  window.renderParts?.();
  window.setTimeout(setSaveStatus, 120);
})();
