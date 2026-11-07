import { expect, test } from '@playwright/test';
import { standInForConnectedFolder } from './support/folder.js';
import { standInForDrivePhotos } from './support/drive-photos.js';

const visualCss = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  /* .visual-autosave-status prints a wall clock ("已儲存 10:57"). A baseline that carries the
     time of day diffs against itself on the next run, so it is hidden for the same reason
     .save-state already is. */
  .storyflow-toast-stack, .save-state, .visual-autosave-status { visibility: hidden !important; }
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
  await standInForConnectedFolder(page);
  await page.goto('/?layout-regression=1');
  await page.addStyleTag({ content: visualCss });
  await page.evaluate(() => {
    window.StoryFlowIntegrations.saveWorkspace = async () => 'StoryFlow-test/workspace.json';
    window.StoryFlowIntegrations.saveVisualEntry = async payload =>
      'StoryFlow-test/Works/' + payload.projectTitle + '/Visual/' + payload.entry.id;
  });
  // A visual work created directly with one article; visual.spec.js covers creating one
  // through the type chooser.
  await page.evaluate(() => {
    const now = new Date().toISOString();
    StoryFlowProjects.createProject({
      title: '版面測試圖文集', contentMode: 'visual',
      visualEntry: {
        id: crypto.randomUUID(), title: '月下預告', body: '月光落在城牆上。\n\n第二段圖文內容。',
        summary: '版面測試摘要', hashtags: '#StoryFlow #圖文', tags: ['StoryFlow', '圖文'],
        afterword: '版面測試後記。', images: [], coverImageId: '', platformTitles: {},
        platformStatus: {}, publicationRecords: {}, createdAt: now, updatedAt: now
      }
    }, { quiet: true });
    renderAll();
  });
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect(page.locator('#visualWorkspace')).toBeVisible();
}

async function openManualWork(page) {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/?visual-regression=1');
  await page.addStyleTag({ content: visualCss });
  // Works is the landing page; these helpers are about the workbench. The click starts a
  // smooth window.scrollTo, so wait for the page to come to rest before measuring anything.
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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
      // The row being cloned is the active one. Carrying `active` onto every clone used to
      // cost nothing, because the state was a slightly different fill; now it is an accent
      // marker down the left edge, and a rail where all eighteen chapters are selected is
      // not a state the app can reach — so the baseline would no longer be a reference.
      clone.classList.remove('active');
      clone.querySelector('.chapter-main-button')?.classList.remove('active');
      const title = clone.querySelector('.chapter-main-button .chapter-name');
      const chars = clone.querySelector('.chapter-main-button small');
      if (title) title.textContent = '測試章節';
      const number = clone.querySelector('.chapter-main-button .chapter-no');
      if (number) number.textContent = String(index + 1).padStart(2, '0');
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

    // The workspace is the densest composition in the app and the one most likely to
    // shift when a shared layer changes, so each width keeps an intentional baseline
    // rather than geometry assertions alone.
    await expect(page.locator('#workspaceView')).toHaveScreenshot(`workspace-long-${width}.png`);
  }
});

