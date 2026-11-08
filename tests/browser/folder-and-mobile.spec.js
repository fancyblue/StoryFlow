import { expect, test } from '@playwright/test';
import { prepare } from './support/workbench.js';

test('workspace safety fixtures pass without a real folder', async ({ page }) => {
  // These are standalone fixture pages that assert their own behaviour with no folder,
  // as the name says. Patching StoryFlowIntegrations under them changes what they test.
  const pageErrors = await prepare(page, { connectedFolder: false });
  await page.goto('/tests/workspace-safety-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();

  await page.goto('/tests/destructive-action-guard-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();

  await page.goto('/tests/article-image-assets-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();

  await page.goto('/tests/workspace-safety-ui.html');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /備份/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('mobile safe mode blocks file writes until the workspace is reloaded and editing is enabled', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/mobile-safe-mode-ui.html');

  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'readonly');
  await expect(page.locator('#mobileSafeModeIndicator')).toHaveText('唯讀');
  await expect(page.locator('#mobileSafeModeIndicator')).not.toContainText('Google Drive');
  await expect(page.locator('#mobileSafeModeSettings')).toContainText('手機使用模式');
  await expect(page.locator('#projectTitle')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#generateBtn')).toHaveAttribute('data-mobile-safe-write-control', 'true');
  await expect(page.locator('#importSettingsJsonBtn')).not.toHaveAttribute('data-mobile-safe-write-control');

  const blocked = await page.evaluate(async () => {
    const saveStateResult = saveState('不應保存');
    let workspaceError = null;
    let imageImportError = null;
    let imageDeleteError = null;
    try { await StoryFlowIntegrations.saveWorkspace({ state: {} }); }
    catch (error) { workspaceError = error.code; }
    try { await StoryFlowIntegrations.importPartImages({ files: [] }); }
    catch (error) { imageImportError = error.code; }
    try { await StoryFlowIntegrations.removePartImage({}); }
    catch (error) { imageDeleteError = error.code; }
    return { saveStateResult, workspaceError, imageImportError, imageDeleteError, calls: { ...fixtureCalls } };
  });
  expect(blocked.saveStateResult).toBe(false);
  expect(blocked.workspaceError).toBe('MOBILE_READ_ONLY');
  expect(blocked.imageImportError).toBe('MOBILE_READ_ONLY');
  expect(blocked.imageDeleteError).toBe('MOBILE_READ_ONLY');
  expect(blocked.calls.saveState).toBe(0);
  expect(blocked.calls.workspace).toBe(0);
  expect(blocked.calls.imageImport).toBe(0);
  expect(blocked.calls.imageDelete).toBe(0);

  // Read-only does not offer a write at all; a click that still reaches one is refused.
  await expect(page.locator('#generateBtn')).toBeHidden();
  await page.evaluate(() => document.getElementById('generateBtn').click());
  expect(await page.evaluate(() => fixtureCalls.generate)).toBe(0);

  const mobileEditSwitch = page.getByRole('switch', { name: '允許本次手機編輯', exact: true });
  await expect(mobileEditSwitch).toHaveAttribute('aria-checked', 'false');
  await mobileEditSwitch.click();
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'editing');
  await expect(page.locator('#mobileSafeModeIndicator')).toHaveText('可編輯');
  await expect(page.getByRole('switch', { name: '結束本次手機編輯', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#projectTitle')).toHaveJSProperty('readOnly', false);

  const enabled = await page.evaluate(async () => {
    const saveStateResult = saveState('可以保存');
    const workspacePath = await StoryFlowIntegrations.saveWorkspace({ state: {} });
    await StoryFlowIntegrations.importPartImages({ files: [] });
    return { saveStateResult, workspacePath, calls: { ...fixtureCalls } };
  });
  expect(enabled.saveStateResult).toBe(true);
  expect(enabled.workspacePath).toBe('workspace.json');
  expect(enabled.calls.rehydrate).toBe(1);
  expect(enabled.calls.saveState).toBe(1);
  expect(enabled.calls.workspace).toBe(1);
  expect(enabled.calls.imageImport).toBe(1);

  await page.getByRole('switch', { name: '結束本次手機編輯', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'readonly');
  await expect(page.locator('#mobileSafeModeIndicator')).toHaveText('唯讀');
  await expect(page.locator('#projectTitle')).toHaveJSProperty('readOnly', true);
  expect(await page.evaluate(() => fixtureCalls.flush)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('desktop does not enable mobile safe mode', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await expect(page.locator('#mobileSafeModeIndicator')).toHaveCount(0);
  await expect(page.locator('#mobileSafeModeSettings')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-storyflow-mobile-safe-mode');
  await expect(page.locator('#projectTitle')).toHaveJSProperty('readOnly', false);
  expect(pageErrors).toEqual([]);
});

test('mobile editing remains read-only when workspace reload fails', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/mobile-safe-mode-ui.html?reloadFailure=1');

  await page.getByRole('switch', { name: '允許本次手機編輯', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'readonly');
  await expect.poll(() => page.evaluate(() => fixtureLastNotify)).toContain('無法從資料夾重新載入');
  await expect(page.locator('#projectTitle')).toHaveJSProperty('readOnly', true);
  await expect.poll(() => page.evaluate(() => fixtureCalls.rehydrate)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('mobile editing stays enabled when returning to read-only cannot save', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/mobile-safe-mode-ui.html?flushFailure=1');

  await page.getByRole('switch', { name: '允許本次手機編輯', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'editing');
  await page.getByRole('switch', { name: '結束本次手機編輯', exact: true }).click();

  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'editing');
  await expect(page.locator('#mobileSafeModeIndicator')).toHaveText('可編輯');
  await expect.poll(() => page.evaluate(() => fixtureLastNotify)).toContain('尚未切回唯讀');
  await expect.poll(() => page.evaluate(() => fixtureCalls.flush)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('remembered folder supports fast reconnect and explicit leave suppression', async ({ page }) => {
  // The subject is reconnecting an expired session, so the folder must not start connected.
  const pageErrors = await prepare(page, { connectedFolder: false });
  await page.goto('/tests/quick-start-ui.html');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('StoryFlow-test');
  const reconnect = page.getByRole('button', { name: '快速重新連接', exact: true });
  await expect(reconnect).toBeFocused();
  await reconnect.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-quick-start-reuse', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-quick-start-destination', 'workspace');

  await page.goto('/tests/quick-start-ui.html?storyflow-left=1');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('first run on a phone keeps its only action clear of the bottom navigation', async ({ page }) => {
  // The folder gate makes connecting the one thing a new user can do here, so that
  // button has to be reachable without scrolling and without the nav sitting on it.
  const pageErrors = await prepare(page, { connectedFolder: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?visual-regression=1');

  const connect = page.locator('#projectsConnectFolderBtn');
  await expect(connect).toBeVisible();

  const layout = await page.evaluate(() => {
    const button = document.getElementById('projectsConnectFolderBtn').getBoundingClientRect();
    // On a phone the sidebar becomes the fixed bottom navigation bar.
    const bar = document.querySelector('.sidebar');
    const barBox = bar?.getBoundingClientRect();
    return {
      buttonTop: button.top,
      buttonBottom: button.bottom,
      barTop: barBox?.top ?? null,
      barIsBottomBar: Boolean(bar && getComputedStyle(bar).position === 'fixed'
        && barBox.bottom >= window.innerHeight - 4)
    };
  });

  // Guard the guard: if the bar stops being the fixed bottom bar this assertion would
  // silently stop meaning anything, so assert the premise too.
  expect(layout.barIsBottomBar).toBe(true);
  expect(layout.buttonTop).toBeGreaterThanOrEqual(0);
  // Fully above the bottom navigation, not merely inside the viewport behind it.
  expect(layout.buttonBottom).toBeLessThanOrEqual(layout.barTop);

  expect(pageErrors).toEqual([]);
});

test('a phone can import settings.json while staying read-only', async ({ page }) => {
  // Reading on a phone starts here: settings.json carries the Google integration, and
  // without it there is no way in. The import button was already treated as a safe read,
  // but the capture-phase change guard cancelled the event the picker produced, so the
  // file was chosen and the only response was the read-only notice. Nothing about this
  // writes to the folder, so read-only must not block it.
  const pageErrors = await prepare(page, { connectedFolder: false });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    });
  });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() =>
    window.StoryFlowMobileSafeMode?.isReadOnly?.() ?? null)).toBe(true);

  await page.evaluate(() => window.openSettings?.());
  await expect(page.locator('#settingsBootstrapFileInput')).toHaveCount(1);

  // Disposable credentials — never a real client id or key.
  await page.setInputFiles('#settingsBootstrapFileInput', {
    name: 'settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      googleClientId: '123456789012-storyflowtest.apps.googleusercontent.com',
      pickerApiKey: 'TEST-PICKER-KEY-NOT-REAL'
    }))
  });

  await expect.poll(() => page.evaluate(() =>
    window.STORYFLOW_CONFIG?.googleClientId || null))
    .toBe('123456789012-storyflowtest.apps.googleusercontent.com');
  expect(await page.evaluate(() => window.StoryFlowIntegrations?.pickerApiKey?.()))
    .toBe('TEST-PICKER-KEY-NOT-REAL');

  // The import must not have unlocked writing as a side effect.
  expect(await page.evaluate(() => window.StoryFlowMobileSafeMode?.isReadOnly?.())).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('a folder-capable phone keeps its connect entry and is never told to switch browser', async ({ page }) => {
  // Chrome on Android does connect a folder — confirmed on a real device, and it is the
  // third step of the phone reading route (UX_FLOW O-07). This test exists because that
  // was assumed to be false once: folder access is a browser capability, never a device
  // class, and gating it by screen size or user agent would close the route.
  const pageErrors = await prepare(page, { connectedFolder: false });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    });
  });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() =>
    window.StoryFlowMobileSafeMode?.isReadOnly?.() ?? null)).toBe(true);
  expect(await page.evaluate(() =>
    window.StoryFlowIntegrations?.supportsFolderAccess?.())).toBe(true);

  // The way in must be present and must not be a dead end.
  const connect = page.locator('#projectsConnectFolderBtn');
  await expect(connect).toBeVisible();
  await expect(page.locator('.projects-empty-state strong')).toHaveText('先連接 StoryFlow 資料夾');
  await expect(page.locator('#folderBtn')).toHaveText('選擇資料夾');

  // Read-only exists to stop writes reaching the folder, not to stop connecting one.
  expect(await page.evaluate(() =>
    document.getElementById('folderBtn')?.dataset.mobileSafeWriteControl ?? null)).toBeNull();

  // And it must never be told this browser cannot do it.
  await expect(page.locator('.projects-empty-state')).not.toContainText('無法連接資料夾');
  await expect(page.locator('#projectCreationChooserNote')).not.toContainText('Chrome 或 Edge');

  expect(pageErrors).toEqual([]);
});

// A phone reads a visual work: the article, its preview and the photo library are there, and
// nothing that would change the work is offered (REDESIGN_PROPOSAL C7).
test('a phone reads a visual work without being offered a change', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    });
  });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'readonly');
  await page.evaluate(() => {
    StoryFlowIntegrations.fetchDrivePhoto = async () => {
      const canvas = new OffscreenCanvas(40, 30);
      canvas.getContext('2d').fillRect(0, 0, 40, 30);
      return canvas.convertToBlob({ type: 'image/png' });
    };
    StoryFlowProjects.createProject({
      title: '手機圖文', contentMode: 'visual',
      visualEntry: { id: 'phone-entry', title: '港口', body: '夜裡的港口。', photoId: 'phone-photo' }
    }, { quiet: true });
    state.photos = [StoryFlowContentModel.normalizeVisualPhoto({ id: 'phone-photo', driveFileId: 'drive-phone', name: 'IMG_1.jpg' })];
    renderAll();
  });
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect(page.locator('#visualReadonlyNote')).toBeVisible();
  for (const control of ['#visualAddPhotosBtn', '#visualNewEntryBtn', '#visualEntryBody', '#visualEntryTitle', '#visualRemovePhoto', '#visualQuoteFromBody']) {
    await expect(page.locator(control), control).toBeDisabled();
  }
  await page.locator('.visual-pane-switch [data-pane="preview"]').click();
  await expect(page.locator('#visualPreviewArticle .visual-article-body')).toHaveText('夜裡的港口。');
  await expect(page.locator('#visualPreviewArticle .visual-article-figure img')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

// A phone reads a longform work: choosing a work or a chapter is reading, whatever its text
// says, and what read-only cannot do is not offered at all. Read-only used to guess writes
// from a button's text, so a work card reading 「手動建立」 could not be opened, and a
// chapter whose title held a word such as 確認 could not be chosen.
test('a phone in read-only opens any work and chapter and offers no write', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    });
  });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'readonly');
  const ids = await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '確認之書' }, { quiet: true });
    state.chapters = [
      { id: 'phone-ch-1', title: '序章', draft: '第一段。\n\n第二段。', source: null, confirmedBlockCount: 0, parts: [] },
      { id: 'phone-ch-2', title: '確認身分', draft: '第三段。\n\n第四段。', source: null, confirmedBlockCount: 0, parts: [] }
    ];
    state.activeChapterId = 'phone-ch-1';
    renderAll();
    const first = StoryFlowProjects.activeId();
    StoryFlowProjects.createProject({ title: '另一部' }, { quiet: true });
    return { first, second: StoryFlowProjects.activeId() };
  });

  await page.locator('.nav-item[data-view="projects"]').click();
  const card = page.getByRole('button', { name: '開啟「確認之書」' });
  await expect(card).toContainText('手動建立');
  await expect(page.locator('#projectsNewWorkBtn')).toBeHidden();
  await card.click();
  await expect.poll(() => page.evaluate(() => StoryFlowProjects.activeId())).toBe(ids.first);
  await expect(page.locator('#workspaceView')).toBeVisible();

  await page.locator('#chapterList .chapter-item', { hasText: '確認身分' }).click();
  await expect.poll(() => page.evaluate(() => state.activeChapterId)).toBe('phone-ch-2');
  for (const control of ['#addChapterBtn', '#confirmBtn', '#chapterList .chapter-more-button']) {
    await expect(page.locator(control).first(), control).toBeHidden();
  }
  await page.locator('.nav-item[data-view="settings"]').click();
  await expect(page.locator('#clearPickerKeyBtn')).toBeHidden();
  await expect(page.getByRole('switch', { name: '允許本次手機編輯', exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

// A phone edits an article's summary, Hashtags and afterword from 管理發布, and nothing else.
// 開始編輯 reloads the folder's workspace.json first — so a change made on the desktop since
// the phone loaded is what gets edited, not overwritten — and closing 管理發布 saves and
// returns to read-only. settings.json is never written: only the workspace was reloaded.
test('a read-only phone edits the publishing helpers for one visit to 管理發布', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    });
    // The folder: what loadWorkspace reads and every write that reaches it. Patched under
    // the app's own wrappers, as the folder stand-in is, so read-only still guards it.
    window.__folder = { workspace: null, writes: [] };
    const standIn = Object.getOwnPropertyDescriptor(window, 'StoryFlowIntegrations');
    Object.defineProperty(window, 'StoryFlowIntegrations', {
      configurable: true,
      get: standIn.get,
      set: next => {
        standIn.set(next);
        if (!next || next.__folderRecorder) return;
        next.__folderRecorder = true;
        next.loadWorkspace = async () => (window.__folder.workspace ? structuredClone(window.__folder.workspace) : null);
        next.saveWorkspace = async payload => {
          window.__folder.workspace = structuredClone(payload);
          window.__folder.writes.push('workspace');
          return { name: 'StoryFlow 測試資料夾' };
        };
        for (const name of ['savePart', 'saveVisualEntry', 'saveStoryFlowSettings', 'importPartImages']) {
          next[name] = async () => { window.__folder.writes.push(name); return true; };
        }
      }
    });
  });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-safe-mode', 'readonly');

  await page.evaluate(() => {
    window.confirm = () => true;
    StoryFlowProjects.createProject({ title: '手機發布' }, { quiet: true });
    const part = index => ({
      id: `phone-pub-${index}`, title: `第一章（${index}）`, chars: 9, startBlock: index - 1, endBlock: index,
      raw: '雨落在長廊上。', formatted: '雨落在長廊上。', summary: '', hashtags: '', afterword: '',
      images: [], published: false, platformStatus: {}
    });
    state.chapters = [{ id: 'phone-pub-ch', title: '第一章', draft: '雨落在長廊上。\n\n風吹過窗。', source: null, confirmedBlockCount: 2, parts: [part(1), part(2)] }];
    state.activeChapterId = 'phone-pub-ch';
    renderAll();
    // Since the phone loaded, the desktop wrote an afterword for the second part.
    const folderState = structuredClone(state);
    folderState.chapters[0].parts[1].afterword = '桌機寫的後記';
    window.__folder.workspace = {
      schemaVersion: 2, updatedAt: new Date().toISOString(), activeProjectId: StoryFlowProjects.activeId(),
      projects: [{ id: StoryFlowProjects.activeId(), title: '手機發布', placeholder: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), state: folderState }]
    };
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('#publishingFilters .publishing-filter.active')).toHaveText(/待發布/);
  await page.locator('.publish-list-item', { hasText: '第一章（1）' }).locator('.publish-manage-btn').click();
  const lightbox = page.locator('.publish-lightbox:not([hidden])');
  await expect(lightbox.locator('.publish-helpers-edit-start')).toBeVisible();

  await lightbox.locator('.publish-helpers-edit-start').click();
  await expect(page.locator('body')).toHaveAttribute('data-storyflow-mobile-helpers', 'editing');
  await expect(page.locator('#mobileSafeModeIndicator')).toHaveText('編輯發布資料');
  await expect(lightbox.locator('.publish-helpers-edit.is-open')).toBeVisible();
  // The reload happened: the desktop's afterword is in the phone's copy now.
  expect(await page.evaluate(() => state.chapters[0].parts[1].afterword)).toBe('桌機寫的後記');
  // A platform's title opens for editing; publishing it does not, and the split stays shut.
  await lightbox.getByRole('button', { name: '顯示「方格子」版本' }).click();
  await expect(lightbox.locator('#editPlatformTitle')).toBeVisible();
  await expect(lightbox.locator('#togglePlatformPublished')).toBeHidden();
  await expect(lightbox.locator('#platformPreviewRecordBtn')).toBeHidden();
  await expect(lightbox.locator('#platformPreviewIncludeTitle')).toBeDisabled();

  await lightbox.locator('.publish-afterword-tool-btn').click();
  const afterword = page.locator('#publishingArticleToolDialog .publish-afterword-input');
  await expect(afterword).toBeEditable();
  await afterword.fill('手機補的後記');
  await page.locator('#publishingArticleToolDialog .publishing-article-tool-actions [data-article-tool-close]').click();
  await expect(page.locator('#publishingArticleToolDialog')).not.toHaveAttribute('open');
  await expect.poll(() => page.evaluate(() => window.__folder.writes.includes('savePart'))).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.stringify(window.__folder.workspace))).toContain('手機補的後記');
  expect(await page.evaluate(() => JSON.stringify(window.__folder.workspace))).toContain('桌機寫的後記');

  // Only the helpers opened: an image import is still refused.
  expect(await page.evaluate(async () => {
    try { await StoryFlowIntegrations.importPartImages({ files: [] }); return 'written'; }
    catch (error) { return error.code; }
  })).toBe('MOBILE_READ_ONLY');

  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveAttribute('data-storyflow-mobile-helpers', 'editing');
  await expect(page.locator('#mobileSafeModeIndicator')).toHaveText('唯讀');
  expect(await page.evaluate(() => saveState('不應保存'))).toBe(false);
  const writes = await page.evaluate(() => window.__folder.writes);
  expect(writes).not.toContain('saveStoryFlowSettings');
  expect(writes).not.toContain('importPartImages');
  expect(pageErrors).toEqual([]);
});

test('the sidebar connection row shows where the pointer and the keyboard are', async ({ page }) => {
  // The desktop rail is paper-coloured ground. Its hover and focus wash was written for the
  // old dark rail, white at 6%, and could not be seen: a keyboard user tabbing onto this row
  // got no mark at all, because the row also sets outline:none.
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const row = page.locator('#sidebarConnectionStatus .sidebar-connection-row').first();
  await expect(row).toBeVisible();
  const background = () => row.evaluate(el => getComputedStyle(el).backgroundColor);
  await expect.poll(background).toBe('rgba(0, 0, 0, 0)');

  await row.focus();
  await page.keyboard.press('Shift');
  await expect.poll(() => row.evaluate(el => el.matches(':focus-visible'))).toBe(true);
  await expect.poll(background).toBe('rgb(244, 241, 233)');

  await row.evaluate(el => el.blur());
  await row.hover();
  await expect.poll(background).toBe('rgb(244, 241, 233)');
  expect(pageErrors).toEqual([]);
});
