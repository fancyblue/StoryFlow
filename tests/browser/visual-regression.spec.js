import { expect, test } from '@playwright/test';

const visualCss = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  .storyflow-toast-stack, .save-state { visibility: hidden !important; }
`;

async function openManualWork(page) {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await page.goto('/?visual-regression=1');
  await page.addStyleTag({ content: visualCss });
  await page.locator('#createProjectManually').click();
  await page.locator('#workspaceLoadSourceBtn').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualSourceTitle').fill('08、印紋');
  await page.locator('#manualSourceText').fill([
    '鐘聲停下後，長廊只剩窗外落雨的聲音。',
    '她攤開掌心，淡銀色的印紋沿著指節亮起。',
    '門後沒有回答，只有另一道光在黑暗裡呼應。',
    '這一刻，她終於知道信裡被抹去的名字屬於誰。'
  ].join('\n\n'));
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await page.evaluate(() => {
    window.StoryFlowIntegrations.savePart = async () => 'Works/視覺測試/08、印紋/08、印紋（1）.md';
  });
}

async function addVisualChapters(page, total = 18) {
  await page.evaluate(count => {
    const list = document.getElementById('chapterList');
    const row = list?.querySelector('.chapter-row');
    if (!list || !row) return;
    for (let index = 1; index < count; index += 1) {
      const clone = row.cloneNode(true);
      const title = clone.querySelector('.chapter-main-button span');
      const chars = clone.querySelector('.chapter-main-button small');
      if (title) title.textContent = `${String(index + 1).padStart(2, '0')}、測試章節`;
      if (chars) chars.textContent = `${(900 + index * 17).toLocaleString()} 字`;
      list.appendChild(clone);
    }
    const source = document.querySelector('.source-panel');
    if (source) source.scrollTop = source.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  }, total);
}

test('workspace keeps a long chapter rail contained at desktop widths', async ({ page }) => {
  await openManualWork(page);
  await addVisualChapters(page);

  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page).toHaveScreenshot(`workspace-long-${width}.png`, { fullPage: false });
  }
});

test('works, publishing, and settings retain their desktop composition', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openManualWork(page);

  await page.locator('.nav-item[data-view="projects"]').click();
  await expect(page.locator('#projectsView')).toHaveScreenshot('works-library-1440.png');

  await page.locator('.nav-item[data-view="workspace"]').click();
  await page.locator('#confirmBtn').click();
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('#publishingView')).toHaveScreenshot('publishing-queue-1440.png');

  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.locator('#settingsView')).toHaveScreenshot('settings-1440.png');
});

