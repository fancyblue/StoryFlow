import { expect, test } from '@playwright/test';

async function prepare(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  return pageErrors;
}

test('primary action scale and navigation icon language stay consistent', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const controlStyle = locator => locator.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      height: Math.round(rect.height),
      fontSize: parseFloat(style.fontSize),
      backgroundColor: style.backgroundColor,
      color: style.color
    };
  });

  await expect(page.locator('.nav-item .nav-icon svg')).toHaveCount(5);
  await expect(page.locator('#sidebarToggle svg')).toHaveCount(1);
  expect(await controlStyle(page.locator('#openPublishingFromWorkspace'))).toMatchObject({
    height: 40,
    fontSize: 14,
    backgroundColor: 'rgb(57, 117, 167)',
    color: 'rgb(255, 255, 255)'
  });

  await page.locator('.nav-item[data-view="projects"]').click();
  await expect(page.locator('.projects-empty-state .button')).toBeVisible();
  const newWork = await controlStyle(page.locator('#projectsNewWorkBtn'));
  const emptyWork = await controlStyle(page.locator('.projects-empty-state .button'));
  expect(emptyWork).toEqual(newWork);
  expect(emptyWork).toMatchObject({ height: 40, fontSize: 14 });

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publishing-empty .button')).toBeVisible();
  expect(await controlStyle(page.locator('.publishing-empty .button'))).toMatchObject({
    height: 40,
    fontSize: 14,
    backgroundColor: 'rgb(57, 117, 167)',
    color: 'rgb(255, 255, 255)'
  });

  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '發布按鈕樣式測試' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '樣式測試章節';
    chapter.draft = '測試正文。';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'publishing-action-style-part',
      title: '樣式測試文章',
      chars: 5,
      startBlock: 0,
      endBlock: 1,
      raw: '測試正文。',
      formatted: '測試正文。',
      published: false,
      platformStatus: {}
    }];
    renderAll();
  });
  const publishingRow = page.locator('.publish-list-item', { hasText: '樣式測試文章' });
  const rowManage = publishingRow.getByRole('button', { name: /展開.*發布平台/ });
  const rowPreview = publishingRow.getByRole('button', { name: '預覽預設設定', exact: true });
  await expect(rowManage).toBeVisible();
  const manageStyle = await controlStyle(rowManage);
  const previewStyle = await controlStyle(rowPreview);
  expect(manageStyle).toMatchObject({
    height: 40,
    fontSize: 14,
    backgroundColor: 'rgb(234, 243, 249)',
    color: 'rgb(45, 93, 133)'
  });
  expect(manageStyle.height).toBe(previewStyle.height);
  expect(manageStyle.fontSize).toBe(previewStyle.fontSize);
  expect(previewStyle.backgroundColor).toBe('rgb(255, 255, 255)');
  await rowManage.click();
  await expect(publishingRow.getByRole('button', { name: /收合.*發布平台/ })).toBeVisible();
  expect(await controlStyle(publishingRow.locator('.publish-manage-btn'))).toMatchObject({
    backgroundColor: 'rgb(57, 117, 167)',
    color: 'rgb(255, 255, 255)'
  });

  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.locator('#settingsView')).toBeVisible();
  const settingsActions = await Promise.all([
    '#savePickerKeyBtn',
    '#clearPickerKeyBtn',
    '#settingsFolderBtn'
  ].map(selector => controlStyle(page.locator(selector))));
  settingsActions.forEach(style => expect(style).toMatchObject({ height: 40, fontSize: 14 }));

  await page.locator('#sidebarToggle').click();
  await expect(page.locator('#sidebarToggle')).toHaveClass(/points-right/);
  await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded', 'false');
  expect(pageErrors).toEqual([]);
});

