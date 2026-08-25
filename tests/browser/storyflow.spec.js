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
  await expect(page.locator('#manualSourceDialog')).toBeVisible();
  await page.locator('#manualProjectTitle').fill('自動測試作品');
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
  await expect(page.locator('#projectsLibrary')).toContainText('自動測試作品');

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.getByRole('heading', { name: '發布', exact: true })).toBeVisible();
  await expect(page.locator('#publishingView')).toBeVisible();

  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
  await expect(page.getByText('備份與復原')).toBeVisible();
  await expect(page.getByRole('button', { name: '離開此裝置', exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('canceling a new manual work does not create an empty project', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');

  await page.locator('#createProjectManually').click();
  await page.locator('#manualProjectTitle').fill('原作品');
  await page.locator('#manualSourceTitle').fill('第一章');
  await page.locator('#manualSourceText').fill('原作品的第一段內容。');
  await page.locator('#confirmManualSourceBtn').click();

  await expect(page.locator('#projectTitle')).toHaveValue('原作品');
  const original = await page.evaluate(() => ({
    activeId: StoryFlowProjects.activeId(),
    count: StoryFlowProjects.list().length
  }));

  const switchButton = page.locator('#quickSwitchProjectBtn');
  const closedTransform = await switchButton.locator('.sf-chevron').evaluate(element => getComputedStyle(element).transform);
  await switchButton.click();
  await expect(switchButton).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(200);
  const openTransform = await switchButton.locator('.sf-chevron').evaluate(element => getComputedStyle(element).transform);
  expect(openTransform).not.toBe(closedTransform);

  await page.locator('#workspaceQuickNewProject').click();
  await page.locator('#sourceManualBtn').click();
  await expect(page.locator('#manualProjectTitleField')).toBeVisible();
  await page.locator('#closeManualSourceDialog').click();

  const afterCancel = await page.evaluate(() => ({
    activeId: StoryFlowProjects.activeId(),
    count: StoryFlowProjects.list().length,
    pending: StoryFlowNewWorkFlow.isPending()
  }));
  expect(afterCancel).toEqual({ ...original, pending: false });
  await expect(page.locator('#projectTitle')).toHaveValue('原作品');

  await switchButton.click();
  await page.locator('#workspaceQuickNewProject').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('第二作品');
  await page.locator('#manualSourceTitle').fill('新章節');
  await page.locator('#manualSourceText').fill('第二作品的內容。');
  await page.locator('#confirmManualSourceBtn').click();

  const afterConfirm = await page.evaluate(() => ({
    count: StoryFlowProjects.list().length,
    pending: StoryFlowNewWorkFlow.isPending()
  }));
  expect(afterConfirm).toEqual({ count: original.count + 1, pending: false });
  await expect(page.locator('#projectTitle')).toHaveValue('第二作品');

  const preferences = page.locator('#splitPreferencesToggle');
  await expect(preferences.locator('.sf-chevron')).toHaveCount(1);
  await preferences.click();
  await expect(preferences).toHaveAttribute('aria-expanded', 'true');
  await preferences.click();
  await expect(preferences).toHaveAttribute('aria-expanded', 'false');

  await page.locator('.nav-item[data-view="publishing"]').click();
  const publishingSwitch = page.locator('#publishingProjectSwitchBtn');
  const publishingFilter = page.locator('#publishingProjectFilterBtn');
  await expect(publishingSwitch.locator('.sf-chevron')).toHaveCount(1);
  await expect(publishingFilter.locator('.sf-chevron')).toHaveCount(1);
  await expect(publishingSwitch).not.toContainText(/[⌄⌃▾▴]/);
  await expect(publishingFilter).not.toContainText(/[⌄⌃▾▴]/);
  expect(pageErrors).toEqual([]);
});

test('workspace safety fixtures pass without a real folder', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/workspace-safety-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();

  await page.goto('/tests/destructive-action-guard-core.html');
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
    try { await StoryFlowIntegrations.saveWorkspace({ state: {} }); }
    catch (error) { workspaceError = error.code; }
    return { saveStateResult, workspaceError, calls: { ...fixtureCalls } };
  });
  expect(blocked.saveStateResult).toBe(false);
  expect(blocked.workspaceError).toBe('MOBILE_READ_ONLY');
  expect(blocked.calls.saveState).toBe(0);
  expect(blocked.calls.workspace).toBe(0);

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
    return { saveStateResult, workspacePath, calls: { ...fixtureCalls } };
  });
  expect(enabled.saveStateResult).toBe(true);
  expect(enabled.workspacePath).toBe('workspace.json');
  expect(enabled.calls.rehydrate).toBe(1);
  expect(enabled.calls.saveState).toBe(1);
  expect(enabled.calls.workspace).toBe(1);

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
  expect(await page.evaluate(() => fixtureLastNotify)).toContain('無法從資料夾重新載入');
  await expect(page.locator('#projectTitle')).toHaveJSProperty('readOnly', true);
  expect(await page.evaluate(() => fixtureCalls.rehydrate)).toBe(1);
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
  expect(await page.evaluate(() => fixtureLastNotify)).toContain('尚未切回唯讀');
  expect(await page.evaluate(() => fixtureCalls.flush)).toBe(1);
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

test('publishing treats an empty project selection as all and keeps the continue action grouped', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '發布篩選測試' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '測試章節';
    chapter.draft = '測試內容';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'publishing-filter-part',
      title: '測試發布文章',
      chars: 4,
      startBlock: 0,
      endBlock: 1,
      formatted: '測試內容',
      platformStatus: {}
    }];
    renderAll();
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.getByText('測試發布文章')).toBeVisible();
  await page.locator('#publishingProjectFilterBtn').click();
  const checkbox = page.locator('.publishing-project-filter-option input').first();
  await expect(checkbox).toBeChecked();
  await checkbox.click({ noWaitAfter: true });

  await expect(page.locator('#publishingProjectFilterSummary')).toHaveText('全部');
  await expect(page.locator('.publishing-project-filter-option input').first()).toBeChecked();
  await expect(page.getByText('測試發布文章')).toBeVisible();
  await expect(page.getByText('尚未選擇作品')).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const toolbar = document.querySelector('.publishing-toolbar')?.getBoundingClientRect();
    const stack = document.querySelector('.publishing-filter-stack')?.getBoundingClientRect();
    const actions = document.querySelector('.publishing-toolbar-actions')?.getBoundingClientRect();
    const button = document.getElementById('continuePublishingBtn')?.getBoundingClientRect();
    const hint = document.querySelector('.publishing-toolbar-hint')?.getBoundingClientRect();
    if (!toolbar || !stack || !actions || !button || !hint) return null;
    return {
      actionsAfterFilters: actions.left >= stack.right,
      buttonAtRightEdge: Math.round(Math.abs(toolbar.right - button.right)),
      hintBeforeButton: hint.right <= button.left,
      buttonHintGap: Math.round(button.left - hint.right),
      verticalDelta: Math.round(Math.abs((button.top + button.height / 2) - (hint.top + hint.height / 2)))
    };
  });
  expect(layout).not.toBeNull();
  expect(layout.actionsAfterFilters).toBe(true);
  expect(layout.buttonAtRightEdge).toBeLessThanOrEqual(2);
  expect(layout.hintBeforeButton).toBe(true);
  expect(layout.buttonHintGap).toBeLessThanOrEqual(12);
  expect(layout.verticalDelta).toBeLessThanOrEqual(2);
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
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '更新後作品' }, { quiet: true });
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