test('the reading surface keeps one column across both of its views', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openManualWork(page);
  await page.evaluate(() => {
    const chapter = activeChapter();
    chapter.draft = Array.from({ length: 14 }, (_, index) =>
      `第 ${index + 1} 段，鐘聲停下後長廊只剩窗外落雨的聲音，她攤開掌心看著淡銀色的印紋沿指節亮起。`
    ).join('\n');
    chapter.confirmedBlockCount = 0;
    chapter.parts = [];
    renderAll();
    suggestNextPart();
    StoryFlowSetSuggestionEnd(7);
  });

  await page.locator('#openReadingViewBtn').click();
  const view = page.locator('#readingView');
  await expect(view).toBeVisible();
  await expectDocumentBounded(page);

  // Head, hint, text and actions are one column with one left edge. A shared layer that
  // re-breaks that alignment is exactly what this baseline is here to catch.
  const edges = await view.evaluate(node => [
    '.reading-view-head', '#readingFlow', '.reading-view-actions'
  ].map(selector => Math.round(node.querySelector(selector).getBoundingClientRect().left)));
  expect(new Set(edges).size).toBe(1);

  await expect(view).toHaveScreenshot('reading-view-read-1440.png');

  await view.getByRole('button', { name: '接縫', exact: true }).click();
  await expect(view).toHaveAttribute('data-view', 'seam');
  await expect(view.locator('.manual-boundary-target')).toHaveCount(14);
  await expectDocumentBounded(page);
  await expect(view).toHaveScreenshot('reading-view-seam-1440.png');
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

  // The queue only shows a row's collapsed summary. The two-column lightbox behind 管理發布 is
  // where most publishing CSS actually renders, so it needs baselines of its own before any
  // stylesheet refactor can claim "the pixels did not move" — one for the default output and
  // one for a platform's version, because the left column changes shape between them.
  const publishRow = page.locator('.publish-list-item').first();
  await publishRow.getByRole('button', { name: /展開.*發布平台/ }).click();
  await expect(publishRow.locator('.publish-platform-row').first()).toBeVisible();
  await expectDocumentBounded(page);
  await expectHorizontallyBounded(publishRow.locator('.publish-platform-details'));
  await expect(page.locator('#publishingView')).toHaveScreenshot('publishing-detail-1440.png');

  const desktopPreview = publishRow.locator('.publish-preview-panel');
  await expect(desktopPreview).toBeVisible();
  await expectHorizontallyBounded(desktopPreview);
  await expect(desktopPreview).toHaveScreenshot('platform-preview-1440.png');

  await publishRow.locator('.publish-platform-row:not([data-platform=""]) .publish-platform-choose')
    .first().click();
  await expect(publishRow.locator('#platformPreviewSettings')).toBeVisible();
  await expectHorizontallyBounded(desktopPreview);
  await expectVisibleChildrenSeparated(desktopPreview.locator('.platform-preview-actions'));
  await expect(desktopPreview).toHaveScreenshot('platform-preview-platform-1440.png');
  await publishRow.getByRole('button', { name: '關閉', exact: true }).click();

  await page.locator('#sidebarSettingsBtn').click();
  await expectDocumentBounded(page);
  await expectHorizontallyBounded(page.locator('#settingsDialog'));
  await expect(page).toHaveScreenshot('settings-1440.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.05
  });
});


test('the visual workspace, works actions, publishing actions, and previews stay contained', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openVisualWork(page);

  for (const size of layoutViewports) {
    await page.setViewportSize(size);
    await page.locator('.nav-item[data-view="workspace"]').click();
    await expect(page.locator('#visualWorkspace')).toBeVisible();
    await expect(page.locator('.workspace-grid.workspace-hierarchy')).toBeHidden();
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
    // The current article is the paper fill both rails use, lighter than hover.
    await expect(page.locator('.visual-entry-row.active')).toHaveCSS('background-color', 'rgb(251, 250, 246)');

    await page.locator('.nav-item[data-view="projects"]').click();
    await expectDocumentBounded(page);
    await expectHorizontallyBounded(page.locator('.project-library-card'));
    await expectVisibleChildrenSeparated(page.locator('.project-library-actions'));
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expectDocumentBounded(page);
  await expectHorizontallyBounded(page.locator('#visualWorkspace'));

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expectDocumentBounded(page);
  const publishCard = page.locator('.publish-list-item', { hasText: '月下預告' });
  await expectHorizontallyBounded(publishCard);
  await expectHorizontallyBounded(publishCard.locator('.publish-list-actions'));
  await expectVisibleChildrenSeparated(publishCard.locator('.publish-list-actions'));
  await publishCard.getByRole('button', { name: '預覽「月下預告」', exact: true }).click();
  const publishingPreview = publishCard.locator('.publish-preview-panel');
  await expect(publishingPreview).toBeVisible();
  await expectHorizontallyBounded(publishingPreview);
  await expectVisibleChildrenSeparated(publishingPreview.locator('.platform-preview-actions'));
});