test('manual project can reach workspace, works, publishing, and settings', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '內容發布工作台' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-storyflow-load-error', 'true');
  await expect(page.locator('script[data-storyflow-owner]')).toHaveCount(51);

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

test('long chapter rail stays stable and manual add/edit share a large filled editor', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '長章節清單測試' }, { quiet: true });
    state.chapters = Array.from({ length: 24 }, (_, index) => ({
      id: `long-chapter-${index + 1}`,
      title: `${String(index + 1).padStart(2, '0')}、測試章節`,
      draft: `第 ${index + 1} 章內容。`,
      confirmedBlockCount: 0,
      parts: []
    }));
    state.activeChapterId = state.chapters[0].id;
    renderAll();
  });

  const panel = page.locator('.source-panel');
  await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const beforeSelect = await panel.evaluate(element => ({
    scrollTop: element.scrollTop,
    height: element.getBoundingClientRect().height,
    windowY: window.scrollY
  }));
  expect(beforeSelect.scrollTop).toBeGreaterThan(0);

  await page.locator('#chapterList .chapter-main-button').last().click();
  await expect.poll(() => page.evaluate(() => state.activeChapterId)).toBe('long-chapter-24');
  const afterSelect = await panel.evaluate(element => ({ scrollTop: element.scrollTop, windowY: window.scrollY }));
  expect(Math.abs(afterSelect.scrollTop - beforeSelect.scrollTop)).toBeLessThanOrEqual(2);
  expect(afterSelect.windowY).toBe(beforeSelect.windowY);

  await page.locator('#chapterList .chapter-more-button').last().click();
  const menu = page.locator('#chapterList .chapter-row-action-menu:not([hidden])');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveClass(/opens-up/);
  const openLayout = await page.evaluate(() => {
    const source = document.querySelector('.source-panel');
    const actionMenu = document.querySelector('#chapterList .chapter-row-action-menu:not([hidden])');
    const splitter = document.querySelector('.splitter-panel');
    const sourceRect = source.getBoundingClientRect();
    const menuRect = actionMenu.getBoundingClientRect();
    return {
      sourceHeight: sourceRect.height,
      sourceBottom: sourceRect.bottom,
      menuTop: menuRect.top,
      menuBottom: menuRect.bottom,
      splitterTop: splitter.getBoundingClientRect().top,
      viewportHeight: innerHeight,
      overflowY: getComputedStyle(source).overflowY,
      windowY: window.scrollY
    };
  });
  expect(Math.abs(openLayout.sourceHeight - beforeSelect.height)).toBeLessThanOrEqual(2);
  expect(openLayout.sourceHeight).toBeLessThanOrEqual(openLayout.viewportHeight - 40);
  expect(openLayout.menuTop).toBeGreaterThanOrEqual(0);
  expect(openLayout.menuBottom).toBeLessThanOrEqual(Math.min(openLayout.sourceBottom, openLayout.viewportHeight));
  expect(openLayout.splitterTop).toBeLessThan(openLayout.viewportHeight);
  expect(openLayout.overflowY).toBe('auto');
  expect(openLayout.windowY).toBe(beforeSelect.windowY);

  await menu.getByRole('menuitem', { name: /編輯章節/ }).click();
  await expect(page.locator('#manualSourceDialog')).toBeVisible();
  const editLayout = await page.locator('#manualSourceDialog').evaluate(dialog => {
    const card = dialog.querySelector('.source-editor-card').getBoundingClientRect();
    const actions = dialog.querySelector('.manual-source-actions').getBoundingClientRect();
    const textarea = dialog.querySelector('#manualSourceText').getBoundingClientRect();
    const rect = dialog.getBoundingClientRect();
    return {
      dialogHeight: rect.height,
      viewportHeight: innerHeight,
      cardBottom: card.bottom,
      actionsBottom: actions.bottom,
      actionsTop: actions.top,
      actionsHeight: actions.height,
      textareaBottom: textarea.bottom,
      textareaHeight: textarea.height,
      footerPosition: getComputedStyle(dialog.querySelector('.manual-source-actions')).position
    };
  });
  expect(editLayout.dialogHeight).toBeGreaterThanOrEqual(editLayout.viewportHeight * 0.85);
  expect(editLayout.cardBottom - editLayout.actionsBottom).toBeLessThanOrEqual(2);
  expect(editLayout.actionsTop - editLayout.textareaBottom).toBeLessThanOrEqual(18);
  expect(editLayout.actionsHeight).toBeLessThanOrEqual(82);
  expect(editLayout.textareaHeight).toBeGreaterThan(editLayout.dialogHeight * 0.45);
  expect(editLayout.footerPosition).toBe('static');

  await page.locator('#closeManualSourceDialog').click();
  await page.locator('#addChapterBtn').click();
  await expect(page.locator('#manualSourceDialog')).toBeVisible();
  const addLayout = await page.locator('#manualSourceDialog').evaluate(dialog => {
    const card = dialog.querySelector('.source-editor-card').getBoundingClientRect();
    const actions = dialog.querySelector('.manual-source-actions').getBoundingClientRect();
    const textarea = dialog.querySelector('#manualSourceText').getBoundingClientRect();
    const rect = dialog.getBoundingClientRect();
    return {
      dialogHeight: rect.height,
      cardBottom: card.bottom,
      actionsBottom: actions.bottom,
      actionsTop: actions.top,
      textareaBottom: textarea.bottom,
      textareaHeight: textarea.height
    };
  });
  expect(Math.abs(addLayout.dialogHeight - editLayout.dialogHeight)).toBeLessThanOrEqual(2);
  expect(addLayout.cardBottom - addLayout.actionsBottom).toBeLessThanOrEqual(2);
  expect(addLayout.actionsTop - addLayout.textareaBottom).toBeLessThanOrEqual(18);
  expect(addLayout.textareaHeight).toBeGreaterThan(addLayout.dialogHeight * 0.45);

  await page.locator('#closeManualSourceDialog').click();
  await page.locator('.nav-item[data-view="projects"]').click();
  const manageChapters = page.getByRole('button', { name: '管理章節', exact: true });
  const managePublishing = page.getByRole('button', { name: '管理發布', exact: true });
  await expect(manageChapters).toBeVisible();
  await expect(managePublishing).toBeVisible();
  const managementStyles = await page.evaluate(() => {
    const values = element => {
      const style = getComputedStyle(element);
      return {
        height: style.height,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight
      };
    };
    return {
      open: values(document.querySelector('.project-open-btn')),
      chapters: values(document.querySelector('.project-manage-chapters-btn')),
      publishing: values(document.querySelector('.project-publish-btn'))
    };
  });
  expect(managementStyles.chapters).toEqual(managementStyles.publishing);
  expect(managementStyles.chapters.height).toBe('40px');
  expect(managementStyles.chapters.fontSize).toBe('14px');
  expect(managementStyles.chapters.backgroundColor).toBe('rgb(234, 243, 249)');
  expect(managementStyles.chapters.color).toBe('rgb(45, 93, 133)');
  expect(managementStyles.open.height).toBe(managementStyles.chapters.height);
  expect(managementStyles.open.fontSize).toBe(managementStyles.chapters.fontSize);
  expect(managementStyles.open.fontWeight).toBe(managementStyles.chapters.fontWeight);

  const newWorkStyle = await page.locator('#projectsNewWorkBtn').evaluate(button => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return { height: rect.height, width: rect.width, fontSize: parseFloat(style.fontSize) };
  });
  expect(newWorkStyle.height).toBeLessThanOrEqual(42);
  expect(newWorkStyle.fontSize).toBeGreaterThanOrEqual(14);
  expect(newWorkStyle.width / newWorkStyle.height).toBeLessThan(3.2);
  expect(pageErrors).toEqual([]);
});

