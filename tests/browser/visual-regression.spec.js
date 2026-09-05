import { expect, test } from '@playwright/test';

const visualCss = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  .storyflow-toast-stack, .save-state { visibility: hidden !important; }
`;

const layoutViewports = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

async function expectDocumentBounded(page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function expectHorizontallyBounded(locator) {
  const metrics = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewportWidth: innerWidth };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function expectVisibleChildrenSeparated(locator, selector = ':scope > button') {
  const result = await locator.evaluate((element, childSelector) => {
    const root = element.getBoundingClientRect();
    const children = [...element.querySelectorAll(childSelector)]
      .filter(child => {
        const style = getComputedStyle(child);
        const rect = child.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map(child => {
        const rect = child.getBoundingClientRect();
        return {
          label: child.getAttribute('aria-label') || child.textContent.trim(),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        };
      });
    const outside = children
      .filter(child => child.left < root.left - 1 || child.right > root.right + 1
        || child.top < root.top - 1 || child.bottom > root.bottom + 1)
      .map(child => child.label);
    const overlaps = [];
    for (let index = 0; index < children.length; index += 1) {
      for (let other = index + 1; other < children.length; other += 1) {
        const overlapX = Math.min(children[index].right, children[other].right)
          - Math.max(children[index].left, children[other].left);
        const overlapY = Math.min(children[index].bottom, children[other].bottom)
          - Math.max(children[index].top, children[other].top);
        if (overlapX > 1 && overlapY > 1) overlaps.push([children[index].label, children[other].label]);
      }
    }
    return { outside, overlaps };
  }, selector);
  expect(result.outside).toEqual([]);
  expect(result.overlaps).toEqual([]);
}

async function expectDialogContained(dialog) {
  const metrics = await dialog.locator('.dialog-card').evaluate(card => {
    const rect = card.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
}

async function openVisualWork(page) {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await page.goto('/?layout-regression=1');
  await page.addStyleTag({ content: visualCss });
  await page.evaluate(() => {
    window.StoryFlowIntegrations.saveWorkspace = async () => 'StoryFlow-test/workspace.json';
    window.StoryFlowIntegrations.saveVisualEntry = async payload =>
      'StoryFlow-test/Works/' + payload.projectTitle + '/Visual/' + payload.entry.id;
  });
  await page.locator('.nav-item[data-view="projects"]').click();
  await page.locator('.projects-empty-state .button').click();
  const typeDialog = page.locator('#visualTypeDialog');
  await typeDialog.locator('#chooseVisualType').click();
  await typeDialog.locator('#visualSeriesTitle').fill('版面測試圖文集');
  await typeDialog.locator('#visualFirstEntryTitle').fill('月下預告');
  await typeDialog.getByRole('button', { name: '建立圖文系列', exact: true }).click();
  await page.evaluate(() => {
    const entry = state.visualEntries[0];
    entry.body = '月光落在城牆上。\n\n第二段圖文內容。';
    entry.summary = '版面測試摘要';
    entry.hashtags = '#StoryFlow #圖文';
    entry.tags = ['StoryFlow', '圖文'];
    entry.afterword = '版面測試後記。';
    renderAll();
  });
  await expect(page.locator('#visualWorkspace')).toBeVisible();
}

async function openManualWork(page) {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await page.goto('/?visual-regression=1');
  await page.addStyleTag({ content: visualCss });
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('視覺測試');
  await page.locator('#manualSourceTitle').fill('08、印紋');
  await page.locator('#manualSourceText').fill([
    '鐘聲停下後，長廊只剩窗外落雨的聲音。',
    '她攤開掌心，淡銀色的印紋沿著指節亮起。',
    '門後沒有回答，只有另一道光在黑暗裡呼應。',
    '這一刻，她終於知道信裡被抹去的名字屬於誰。'
  ].join('\n\n'));
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  await page.evaluate(() => {
    window.StoryFlowIntegrations.savePart = async () => 'Works/視覺測試/08、印紋/08、印紋（1）.md';
  });
}

async function addVisualChapters(page, total = 18) {
  await expect(page.locator('#chapterList .chapter-row')).toHaveCount(1);
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
  await expect(page.locator('#chapterList .chapter-row')).toHaveCount(total);
}

test('workspace keeps a long chapter rail contained at desktop widths', async ({ page }) => {
  await openManualWork(page);
  await addVisualChapters(page);

  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const rail = await page.locator('.source-panel').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth
      };
    });
    expect(rail.left).toBeGreaterThanOrEqual(0);
    expect(rail.right).toBeLessThanOrEqual(width);
    expect(rail.scrollWidth).toBeLessThanOrEqual(rail.clientWidth + 1);
    await expectDocumentBounded(page);
    const columns = await page.locator('.workspace-grid.workspace-hierarchy').evaluate(layout => {
      const root = layout.getBoundingClientRect();
      const sourcePanel = layout.querySelector('.source-panel').getBoundingClientRect();
      const mainColumn = layout.querySelector('.workspace-main-column').getBoundingClientRect();
      return {
        sourceInside: sourcePanel.left >= root.left - 1 && sourcePanel.right <= root.right + 1,
        mainInside: mainColumn.left >= root.left - 1 && mainColumn.right <= root.right + 1,
        separated: sourcePanel.right <= mainColumn.left + 1
      };
    });
    expect(columns).toEqual({ sourceInside: true, mainInside: true, separated: true });
  }
});

test('works, publishing, and settings retain their desktop composition', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openManualWork(page);

  await page.locator('.nav-item[data-view="projects"]').click();
  await expectDocumentBounded(page);
  await expectHorizontallyBounded(page.locator('.project-library-card'));
  await expectVisibleChildrenSeparated(page.locator('.project-library-actions'));
  await expect(page.locator('#projectsView')).toHaveScreenshot('works-library-1440.png');

  await page.locator('.nav-item[data-view="workspace"]').click();
  await page.locator('#confirmBtn').click();
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expectDocumentBounded(page);
  await expectHorizontallyBounded(page.locator('.publish-list-item'));
  await expectVisibleChildrenSeparated(page.locator('.publish-list-actions'));
  await expect(page.locator('#publishingView')).toHaveScreenshot('publishing-queue-1440.png');

  await page.locator('.nav-item[data-view="settings"]').click();
  await expectDocumentBounded(page);
  await expectHorizontallyBounded(page.locator('#settingsDialog'));
  await expect(page).toHaveScreenshot('settings-1440.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.05
  });
});


test('visual workspace, works actions, publishing actions, and previews stay contained', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openVisualWork(page);

  for (const size of layoutViewports) {
    await page.setViewportSize(size);
    await page.locator('.nav-item[data-view="workspace"]').click();
    await expect(page.locator('#visualWorkspace')).toBeVisible();
    await expectDocumentBounded(page);
    const layout = await page.locator('.visual-workspace-layout').evaluate(element => {
      const root = element.getBoundingClientRect();
      const rail = element.querySelector('.visual-entry-list-panel').getBoundingClientRect();
      const editor = element.querySelector('.visual-editor-panel').getBoundingClientRect();
      return {
        railInside: rail.left >= root.left - 1 && rail.right <= root.right + 1,
        editorInside: editor.left >= root.left - 1 && editor.right <= root.right + 1,
        separated: rail.right <= editor.left + 1 || rail.bottom <= editor.top + 1
      };
    });
    expect(layout).toEqual({ railInside: true, editorInside: true, separated: true });

    await page.locator('.nav-item[data-view="projects"]').click();
    await expectDocumentBounded(page);
    await expectHorizontallyBounded(page.locator('.project-library-card'));
    await expectVisibleChildrenSeparated(page.locator('.project-library-actions'));
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expectDocumentBounded(page);
  await expectHorizontallyBounded(page.locator('.visual-workspace-layout'));
  await page.locator('#visualPreviewEntryBtn').click();
  const workspacePreview = page.locator('#visualEntryPreviewDialog');
  await expect(workspacePreview).toBeVisible();
  await expectDialogContained(workspacePreview);
  await expectVisibleChildrenSeparated(workspacePreview.locator('.visual-dialog-actions'));
  await workspacePreview.getByRole('button', { name: '關閉', exact: true }).last().click();

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expectDocumentBounded(page);
  const publishCard = page.locator('.publish-list-item', { hasText: '月下預告' });
  await expectHorizontallyBounded(publishCard);
  await expectHorizontallyBounded(publishCard.locator('.publish-list-actions'));
  await expectVisibleChildrenSeparated(publishCard.locator('.publish-list-actions'));
  await publishCard.getByRole('button', { name: '預覽「月下預告」', exact: true }).click();
  const publishingPreview = page.locator('#platformPreviewDialog');
  await expect(publishingPreview).toBeVisible();
  await expectDialogContained(publishingPreview);
  await expectVisibleChildrenSeparated(publishingPreview.locator('.platform-preview-actions'));
});
