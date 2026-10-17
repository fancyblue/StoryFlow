import { expect } from '@playwright/test';
import { standInForConnectedFolder } from './folder.js';

// Most tests need a connected folder to get as far as their own subject. The ones that
// are *about* the unconnected or reconnecting state opt out, so the assumption each
// test makes about the folder is visible in the test itself.
export async function prepare(page, { connectedFolder = true } = {}) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  if (connectedFolder) await standInForConnectedFolder(page);
  return pageErrors;
}

// Works is the landing page, so a test whose subject is the workbench has to say so. It
// used to arrive there for free.
export async function gotoWorkbench(page, url = '/') {
  await page.goto(url);
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect(page.getByRole('heading', { name: '內容發布工作台' })).toBeVisible();
  // Changing view starts a smooth window.scrollTo. A test that measures window.scrollY
  // straight afterwards reads a frame of that animation, not the page at rest.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}