// The dialogs and the backup center had no baselines: a stylesheet change that moved them
// could only be caught by looking. Each is captured where the app opens it, with the clock
// fixed so a date default (the publication record) does not differ between runs.
async function openFixedWorkbench(page) {
  await page.clock.setFixedTime(new Date('2026-01-05T09:30:00+08:00'));
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/?visual-regression=1');
  await page.addStyleTag({ content: visualCss });
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

// Dates on these surfaces print in the browser's time zone; fixing it keeps a baseline made
// in one place valid in another.
test.describe('dialogs and the backup center', () => {
test.use({ timezoneId: 'Asia/Taipei' });

test('creation, editing and publishing dialogs keep their composition', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFixedWorkbench(page);

  await page.locator('#createProjectManually').click();
  const typeDialog = page.getByRole('dialog', { name: '選擇作品類型' });
  await expect(typeDialog).toBeVisible();
  await expectDialogContained(typeDialog);
  await expect(typeDialog).toHaveScreenshot('dialog-work-type-1440.png');

  await typeDialog.locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('視覺測試');
  await page.locator('#manualSourceTitle').fill('08、印紋');
  await page.locator('#manualSourceText').fill([
    '鐘聲停下後，長廊只剩窗外落雨的聲音。',
    '她攤開掌心，淡銀色的印紋沿著指節亮起。',
    '門後沒有回答，只有另一道光在黑暗裡呼應。'
  ].join('\n\n'));
  const manualDialog = page.locator('#manualSourceDialog');
  await expect(manualDialog).toBeVisible();
  await expect(manualDialog).toHaveScreenshot('dialog-manual-work-1440.png');

  await page.locator('#previewManualSourceBtn').click();
  const previewDialog = page.locator('#sourcePreviewDialog');
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog).toHaveScreenshot('dialog-source-preview-1440.png');
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  await page.evaluate(() => {
    window.StoryFlowIntegrations.savePart = async () => 'Works/視覺測試/08、印紋/08、印紋（1）.md';
  });

  await page.locator('#chapterList .chapter-more-button').first().click();
  await page.getByRole('menuitem', { name: /編輯章節/ }).click();
  await expect(manualDialog).toBeVisible();
  await expect(manualDialog).toHaveScreenshot('dialog-edit-chapter-1440.png');
  await page.locator('#cancelManualChapterEditBtn').click();
  await expect(manualDialog).toBeHidden();

  await page.locator('#confirmBtn').click();
  await page.locator('.nav-item[data-view="publishing"]').click();
  await page.locator('.publish-list-item .publish-manage-btn').first().click();
  const lightbox = page.locator('.publish-lightbox:not([hidden])');
  await expect(lightbox).toBeVisible();

  await lightbox.getByRole('button', { name: /^摘要與 Hashtags/ }).click();
  const helperDialog = page.getByRole('dialog', { name: '摘要與 Hashtags' });
  await expect(helperDialog).toBeVisible();
  await expect(helperDialog).toHaveScreenshot('dialog-summary-hashtags-1440.png');
  await helperDialog.getByRole('button', { name: '完成' }).click();
  await expect(helperDialog).toBeHidden();

  await lightbox.getByRole('button', { name: /^後記/ }).click();
  const afterwordDialog = page.getByRole('dialog', { name: '後記' });
  await expect(afterwordDialog).toBeVisible();
  await expect(afterwordDialog).toHaveScreenshot('dialog-afterword-1440.png');
  await afterwordDialog.getByRole('button', { name: '完成' }).click();
  await expect(afterwordDialog).toBeHidden();

  await lightbox.locator('.publish-platform-row:not(.is-default-output) .publish-platform-choose').first().click();
  await lightbox.locator('#platformPreviewRecordBtn').click();
  const recordDialog = page.locator('#publicationRecordDialog');
  await expect(recordDialog).toBeVisible();
  await expect(recordDialog).toHaveScreenshot('dialog-publication-record-1440.png');
});

test('the backup center keeps its composition below the settings fold', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFixedWorkbench(page);
  // The connected state is the one with content to keep in place. Its figures come from the
  // folder, so they are stood in for with the same ones tests/backup-center-ui.html uses.
  await page.evaluate(() => {
    StoryFlowIntegrations.inspectWorkspaceStorage = async () => ({
      connected: true,
      folderName: 'StoryFlow-test',
      primary: { valid: true, updatedAt: '2026-01-05T01:00:00.000Z', projectCount: 2, chapterCount: 8, partCount: 3 },
      backup: { valid: true, createdAt: '2026-01-05T00:30:00.000Z', projectCount: 2, chapterCount: 7, partCount: 3 },
      recoveryArtifacts: [{ name: 'workspace.before-import-2026-01-05.json', lastModified: Date.parse('2026-01-05T00:10:00.000Z') }],
      storageUsage: {
        olderThanDays: 30,
        workspaceScanAvailable: true,
        categories: {
          recoverySnapshots: { fileCount: 4, bytes: 18432, candidateCount: 1, candidateBytes: 4096 },
          recoveryImages: { fileCount: 3, bytes: 5242880, candidateCount: 1, candidateBytes: 1048576 },
          orphanedImages: { fileCount: 5, bytes: 7340032, candidateCount: 2, candidateBytes: 2097152 }
        },
        cleanupPreview: { fileCount: 4, bytes: 3149824, groupCount: 3 }
      }
    });
  });
  await page.locator('#sidebarSettingsBtn').click();
  const backup = page.locator('#settingsBackupCenter');
  await expect(backup).toBeVisible();
  await backup.getByRole('button', { name: '重新檢查', exact: true }).click();
  await expect(backup.getByText('2 部作品 · 8 個章節 · 3 篇發布稿')).toBeVisible();
  await backup.scrollIntoViewIfNeeded();
  await expectHorizontallyBounded(backup);
  await expect(backup).toHaveScreenshot('settings-backup-center-1440.png');
});

