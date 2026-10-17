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

  await page.locator('#generateBtn').click();
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