test('compact paragraph output preserves original scene boundaries', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  const output = await page.evaluate(() => ({
    visibleMarker: webFormat('第一場最後一段。\n\n第二場第一段。', {
      indent: 'none', paragraphSpacing: false, sceneSeparator: true, marker: '＊＊＊'
    }),
    hiddenMarker: webFormat('第一場最後一段。\n\n第二場第一段。', {
      indent: 'none', paragraphSpacing: false, sceneSeparator: false, marker: '＊＊＊'
    }),
    normalParagraphs: webFormat('一般第一段。\n一般第二段。', {
      indent: 'none', paragraphSpacing: false, sceneSeparator: false, marker: '＊＊＊'
    })
  }));
  expect(output.visibleMarker).toBe('第一場最後一段。\n＊＊＊\n第二場第一段。');
  expect(output.hiddenMarker).toBe('第一場最後一段。\n\n第二場第一段。');
  expect(output.normalParagraphs).toBe('一般第一段。\n一般第二段。');
  expect(pageErrors).toEqual([]);
});

test('split confirmation can move an unconfirmed ending between paragraphs without changing the source', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const originalDraft = Array.from({ length: 18 }, (_, index) =>
    `第 ${index + 1} 段，這是一個沒有空白場景分隔的長場景內容，用來確認大量段落仍能快速瀏覽。`
  ).join('\n');

  await page.evaluate(draft => {
    StoryFlowProjects.createProject({ title: '手動切點測試' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '六千字長場景';
    chapter.draft = draft;
    chapter.confirmedBlockCount = 0;
    chapter.parts = [];
    renderAll();
    suggestNextPart();
  }, originalDraft);

  await expect(page.locator('#shrinkBtn')).toHaveText('← 少一個場景');
  await expect(page.locator('#expandBtn')).toHaveText('多一個場景 →');
  await expect.poll(() => page.evaluate(() => suggestion?.end)).toBe(18);
  await page.locator('#suggestionTitleInput').fill('自訂長場景上篇');
  await page.locator('#openSplitReviewBtn').click();

  const dialog = page.locator('#reviewDialog');
  await expect(dialog).toBeVisible();
  const manualButton = dialog.getByRole('button', { name: '手動微調', exact: true });
  await manualButton.click();
  await expect(dialog).toHaveClass(/manual-boundary-active/);
  await expect(dialog.locator('#manualBoundaryHint')).toContainText('不修改原稿');
  await expect(dialog.locator('.manual-boundary-target')).toHaveCount(18);
  await expect(dialog.locator('.manual-boundary-target.is-current')).toHaveAttribute('data-boundary-end', '18');
  const manualLayout = await dialog.evaluate(node => {
    const columns = [...node.querySelectorAll('.review-dialog-grid > .review-column')];
    const candidates = [...node.querySelectorAll('.manual-boundary-target:not(.is-current)')];
    const current = node.querySelector('.manual-boundary-target.is-current');
    const quietLabel = candidates[0]?.querySelector('.manual-boundary-label');
    return {
      visibleColumns: columns.filter(column => getComputedStyle(column).display !== 'none').length,
      maxCandidateHeight: Math.max(...candidates.map(target => target.getBoundingClientRect().height)),
      currentHeight: current?.getBoundingClientRect().height || 0,
      quietLabelOpacity: quietLabel ? getComputedStyle(quietLabel).opacity : '',
      charsFontSize: parseFloat(getComputedStyle(node.querySelector('#reviewCurrentChars')).fontSize)
    };
  });
  expect(manualLayout.visibleColumns).toBe(2);
  expect(manualLayout.maxCandidateHeight).toBeLessThanOrEqual(18);
  expect(manualLayout.currentHeight).toBeLessThanOrEqual(24);
  expect(manualLayout.quietLabelOpacity).toBe('0');
  expect(manualLayout.charsFontSize).toBeLessThanOrEqual(13);
  await expect.poll(() => dialog.locator('.manual-boundary-target.is-current').evaluate(marker => {
    const full = marker.closest('#dialogReviewFull');
    const markerRect = marker.getBoundingClientRect();
    const fullRect = full?.getBoundingClientRect();
    return Boolean(fullRect && markerRect.top >= fullRect.top && markerRect.bottom <= fullRect.bottom);
  })).toBe(true);

  await dialog.locator('.manual-boundary-target[data-boundary-end="10"]').click();
  await expect.poll(() => page.evaluate(() => suggestion?.end)).toBe(10);
  await expect(dialog.locator('#reviewCurrentChars')).toContainText(/本篇 .* 字 · 後續 .* 字/);
  await expect(dialog.locator('#dialogReviewCurrent')).toContainText('第 10 段');
  await expect(dialog.locator('#dialogReviewCurrent')).not.toContainText('第 11 段');
  await expect(dialog.locator('#dialogReviewFull .current-range-highlight')).toHaveCount(10);
  await expect(page.locator('#suggestionTitleInput')).toHaveValue('自訂長場景上篇');

  await dialog.locator('.manual-boundary-target.is-current')
    .dragTo(dialog.locator('.manual-boundary-target[data-boundary-end="11"]'));
  await expect.poll(() => page.evaluate(() => suggestion?.end)).toBe(11);
  await expect(dialog.locator('.manual-boundary-target.is-current')).toHaveAttribute('data-boundary-end', '11');
  await expect(dialog.locator('#dialogReviewCurrent')).toContainText('第 11 段');

  const result = await page.evaluate(() => ({
    draft: activeChapter().draft,
    title: suggestion?.name,
    start: suggestion?.start,
    end: suggestion?.end
  }));
  expect(result).toEqual({ draft: originalDraft, title: '自訂長場景上篇', start: 0, end: 11 });

  await dialog.getByRole('button', { name: '結束微調', exact: true }).click();
  await expect(dialog).not.toHaveClass(/manual-boundary-active/);
  await expect(dialog.locator('.manual-boundary-target')).toHaveCount(0);
  await expect.poll(() => dialog.locator('#dialogReviewFull .range-end').evaluate(marker => {
    const full = marker.closest('#dialogReviewFull');
    const markerRect = marker.getBoundingClientRect();
    const fullRect = full?.getBoundingClientRect();
    return Boolean(fullRect && markerRect.top >= fullRect.top && markerRect.bottom <= fullRect.bottom);
  })).toBe(true);

  await dialog.getByRole('button', { name: '手動微調', exact: true }).click();
  await dialog.locator('#closeReviewDialog').click();
  await page.locator('#openSplitReviewBtn').click();
  await expect(dialog.locator('#reviewManualBoundaryBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.locator('.manual-boundary-target')).toHaveCount(0);
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

test('published articles keep an independent afterword and can exclude it from output', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '後記測試作品' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '後記測試章節';
    chapter.draft = '正文原稿。';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'afterword-test-part',
      title: '有後記的文章',
      chars: 5,
      startBlock: 0,
      endBlock: 1,
      raw: '正文原稿。',
      formatted: '正文原稿。',
      images: [{
        id: 'delete-warning-image', fileName: 'retained.png', originalName: 'retained.png',
        relativePath: './assets/afterword-test-part/retained.png', mimeType: 'image/png',
        size: 100, width: 1, height: 1, alt: '保留圖片', caption: '', placement: 'after-body'
      }],
      published: false,
      platformStatus: {}
    }];
    renderAll();
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  const card = page.locator('.publish-list-item', { hasText: '有後記的文章' });
  await card.getByRole('button', { name: /展開.*發布平台/ }).click();
  await expect(card.getByRole('button', { name: '＋ 匯入圖片', exact: true }))
    .toHaveAttribute('data-mobile-safe-write-control', 'true');

  const editor = card.locator('.publish-afterword-editor');
  await expect(editor).toBeVisible();
  await editor.locator('textarea').fill('這是寫給讀者的後記。');
  await expect(editor.locator('.publish-afterword-count')).toContainText('10 字');
  await editor.getByRole('button', { name: '保存後記', exact: true }).click();
  await expect(card.locator('.publish-afterword-badge')).toContainText('有後記 10 字');

  await card.getByRole('button', { name: '預覽預設設定', exact: true }).click();
  const preview = page.locator('#platformPreviewDialog');
  await expect(preview).toBeVisible();
  await expect(preview.locator('#platformPreviewContent')).toContainText('正文原稿。');
  await expect(preview.locator('#platformPreviewContent')).toContainText('後記');
  await expect(preview.locator('#platformPreviewContent')).toContainText('這是寫給讀者的後記。');

  const include = preview.locator('#platformPreviewIncludeAfterword');
  await expect(include).toBeChecked();
  await include.uncheck();
  await expect(preview.locator('#platformPreviewContent')).not.toContainText('這是寫給讀者的後記。');
  await preview.getByRole('button', { name: '關閉', exact: true }).last().click();

  const stateResult = await page.evaluate(() => {
    const chapter = state.chapters.find(item => item.title === '後記測試章節');
    chapter.draft = '來源更新後的正文。';
    const part = chapter.parts[0];
    return {
      afterword: part.afterword,
      includeAfterword: part.includeAfterword,
      output: StoryFlowPublishingOutput.forPart(part, '')
    };
  });
  expect(stateResult).toEqual({
    afterword: '這是寫給讀者的後記。',
    includeAfterword: false,
    output: '正文原稿。'
  });

  await page.evaluate(() => {
    window.__afterwordDeleteMessages = [];
    window.confirm = message => {
      window.__afterwordDeleteMessages.push(message);
      return false;
    };
  });
  await card.locator('.publish-more-btn').click();
  await card.getByRole('menuitem', { name: '刪除文章', exact: true }).click();
  const deleteMessage = await page.evaluate(() => window.__afterwordDeleteMessages.at(-1));
  expect(deleteMessage).toContain('1 篇有後記');
  expect(deleteMessage).toContain('後記也會一併刪除');
  expect(deleteMessage).toContain('共附有 1 張圖片');
  expect(deleteMessage).toContain('私人 assets 圖檔會保留');
  expect(pageErrors).toEqual([]);
});

test('each platform can store a lightweight publication date and article URL', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '發布紀錄測試作品' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '發布紀錄測試章節';
    chapter.draft = '發布紀錄正文。';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'publication-record-test-part',
      title: '等待發布的文章',
      chars: 7,
      startBlock: 0,
      endBlock: 1,
      raw: '發布紀錄正文。',
      formatted: '發布紀錄正文。',
      published: false,
      platformStatus: {}
    }];
    renderAll();
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  const card = page.locator('.publish-list-item', { hasText: '等待發布的文章' });
  await card.getByRole('button', { name: /展開.*發布平台/ }).click();
  const platformRow = card.locator('.publish-platform-row', { hasText: '巴哈小屋' });
  await platformRow.getByRole('button', { name: '記錄發布', exact: true }).click();

  const dialog = page.locator('#publicationRecordDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#publicationRecordDate')).not.toHaveValue('');
  await dialog.locator('#publicationRecordUrl').fill('example.com/story/1');
  await dialog.getByRole('button', { name: '保存發布紀錄', exact: true }).click();

  await expect(platformRow.getByText('已發布', { exact: true })).toBeVisible();
  await expect(platformRow.locator('.publish-platform-record-summary')).toContainText('已記錄網址');
  await expect(platformRow.getByRole('button', { name: '發布紀錄', exact: true })).toBeVisible();

  const saved = await page.evaluate(() => {
    const part = state.chapters.find(chapter => chapter.title === '發布紀錄測試章節').parts[0];
    return {
      status: part.platformStatus['巴哈小屋'],
      record: part.publicationRecords['巴哈小屋']
    };
  });
  expect(saved.status).toBe(true);
  expect(saved.record.url).toBe('https://example.com/story/1');
  expect(Number.isNaN(Date.parse(saved.record.publishedAt))).toBe(false);

  await platformRow.getByRole('button', { name: '發布紀錄', exact: true }).click();
  await expect(dialog.locator('#openPublicationRecordUrl')).toHaveAttribute('href', 'https://example.com/story/1');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();

  page.once('dialog', async confirmation => {
    expect(confirmation.message()).toContain('清除已記錄的發布時間與文章網址');
    await confirmation.accept();
  });
  await platformRow.getByRole('button', { name: '取消已發布', exact: true }).click();
  await expect(platformRow.getByText('尚未發布', { exact: true })).toBeVisible();
  const cleared = await page.evaluate(() => {
    const record = state.chapters.find(chapter => chapter.title === '發布紀錄測試章節').parts[0].publicationRecords['巴哈小屋'];
    return record;
  });
  expect(cleared).toEqual({ publishedAt: '', url: '' });
  expect(pageErrors).toEqual([]);
});