test('the source comparison dialog keeps its composition', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://docs.googleapis.com/v1/documents/doc-1?includeTabsContent=true', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      title: '測試來源文件',
      tabs: [{
        tabProperties: { tabId: 'tab-1', title: '本文', index: 0 },
        documentTab: {
          body: {
            content: [
              { paragraph: { paragraphStyle: { namedStyleType: 'HEADING_1' }, elements: [{ textRun: { content: '第一章\n', textStyle: {} } }] } },
              { paragraph: { paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, elements: [{ textRun: { content: '新貓\n', textStyle: {} } }] } },
              { paragraph: { paragraphStyle: { namedStyleType: 'HEADING_1' }, elements: [{ textRun: { content: '第二章\n', textStyle: {} } }] } },
              { paragraph: { paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, elements: [{ textRun: { content: '新增段落\n', textStyle: {} } }] } }
            ]
          },
          inlineObjects: {}
        }
      }]
    })
  }));
  await openFixedWorkbench(page);
  await page.evaluate(() => {
    StoryFlowIntegrations.hasGoogleToken = () => true;
    StoryFlowIntegrations.restoreGoogleAccess = async () => true;
    sessionStorage.setItem('storyflow.google.access-token.v1', 'test-token');
    StoryFlowProjects.createProject({ title: '來源比對視覺測試' }, { quiet: true });
    const linkedId = 'visual-source-linked';
    state = {
      ...state,
      projectSource: { type: 'google', docId: 'doc-1', docName: '測試來源文件' },
      sourceScopes: [{ docId: 'doc-1', docName: '測試來源文件', docUrl: 'https://docs.google.com/document/d/doc-1/edit', tabId: 'tab-1', tabTitle: '本文' }],
      chapters: [
        { id: linkedId, title: '第一章', draft: '舊狗', confirmedBlockCount: 0, parts: [], source: { id: 'doc-1', name: '測試來源文件', url: 'https://docs.google.com/document/d/doc-1/edit', tabId: 'tab-1', tabTitle: '本文', headingOrdinal: 0, headingTitle: '第一章' } },
        { id: 'visual-source-manual', title: '手動番外', draft: '手動保留內容', confirmedBlockCount: 0, parts: [], source: null }
      ],
      activeChapterId: linkedId
    };
    renderAll();
    StoryFlowProjectSourceSync.syncUi();
  });
  await page.getByRole('button', { name: '更新作品來源', exact: true }).click();
  const dialog = page.locator('#projectSourceDiffDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1 個內容更新');
  await expect(dialog).toHaveScreenshot('dialog-source-comparison-1440.png');
});
});

