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
    '#loadSourceBtn',
    '#refreshSourceBtn',
    '#undoSourceUpdateBtn',
    '#resetWorkspaceBtn'
  ].join(',');
  const SAFE_READ_CONTROL_SELECTOR = [
    '#folderBtn',
    '#settingsFolderBtn',
    '#connectBackupFolderBtn',
    '#reconnectStoryFlowFolderBtn',
    '#quickReconnectFolderBtn',
    '#importSettingsJsonBtn',
    '#reimportStoryFlowSettingsBtn',
    '#quickImportSettingsBtn'
  ].join(',');
  const WRITE_METHODS = [
    'saveWorkspace',
    'saveStoryFlowSettings',
    'savePart',
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

  function readonlyError() {
    const error = new Error('手機目前是唯讀模式。請先確認 Google Drive 已同步，再選擇「本次允許編輯」。');
    error.code = 'MOBILE_READ_ONLY';
    return error;
  }

  function setSaveStatus() {
    if (!readOnly) return;
    window.StoryFlowSaveStatus?.set?.('手機唯讀 · 不會寫入資料夾');
  }

  function notifyBlocked() {
    const now = Date.now();
    if (now - lastBlockedNoticeAt < 900) return;
    lastBlockedNoticeAt = now;
    window.notify?.('手機目前是唯讀模式；確認 Drive 同步完成後，可開啟本次編輯。', true);
    setSaveStatus();
  }

  function isUiOnlyControl(control) {
    return Boolean(control?.closest?.(
      '.publishing-project-filter-control, #publishingFilters, .preview-mode-toggle, .source-preview-tabs'
    ));
  }

  function isWriteButton(button) {
    if (!button || button.id === 'mobileSafeModeEnableBtn') return false;
    if (button.matches(SAFE_READ_CONTROL_SELECTOR)) return false;
    if (button.matches(EXPLICIT_WRITE_CONTROL_SELECTOR)) return true;
    const label = `${button.getAttribute('aria-label') || ''} ${button.title || ''} ${button.textContent || ''}`.trim();
    return WRITE_ACTION_PATTERN.test(label);
  }

  function decorateControls(root = document) {
    if (!readOnly) return;
    root.querySelectorAll?.('button').forEach(button => {
      if (isWriteButton(button)) button.dataset.mobileSafeWriteControl = 'true';
    });
    root.querySelectorAll?.('input, textarea, select, [contenteditable="true"]').forEach(control => {
      if (control.dataset.mobileSafeLocked === 'true' || isUiOnlyControl(control)) return;
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

  function renderBanner() {
    let banner = document.getElementById('mobileSafeModeBanner');
    if (!banner) {
      banner = document.createElement('section');
      banner.id = 'mobileSafeModeBanner';
      banner.className = 'mobile-safe-mode-banner';
      banner.setAttribute('role', 'status');
      const main = document.querySelector('.main');
      (main || document.body).insertBefore(banner, main?.firstChild || document.body.firstChild);
    }
    banner.classList.toggle('editing-enabled', !readOnly);
    banner.innerHTML = readOnly
      ? `<div><strong>手機唯讀</strong><span>避免 Google Drive 延遲同步覆蓋檔案；目前不會寫入 workspace、settings 或 Markdown。</span></div><button id="mobileSafeModeEnableBtn" class="button tiny ghost" type="button">本次允許編輯</button>`
      : `<div><strong>手機編輯已開啟</strong><span>本分頁關閉前可寫入；儲存時仍會檢查 workspace 版本衝突。</span></div>`;
    document.getElementById('mobileSafeModeEnableBtn')?.addEventListener('click', enableEditing);
  }

  function applyMode() {
    document.body.dataset.storyflowMobileSafeMode = readOnly ? 'readonly' : 'editing';
    renderBanner();
    if (readOnly) {
      decorateControls();
      setSaveStatus();
    } else {
      unlockControls();
    }
  }

  async function enableEditing() {
    if (!readOnly) return true;
    if (!navigator.onLine) {
      window.notify?.('目前沒有網路連線；為避免舊檔覆蓋，暫時不能開啟手機編輯。', true);
      return false;
    }
    const folder = await StoryFlowIntegrations.restoreOutputDirectory();
    if (!folder?.connected) {
      window.notify?.('請先重新連接 StoryFlow 資料夾，再開啟本次編輯。', true);
      return false;
    }
    const confirmed = window.confirm(
      '請先確認手機已連上網路，而且 Google Drive 沒有等待上傳或下載的檔案。\n\nStoryFlow 會重新載入 workspace.json，捨棄尚未保存的畫面變更，然後只在本分頁開啟編輯。\n\n要繼續嗎？'
    );
    if (!confirmed) return false;

    try {
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
      sessionStorage.setItem(SESSION_EDIT_KEY, '1');
      readOnly = false;
      observer?.disconnect();
      applyMode();
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

  const integrations = window.StoryFlowIntegrations;
  WRITE_METHODS.forEach(name => {
    const base = integrations?.[name];
    if (typeof base !== 'function' || base.__mobileSafeMode) return;
    const wrapped = async function mobileSafeWriteGuard(...args) {
      if (readOnly) throw readonlyError();
      return base.apply(integrations, args);
    };
    wrapped.__mobileSafeMode = true;
    integrations[name] = wrapped;
  });

  try {
    const baseSaveState = saveState;
    saveState = function mobileSafeSaveState(...args) {
      if (readOnly) {
        notifyBlocked();
        return false;
      }
      return baseSaveState.apply(this, args);
    };
  } catch (_) {}

  document.addEventListener('click', event => {
    if (!readOnly) return;
    const button = event.target.closest?.('button');
    if (!button || !isWriteButton(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notifyBlocked();
  }, true);
  document.addEventListener('beforeinput', event => {
    if (!readOnly || isUiOnlyControl(event.target)) return;
    if (!event.target.matches?.('input, textarea, [contenteditable]')) return;
    event.preventDefault();
    notifyBlocked();
  }, true);
  document.addEventListener('change', event => {
    if (!readOnly || isUiOnlyControl(event.target)) return;
    if (!event.target.matches?.('input, textarea, select')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notifyBlocked();
  }, true);

  observer = new MutationObserver(mutations => {
    if (!readOnly) return;
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches?.('input, textarea, select, [contenteditable="true"]')) decorateControls(node.parentElement || document);
      decorateControls(node);
      if (node.matches?.('button') && isWriteButton(node)) node.dataset.mobileSafeWriteControl = 'true';
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.StoryFlowMobileSafeMode = {
    applies: () => true,
    isReadOnly: () => readOnly,
    enableEditing,
    assertWritable: () => {
      if (readOnly) throw readonlyError();
      return true;
    }
  };

  window.addEventListener('storyflow:workspace-loaded', setSaveStatus);
  window.addEventListener('storyflow:workspace-persisted', setSaveStatus);
  applyMode();
  window.setTimeout(setSaveStatus, 120);
})();