test('publishing title stays separate from the internal name and article body', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedPublishingValue = value; } }
    });
    StoryFlowProjects.createProject({ title: '發布標題測試作品' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '內部章節名稱';
    chapter.draft = '只應出現在內容區的正文。';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'publish-title-test-part',
      title: '內部文章名稱',
      publishTitle: '',
      chars: 12,
      startBlock: 0,
      endBlock: 1,
      raw: '只應出現在內容區的正文。',
      formatted: '只應出現在內容區的正文。',
      published: false,
      platformStatus: {}
    }];
    renderAll();
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  let card = page.locator('.publish-list-item', { hasText: '內部文章名稱' });
  await card.getByRole('button', { name: /展開.*發布平台/ }).click();
  await card.getByRole('textbox', { name: '發布標題', exact: true }).fill('給讀者看的正式標題');
  await card.getByRole('button', { name: '保存標題', exact: true }).click();

  card = page.locator('.publish-list-item', { hasText: '給讀者看的正式標題' });
  await expect(card).toContainText('內部名稱：內部文章名稱');
  const saved = await page.evaluate(() => {
    const chapter = state.chapters.find(item => item.title === '內部章節名稱');
    const part = chapter.parts[0];
    const metadata = chapterMetadata(chapter);
    return {
      internalTitle: part.title,
      publishTitle: part.publishTitle,
      output: StoryFlowPublishingOutput.forPart(part, ''),
      metadataVersion: metadata.schemaVersion,
      metadataTitle: metadata.parts[0].publishTitle
    };
  });
  expect(saved).toEqual({
    internalTitle: '內部文章名稱',
    publishTitle: '給讀者看的正式標題',
    output: '只應出現在內容區的正文。',
    metadataVersion: 7,
    metadataTitle: '給讀者看的正式標題'
  });

  await card.getByRole('button', { name: '預覽預設設定', exact: true }).click();
  const preview = page.locator('#platformPreviewDialog');
  await expect(preview).toBeVisible();
  await expect(preview.locator('#platformPreviewPublishTitle')).toHaveText('給讀者看的正式標題');
  await expect(preview.locator('#platformPreviewMeta')).toContainText('內部文章名稱：內部文章名稱');
  await expect(preview.locator('#platformPreviewContent')).toHaveText('只應出現在內容區的正文。');
  await preview.getByRole('button', { name: '複製標題', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('給讀者看的正式標題');
  await preview.getByRole('button', { name: '複製內容', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('只應出現在內容區的正文。');
  expect(pageErrors).toEqual([]);
});

test('article images import private copies, preview, reorder, describe, and remove safely', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => {
    window.__imageFiles = new Map();
    window.__allImageFiles = new Map();
    window.__deletedImageFiles = [];
    window.__copiedImageMarkdown = '';
    window.__savedArticleMarkdown = '';
    window.__savedArticleMetadata = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedImageMarkdown = value; } }
    });
    StoryFlowIntegrations.restoreOutputDirectory = async () => ({ connected: true, name: 'StoryFlow-test' });
    StoryFlowIntegrations.saveWorkspace = async () => 'workspace.json';
    StoryFlowIntegrations.importPartImages = async ({ partId, files }) => Array.from(files).map(file => {
      const dot = file.name.lastIndexOf('.');
      const base = dot >= 0 ? file.name.slice(0, dot) : file.name;
      const extension = dot >= 0 ? file.name.slice(dot) : '';
      let fileName = file.name;
      let index = 2;
      while (window.__imageFiles.has(fileName)) fileName = `${base}-${index++}${extension}`;
      window.__imageFiles.set(fileName, file);
      window.__allImageFiles.set(fileName, file);
      return {
        fileName,
        originalName: file.name,
        relativePath: `./assets/${partId}/${fileName}`,
        mimeType: file.type,
        size: file.size,
        large: false
      };
    });
    StoryFlowIntegrations.getPartImageFile = async ({ fileName }) => {
      const file = window.__imageFiles.get(fileName);
      if (!file) throw new DOMException(`${fileName} missing`, 'NotFoundError');
      return file;
    };
    StoryFlowIntegrations.removePartImage = async ({ fileName }) => {
      if (!window.__imageFiles.has(fileName)) throw new DOMException(`${fileName} missing`, 'NotFoundError');
      window.__imageFiles.delete(fileName);
      window.__deletedImageFiles.push(fileName);
      return `StoryFlow-test/Recovery/Assets/${fileName}`;
    };
    StoryFlowIntegrations.savePart = async ({ part, metadata }) => {
      window.__savedArticleMarkdown = part.formatted;
      window.__savedArticleMetadata = metadata;
      return 'StoryFlow-test/Works/圖片測試作品/圖片章節';
    };

    StoryFlowProjects.createProject({ title: '圖片測試作品' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '圖片章節';
    chapter.draft = '圖片文章正文。';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'image-test-part',
      title: '附圖文章',
      publishTitle: '',
      chars: 7,
      startBlock: 0,
      endBlock: 1,
      raw: '圖片文章正文。',
      formatted: '圖片文章正文。',
      images: [],
      published: false,
      platformStatus: {}
    }];
    renderAll();
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  let card = page.locator('.publish-list-item', { hasText: '附圖文章' });
  await card.getByRole('button', { name: /展開.*發布平台/ }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8xQAAAAASUVORK5CYII=', 'base64');
  await card.locator('.article-image-manager input[type="file"]').setInputFiles([
    { name: '插圖.png', mimeType: 'image/png', buffer: png },
    { name: '插圖.png', mimeType: 'image/png', buffer: png }
  ]);

  card = page.locator('.publish-list-item', { hasText: '附圖文章' });
  await expect(card.locator('.article-image-row')).toHaveCount(2);
  await expect(card.locator('.publish-image-badge')).toHaveText('附圖 2 張');
  let firstRow = card.locator('.article-image-row').first();
  await firstRow.locator('input').nth(0).fill('夜空中的城堡');
  await firstRow.locator('input').nth(1).fill('抵達王都前的夜景');
  await firstRow.locator('select').selectOption('before-body');
  await firstRow.getByRole('button', { name: '保存圖片資訊', exact: true }).click();

  card = page.locator('.publish-list-item', { hasText: '附圖文章' });
  await card.locator('.article-image-row').nth(1).getByRole('button', { name: '上移', exact: true }).click();
  const reordered = await page.evaluate(() => {
    const part = state.chapters.find(chapter => chapter.title === '圖片章節').parts[0];
    return {
      filenames: part.images.map(image => image.fileName),
      firstAlt: part.images.find(image => image.fileName === '插圖.png').alt,
      firstPlacement: part.images.find(image => image.fileName === '插圖.png').placement,
      metadataVersion: window.__savedArticleMetadata.schemaVersion,
      metadataImages: window.__savedArticleMetadata.parts[0].images.length,
      markdown: window.__savedArticleMarkdown
    };
  });
  expect(reordered.filenames).toEqual(['插圖-2.png', '插圖.png']);
  expect(reordered.firstAlt).toBe('夜空中的城堡');
  expect(reordered.firstPlacement).toBe('before-body');
  expect(reordered.metadataVersion).toBe(7);
  expect(reordered.metadataImages).toBe(2);
  expect(reordered.markdown).toContain('![夜空中的城堡](<./assets/image-test-part/插圖.png>)');
  expect(reordered.markdown).toContain('_抵達王都前的夜景_');

  firstRow = card.locator('.article-image-row').nth(1);
  await firstRow.getByRole('button', { name: '複製 Markdown', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImageMarkdown)).toContain('夜空中的城堡');

  await card.getByRole('button', { name: '預覽預設設定', exact: true }).click();
  const preview = page.locator('#platformPreviewDialog');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.platform-preview-image')).toHaveCount(2);
  await expect(preview.locator('#platformPreviewContent')).toContainText('圖片文章正文。');
  await expect(preview.locator('#platformPreviewContent')).toContainText('抵達王都前的夜景');
  await expect(preview.locator('.platform-preview-image-notice')).toContainText('逐張上傳');
  await preview.locator('.platform-preview-image img').first().click();
  await expect(page.locator('#articleImageLightbox')).toBeVisible();
  await page.getByRole('button', { name: '關閉圖片', exact: true }).click();
  await preview.getByRole('button', { name: '關閉', exact: true }).last().click();

  await page.setViewportSize({ width: 390, height: 844 });
  await card.locator('.article-image-row').first().scrollIntoViewIfNeeded();
  const narrowLayout = await page.evaluate(() => {
    const row = document.querySelector('.article-image-row')?.getBoundingClientRect();
    const manager = document.querySelector('.article-image-manager')?.getBoundingClientRect();
    return {
      rowLeft: row?.left,
      rowRight: row?.right,
      managerLeft: manager?.left,
      managerRight: manager?.right,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });
  expect(narrowLayout.rowLeft).toBeGreaterThanOrEqual(narrowLayout.managerLeft);
  expect(narrowLayout.rowRight).toBeLessThanOrEqual(narrowLayout.managerRight);
  expect(narrowLayout.documentWidth).toBeLessThanOrEqual(narrowLayout.viewportWidth);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.evaluate(() => {
    window.__imageFiles.delete('插圖.png');
    renderParts();
  });
  await expect(page.locator('.article-image-thumb.missing')).toContainText('找不到檔案');
  await page.evaluate(() => window.__imageFiles.set('插圖.png', window.__allImageFiles.get('插圖.png')));

  card = page.locator('.publish-list-item', { hasText: '附圖文章' });
  await card.locator('.article-image-row').first().getByRole('button', { name: '移除', exact: true }).click();
  const removeDialog = page.locator('#articleImageRemoveDialog');
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole('button', { name: '只從文章移除', exact: true }).click();
  await expect(card.locator('.article-image-row')).toHaveCount(1);
  expect(await page.evaluate(() => window.__imageFiles.has('插圖-2.png'))).toBe(true);

  await card.locator('.article-image-row').first().getByRole('button', { name: '移除', exact: true }).click();
  await removeDialog.getByRole('button', { name: '備份後刪除檔案', exact: true }).click();
  await expect(card.locator('.article-image-row')).toHaveCount(0);
  const removed = await page.evaluate(() => ({
    deleted: window.__deletedImageFiles,
    remainingState: state.chapters.find(chapter => chapter.title === '圖片章節').parts[0].images.length,
    finalMarkdown: window.__savedArticleMarkdown
  }));
  expect(removed.deleted).toEqual(['插圖.png']);
  expect(removed.remainingState).toBe(0);
  expect(removed.finalMarkdown).toBe('圖片文章正文。');
  expect(pageErrors).toEqual([]);
});

