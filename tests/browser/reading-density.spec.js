import { expect, test } from '@playwright/test';
import { standInForConnectedFolder } from './support/folder.js';

// StoryFlow is read more than it is operated: the split preview and the reading view exist to
// show prose. These pin how much of the window that prose gets, and 閱讀設定, which lets each
// browser choose its size, leading, measure and density.

const paragraph = index =>
  `第${index}段。鐘聲停下後，長廊只剩窗外落雨的聲音。她攤開掌心，淡銀色的印紋沿著指節亮起，像是有人在很遠的地方點了一盞燈。`;

async function openLongChapter(page, { blockStorage = false } = {}) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  if (blockStorage) {
    // Blocked site data: only this feature's key refuses, so the test is about 閱讀設定 and not
    // about every other module's storage handling.
    await page.addInitScript(() => {
      const { getItem, setItem } = Storage.prototype;
      Storage.prototype.getItem = function (key) {
        if (key === 'storyflow.ui.readingSettings') throw new DOMException('blocked', 'SecurityError');
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === 'storyflow.ui.readingSettings') throw new DOMException('blocked', 'SecurityError');
        return setItem.call(this, key, value);
      };
    });
  }
  await page.goto('/');
  // Changing view starts a smooth scroll; act on the workbench once it is at rest, as
  // visual-regression.spec.js does.
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await expect(page.locator('#manualSourceDialog')).toBeVisible();
  await page.locator('#manualProjectTitle').fill('閱讀密度');
  await page.locator('#manualSourceTitle').fill('01、長章節');
  await page.locator('#manualSourceText').fill(Array.from({ length: 30 }, (_, i) => paragraph(i + 1)).join('\n\n'));
  await page.locator('#previewManualSourceBtn').click();
  await expect(page.locator('#sourcePreviewDialog')).toBeVisible();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  return pageErrors;
}

// The preview is re-rendered after a cut is confirmed and whenever a setting changes, so a
// single read can land on a root that has just been replaced. Callers poll.
const proseOf = (page, selector) => page.evaluate(sel => {
  const root = document.querySelector(`${sel} .sf-preview-rendered-root`);
  if (!root) return null;
  const style = getComputedStyle(root);
  return { fontSize: style.fontSize, lineHeight: style.lineHeight, maxWidth: style.maxWidth };
}, selector);

test('the reading view gives the window to the text and keeps the save state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = await openLongChapter(page);
  await page.locator('#openReadingViewBtn').click();
  await expect(page.locator('#readingView')).toBeVisible();

  // It is a page of its own, so the workbench's title does not stay above it; whether the cut
  // was written does.
  await expect(page.getByRole('heading', { name: '內容發布工作台' })).toBeHidden();
  await expect(page.locator('#saveState')).toBeVisible();

  const layout = await page.evaluate(() => {
    const flow = document.getElementById('readingFlow').getBoundingClientRect();
    const actions = document.querySelector('.reading-view-actions').getBoundingClientRect();
    return {
      flowTop: flow.top,
      actionsBottom: actions.bottom,
      viewport: innerHeight,
      pageScrolls: document.documentElement.scrollHeight > innerHeight + 1
    };
  });
  // The flow used to start below 280px, under the workbench title, an eyebrow and three rows.
  expect(layout.flowTop).toBeLessThan(170);
  expect(layout.actionsBottom).toBeLessThanOrEqual(layout.viewport);
  expect(layout.pageScrolls).toBe(false);

  // 閱讀設定 sits immediately before the control that leaves this surface.
  await expect(page.locator('#closeReadingViewBtn')).toHaveJSProperty('previousElementSibling.ariaLabel', '閱讀設定');
  expect(pageErrors).toEqual([]);
});

