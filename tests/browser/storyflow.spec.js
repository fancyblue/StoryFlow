import { expect, test } from '@playwright/test';

async function prepare(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  return pageErrors;
}

test('manual project can reach workspace, works, publishing, and settings', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '內容發布工作台' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-storyflow-load-error', 'true');
  await expect(page.locator('script[data-storyflow-owner]')).toHaveCount(48);

  await page.locator('#createProjectManually').click();
  await page.locator('#workspaceLoadSourceBtn').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualSourceTitle').fill('自動測試章節');
  await page.locator('#manualSourceText').fill('第一段測試內容。\n\n第二段測試內容，確認可以安全切篇。');
  await page.locator('#previewManualSourceBtn').click();

  await expect(page.locator('#sourcePreviewDialog')).toBeVisible();
  await expect(page.locator('#sourcePreviewContent')).toContainText('第一段測試內容');
  await page.locator('#confirmSourcePreviewBtn').click();

  await expect(page.locator('#chapterTitle')).toHaveValue('自動測試章節');
  await expect(page.locator('#chapterChars')).not.toHaveText('0');
  await expect(page.locator('#suggestionCard')).toBeVisible();

  await page.locator('.nav-item[data-view="projects"]').click();
  await expect(page.getByRole('heading', { name: '作品', exact: true })).toBeVisible();
  await expect(page.locator('#projectsLibrary')).toContainText('未命名作品');

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.getByRole('heading', { name: '發布', exact: true })).toBeVisible();
  await expect(page.locator('#publishingView')).toBeVisible();

  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
  await expect(page.getByText('備份與復原')).toBeVisible();
  await expect(page.getByRole('button', { name: '離開此裝置', exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('workspace safety fixtures pass without a real folder', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/workspace-safety-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();

  await page.goto('/tests/workspace-safety-ui.html');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /備份/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('backup center renders safe workspace metadata', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/backup-center-ui.html');

  await expect(page.getByText('備份與復原')).toBeVisible();
  await expect(page.getByText('StoryFlow-test')).toBeVisible();
  await expect(page.getByText('2 部作品 · 8 個章節 · 3 篇發布稿')).toBeVisible();
  await expect(page.getByRole('button', { name: '從最近備份恢復', exact: true })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('remembered folder supports fast reconnect and explicit leave suppression', async ({ page }) => {
  const pageErrors = await prepare(page);
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