test('global search jumps across works and only searches body text when requested', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const targetProjectId = await page.evaluate(() => {
    const target = StoryFlowProjects.createProject({ title: '銀河作品' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '星光章節';
    chapter.draft = '這是一段獨特的銀河關鍵字內容。';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'global-search-part',
      title: '內部星光文章',
      publishTitle: '銀河盡頭的第一封信',
      chars: 16,
      startBlock: 0,
      endBlock: 1,
      raw: '這是一段獨特的銀河關鍵字內容。',
      formatted: '這是一段獨特的銀河關鍵字內容。',
      published: false,
      platformStatus: {}
    }];
    StoryFlowProjects.createProject({ title: '目前工作作品' }, { quiet: true });
    return target.id;
  });

  await page.keyboard.press('Control+K');
  const searchDialog = page.locator('#globalSearchDialog');
  const searchbox = searchDialog.getByRole('searchbox', { name: '搜尋作品、章節與文章' });
  await expect(searchDialog).toBeVisible();
  await expect(searchbox).toBeFocused();
  await searchbox.fill('銀河盡頭');
  await expect(searchDialog.getByRole('option')).toHaveCount(1);
  await expect(searchDialog.getByRole('option')).toContainText(['銀河盡頭的第一封信']);
  await searchbox.press('Enter');

  await expect(page.locator('#publishingView')).toBeVisible();
  await expect(page.locator('.publish-list-item.expanded')).toContainText('銀河盡頭的第一封信');
  expect(await page.evaluate(() => StoryFlowProjects.activeId())).toBe(targetProjectId);

  await page.keyboard.press('Control+K');
  await searchbox.fill('獨特的銀河關鍵字');
  await expect(searchDialog.getByRole('option')).toHaveCount(0);
  await expect(searchDialog).toContainText('找不到符合內容');
  await searchDialog.getByRole('checkbox', { name: '同時搜尋正文' }).check();
  await expect(searchDialog.getByRole('option')).toHaveCount(2);
  await expect(searchDialog.getByRole('option').first()).toContainText('獨特的銀河關鍵字');
  await searchDialog.getByRole('option', { name: /銀河盡頭的第一封信/ }).click();
  await expect(page.locator('#platformPreviewDialog')).toBeVisible();
  await expect(page.locator('#platformPreviewContent')).toContainText('獨特的銀河關鍵字');
  expect(pageErrors).toEqual([]);
});

