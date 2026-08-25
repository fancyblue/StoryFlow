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
  await expect(page.locator('script[data-storyflow-owner]')).toHaveCount(49);

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

  const longChapterRail = await page.evaluate(() => {
    const list = document.getElementById('chapterList');
    const source = document.querySelector('.source-panel');
    const row = list?.querySelector('.chapter-row');
    if (!list || !source || !row) return null;
    for (let index = 0; index < 18; index += 1) list.appendChild(row.cloneNode(true));
    return {
      overflowY: getComputedStyle(source).overflowY,
      clientHeight: source.clientHeight,
      scrollHeight: source.scrollHeight
    };
  });
  expect(longChapterRail).not.toBeNull();
  expect(longChapterRail.overflowY).toBe('auto');
  expect(longChapterRail.scrollHeight).toBeGreaterThan(longChapterRail.clientHeight);

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

test('source diff explains same-count text replacements', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/source-diff-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();

  await page.goto('/tests/source-diff-ui.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('內容 8,645 → 8,645 字（字數相同）')).toBeVisible();
  await page.getByText('查看實際差異').click();
  await expect(page.getByText('字數相同，但文字內容不同。')).toBeVisible();
  await expect(page.getByText(/答案在舊信裡/)).toBeVisible();
  await expect(page.getByText(/答案在新信裡/)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('source sync offers a one-time undo for the active project', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/source-sync-history-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();

  await page.goto('/');
  await page.locator('#createProjectManually').click();
  await page.evaluate(() => {
    state.projectSource = { type: 'google', docName: '測試 Google Docs' };
    const before = structuredClone(state);
    before.projectTitle = '更新前作品';
    state.projectTitle = '更新後作品';
    StoryFlowSourceSyncHistory.commit(StoryFlowSourceSyncHistory.stage(before, {
      projectId: StoryFlowProjects.activeId(),
      changes: [{ incoming: { title: '第一章' } }]
    }), { artifactPath: 'StoryFlow-test/Recovery/workspace.before-source-sync-test.json' });
    renderAll();
  });
  const undo = page.getByRole('button', { name: '復原上次來源更新', exact: true });
  await expect(undo).toBeVisible();
  await expect(page.getByText(/已建立 Recovery 安全副本/)).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await undo.click();
  await expect(page.locator('#projectTitle')).toHaveValue('更新前作品');
  await expect(undo).not.toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('project source controller compares, applies, preserves manual articles, and undoes', async ({ page }) => {
  const pageErrors = await prepare(page);
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
  await page.goto('/');

  await page.evaluate(() => {
    StoryFlowIntegrations.hasGoogleToken = () => true;
    StoryFlowIntegrations.restoreGoogleAccess = async () => true;
    sessionStorage.setItem('storyflow.google.access-token.v1', 'test-token');

    const linkedId = crypto.randomUUID();
    const manualId = crypto.randomUUID();
    state = {
      ...state,
      projectTitle: '來源同步整合測試',
      projectSource: { type: 'google', docId: 'doc-1', docName: '測試來源文件' },
      sourceScopes: [{
        docId: 'doc-1', docName: '測試來源文件',
        docUrl: 'https://docs.google.com/document/d/doc-1/edit',
        tabId: 'tab-1', tabTitle: '本文'
      }],
      chapters: [
        {
          id: linkedId, title: '第一章', draft: '舊狗', confirmedBlockCount: 0, parts: [],
          source: {
            id: 'doc-1', name: '測試來源文件',
            url: 'https://docs.google.com/document/d/doc-1/edit',
            tabId: 'tab-1', tabTitle: '本文', headingOrdinal: 0, headingTitle: '第一章'
          }
        },
        { id: manualId, title: '手動番外', draft: '手動保留內容', confirmedBlockCount: 0, parts: [], source: null }
      ],
      activeChapterId: linkedId
    };
    renderAll();
    StoryFlowProjectSourceSync.syncUi();
  });

  await page.getByRole('button', { name: '更新作品來源', exact: true }).click();
  const dialog = page.locator('#projectSourceDiffDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1 個缺少章節');
  await expect(dialog).toContainText('1 個內容更新');
  await expect(dialog).toContainText('1 篇手動文章保留');
  await expect(dialog).toContainText('內容 2 → 2 字（字數相同）');

  await dialog.getByRole('button', { name: '套用所選 2 項變更', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => state.chapters.map(chapter => ({
    title: chapter.title,
    draft: chapter.draft,
    sourceId: chapter.source?.id || null
  })))).toEqual([
    { title: '第一章', draft: '新貓', sourceId: 'doc-1' },
    { title: '第二章', draft: '新增段落', sourceId: 'doc-1' },
    { title: '手動番外', draft: '手動保留內容', sourceId: null }
  ]);

  const undo = page.getByRole('button', { name: '復原上次來源更新', exact: true });
  await expect(undo).toBeVisible();
  page.once('dialog', confirmation => confirmation.accept());
  await undo.click();
  await expect.poll(() => page.evaluate(() => state.chapters.map(chapter => ({
    title: chapter.title,
    draft: chapter.draft,
    sourceId: chapter.source?.id || null
  })))).toEqual([
    { title: '第一章', draft: '舊狗', sourceId: 'doc-1' },
    { title: '手動番外', draft: '手動保留內容', sourceId: null }
  ]);
  await expect(undo).not.toBeVisible();
  expect(pageErrors).toEqual([]);
});