// The visual works' dialogs and the phone layout were the last surfaces without a baseline.
test.describe('visual dialogs and the phone layout', () => {
test.use({ timezoneId: 'Asia/Taipei' });

const DRIVE_FOLDERS = {
  root: [{ id: 'trip', name: '北海道', mimeType: 'application/vnd.google-apps.folder' },
    { id: 'tokyo', name: '東京', mimeType: 'application/vnd.google-apps.folder' }],
  trip: [
    { id: 'p-1', name: 'IMG_0001.jpg', mimeType: 'image/jpeg', imageMediaMetadata: { time: '2023:02:18 09:00:00' } },
    { id: 'p-2', name: 'IMG_0002.jpg', mimeType: 'image/jpeg', imageMediaMetadata: { time: '2023:02:18 10:00:00' } },
    { id: 'day-2', name: 'Day 2', mimeType: 'application/vnd.google-apps.folder' }
  ],
  'day-2': [],
  tokyo: []
};

// Drive and Google sign-in stood in for as visual.spec.js does for the folder browser.
async function standInForDriveFolders(page) {
  await page.route('https://www.googleapis.com/drive/v3/files?**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    let files = parent ? (DRIVE_FOLDERS[parent] || []) : [];
    if (q.includes(`mimeType = 'application/vnd.google-apps.folder' and trashed = false`) && !q.includes('contains')) {
      files = files.filter(file => file.mimeType.endsWith('folder'));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
  });
  await page.evaluate(() => {
    window.STORYFLOW_CONFIG.googleClientId ||= 'test-client.apps.googleusercontent.com';
    window.google = { accounts: { oauth2: { initTokenClient: config => ({
      callback: config.callback,
      requestAccessToken() { this.callback({ access_token: 'visual-regression-token' }); }
    }) } } };
  });
}

test('visual works dialogs keep their composition', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date('2026-01-05T09:30:00+08:00'));
  await openVisualWork(page);
  await standInForDrivePhotos(page);
  await standInForDriveFolders(page);

  await page.locator('#visualNewEntryBtn').click();
  const entryDialog = page.locator('#visualEntryDialog');
  await expect(entryDialog).toBeVisible();
  await expectDialogContained(entryDialog);
  await expect(entryDialog).toHaveScreenshot('dialog-visual-new-entry-1440.png');
  await page.keyboard.press('Escape');
  await expect(entryDialog).toBeHidden();

  await page.locator('#visualAddPhotosBtn').click();
  await expect(page.locator('.visual-photo-tile')).toHaveCount(3);
  await page.locator('.visual-photo-tile .visual-photo-zoom').first().click({ force: true });
  const photoDialog = page.locator('#visualPhotoDialog');
  await expect(photoDialog).toBeVisible();
  await expect.poll(() => photoDialog.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(photoDialog).toHaveScreenshot('dialog-visual-photo-1440.png');
  await page.keyboard.press('Escape');
  await expect(photoDialog).toBeHidden();

  await page.locator('#visualChooseFolderBtn').click();
  const folderDialog = page.locator('#visualFolderDialog');
  await expect(folderDialog.locator('.visual-folder-row')).toHaveText(['北海道›', '東京›']);
  await expect(folderDialog).toHaveScreenshot('dialog-visual-folder-1440.png');
});

test.describe('on a phone', () => {
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// A phone starts read-only, so the works are written in directly rather than created.
async function openPhone(page) {
  await page.clock.setFixedTime(new Date('2026-01-05T09:30:00+08:00'));
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/?visual-regression=1');
  await page.addStyleTag({ content: visualCss });
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '手機版面測試' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '08、印紋';
    chapter.draft = '鐘聲停下後，長廊只剩窗外落雨的聲音。\n\n她攤開掌心，淡銀色的印紋沿著指節亮起。\n\n門後沒有回答。';
    chapter.confirmedBlockCount = 2;
    chapter.parts = [1, 2].map(index => ({
      id: `phone-part-${index}`, title: `08、印紋（${index}）`, chars: 18, startBlock: index - 1, endBlock: index,
      raw: '鐘聲停下後，長廊只剩窗外落雨的聲音。', formatted: '鐘聲停下後，長廊只剩窗外落雨的聲音。',
      summary: '', hashtags: '', afterword: '', images: [], published: false, platformStatus: { 方格子: index === 1 }
    }));
    renderAll();
  });
}

test('works, workspace and publishing keep their phone composition', async ({ page }) => {
  await openPhone(page);
  await expectDocumentBounded(page);
  await expect(page).toHaveScreenshot('phone-works-390.png');

  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expectDocumentBounded(page);
  await expect(page).toHaveScreenshot('phone-workspace-390.png');

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expectDocumentBounded(page);
  await expect(page).toHaveScreenshot('phone-publishing-390.png');

  await page.locator('.publish-list-item .publish-manage-btn').first().click();
  await expect(page.locator('.publish-lightbox:not([hidden])')).toBeVisible();
  await expectDocumentBounded(page);
  await expect(page).toHaveScreenshot('phone-publishing-lightbox-390.png');
});
});
});