test('global search and five-item navigation fit a narrow Chrome viewport', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'Win32' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#globalSearchBtn kbd')).toHaveText('Ctrl K');
  await expect(page.locator('#globalSearchBtn kbd')).toBeHidden();
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.locator('#globalSearchDialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '關閉搜尋', exact: true })).toHaveText('×');

  const layout = await page.evaluate(() => {
    const dialog = document.getElementById('globalSearchDialog')?.getBoundingClientRect();
    const navItems = [...document.querySelectorAll('.sidebar .nav .nav-item')]
      .filter(item => getComputedStyle(item).display !== 'none')
      .map(item => item.getBoundingClientRect());
    return {
      dialogLeft: dialog?.left,
      dialogRight: dialog?.right,
      visibleNavItems: navItems.length,
      navSameRow: navItems.every(item => Math.abs(item.top - navItems[0].top) <= 1),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });
  expect(layout.visibleNavItems).toBe(5);
  expect(layout.navSameRow).toBe(true);
  expect(layout.dialogLeft).toBeGreaterThanOrEqual(0);
  expect(layout.dialogRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
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
  await page.getByText('查看變更片段').click();
  await expect(page.getByText('字數相同，但文字內容不同。')).toBeVisible();
  await expect(page.getByText(/答案在舊信裡/)).toBeVisible();
  await expect(page.getByText(/答案在新信裡/)).toBeVisible();
  await expect(page.locator('.source-diff-before .source-diff-change')).toHaveText('舊');
  await expect(page.locator('.source-diff-after .source-diff-change')).toHaveText('新');
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