test('the split preview keeps its controls beside the text rather than above it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const pageErrors = await openLongChapter(page);

  // The format choice joins the panel head; the scene buttons end the article's title row.
  await expect(page.locator('#smartSplitHeaderActions #splitPlatformBar')).toBeVisible();
  await expect(page.locator('#suggestionPlatformSelect')).toHaveAttribute('aria-label', '預覽格式');
  await expect(page.locator('.suggestion-title-row .preview-boundary-controls #shrinkBtn')).toBeVisible();

  let layout = null;
  const readLayout = () => page.evaluate(() => {
    const preview = document.getElementById('preview');
    const root = preview.querySelector('.sf-preview-rendered-root');
    if (!root) return null;
    const range = document.createRange();
    range.selectNodeContents(root);
    const firstLine = [...range.getClientRects()].find(rect => rect.width > 2);
    if (!firstLine) return null;
    const sourceHead = document.querySelector('.source-panel > .panel-head').getBoundingClientRect();
    const splitHead = document.querySelector('.splitter-panel > .panel-head').getBoundingClientRect();
    return {
      textInset: firstLine.top - preview.getBoundingClientRect().top,
      sourceHeadBottom: Math.round(sourceHead.bottom),
      splitHeadBottom: Math.round(splitHead.bottom),
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  // The preview can be re-rendered between two reads, so read until it is there.
  await expect.poll(async () => (layout = await readLayout())).not.toBeNull();
  // No row is reserved above the text for buttons that used to float over it.
  expect(layout.textInset).toBeLessThan(40);
  // The two heads still draw one rule across the page.
  expect(layout.splitHeadBottom).toBe(layout.sourceHeadBottom);
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('reading settings change every prose surface and stay with this browser', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = await openLongChapter(page);
  await expect.poll(() => proseOf(page, '#preview')).toEqual({ fontSize: '16px', lineHeight: '28.8px', maxWidth: '576px' });

  const toggle = page.locator('#smartSplitHeaderActions .sf-reading-settings-toggle');
  await toggle.click();
  const panel = page.getByRole('dialog', { name: '閱讀設定' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: '還原預設' })).toBeDisabled();
  await panel.getByRole('button', { name: '放大字級' }).click();
  await panel.getByRole('button', { name: '放大字級' }).click();
  await panel.getByRole('group', { name: '行高' }).getByRole('button', { name: '寬鬆' }).click();
  await panel.getByRole('button', { name: '減少每行字數' }).click();
  await panel.getByRole('group', { name: '介面密度' }).getByRole('button', { name: '緊湊' }).click();
  await expect(panel.locator('output').first()).toHaveText('18 px');

  // 34 characters at 18px is a 612px measure, and the leading follows the size.
  await expect.poll(() => proseOf(page, '#preview')).toEqual({ fontSize: '18px', lineHeight: '36px', maxWidth: '612px' });
  await expect(page.locator('html')).toHaveAttribute('data-sf-reading-density', 'compact');
  await expect(page.locator('#preview')).toHaveCSS('padding-top', '16px');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();

  // The reading view reads the same settings, and its column grows with the measure.
  await page.locator('#openReadingViewBtn').click();
  await expect.poll(() => proseOf(page, '#readingFlow')).toEqual({ fontSize: '18px', lineHeight: '36px', maxWidth: '612px' });
  await expect(page.locator('#readingFlow')).toHaveCSS('width', `${34 * 18 + 84}px`);

  // A browser's choice survives a reload; it is not part of the work.
  await page.reload();
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-sf-reading-density', 'compact');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sf-reading-size').trim())).toBe('18px');

  await page.locator('.sf-reading-settings-toggle').first().click();
  await page.getByRole('dialog', { name: '閱讀設定' }).getByRole('button', { name: '還原預設' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-sf-reading-density', /./);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('storyflow.ui.readingSettings'))))
    .toEqual({ size: 16, leading: 1.8, chars: 36, density: 'comfortable' });
  expect(pageErrors).toEqual([]);
});

test('reading settings still apply when this browser refuses to store them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = await openLongChapter(page, { blockStorage: true });

  await page.locator('#smartSplitHeaderActions .sf-reading-settings-toggle').click();
  await page.getByRole('dialog', { name: '閱讀設定' }).getByRole('button', { name: '放大字級' }).click();
  await expect.poll(async () => (await proseOf(page, '#preview'))?.fontSize).toBe('17px');
  expect(pageErrors).toEqual([]);
});
