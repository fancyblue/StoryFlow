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
  await expect(page.locator('#openPublishingFromWorkspace')).toHaveCount(0);

  await page.locator('.nav-item[data-view="projects"]').click();
  await expect(page.locator('.projects-empty-state .button')).toBeVisible();
  const emptyWork = await controlStyle(page.locator('.projects-empty-state .button'));
  await expect(page.locator('#projectsNewWorkBtn')).toBeHidden();
  expect(emptyWork).toMatchObject({
    height: 40,
    fontSize: 14,
    backgroundColor: 'rgb(57, 117, 167)',
    color: 'rgb(255, 255, 255)'
  });

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
  await expect(page.locator('#openPublishingFromWorkspace')).toHaveCount(0);
  const publishingRow = page.locator('.publish-list-item', { hasText: '樣式測試文章' });
  const rowManage = publishingRow.getByRole('button', { name: /展開.*發布平台/ });
  const rowPreview = publishingRow.getByRole('button', { name: '預覽預設設定「樣式測試文章」', exact: true });
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
    backgroundColor: 'rgb(220, 235, 245)',
    color: 'rgb(35, 68, 99)'
  });

  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.locator('#settingsView')).toBeVisible();
  const settingsActions = await Promise.all([
    '#savePickerKeyBtn',
    '#clearPickerKeyBtn',
    '#settingsFolderBtn'
  ].map(selector => controlStyle(page.locator(selector))));
  settingsActions.forEach(style => expect(style).toMatchObject({ height: 40, fontSize: 14 }));
  await expect(page.locator('#savePickerKeyBtn')).toBeDisabled();
  await expect(page.locator('#importSettingsJsonBtn')).toHaveClass(/primary/);
  await expect(page.locator('#addPlatformBtn')).toBeHidden();
  await page.locator('#googleClientIdInput').fill('123456789-storyflow.apps.googleusercontent.com');
  await expect(page.locator('#savePickerKeyBtn')).toBeEnabled();
  await expect(page.locator('#savePickerKeyBtn')).toHaveClass(/primary/);
  await page.evaluate(() => {
    window.STORYFLOW_CONFIG.googleClientId = '123456789-storyflow.apps.googleusercontent.com';
    window.dispatchEvent(new CustomEvent('storyflow:integration-config-changed'));
  });
  await expect(page.locator('#addPlatformBtn')).toBeVisible();

  await page.locator('#sidebarToggle').click();
  await expect(page.locator('#sidebarToggle')).toHaveClass(/points-right/);
  await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded', 'false');
  expect(pageErrors).toEqual([]);
});

test('dialogs expose their visible heading and close control semantics', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');

  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.getByRole('region', { name: '設定', exact: true })).toHaveAttribute('id', 'settingsDialog');
  await page.getByRole('button', { name: '工作台', exact: true }).click();

  await page.getByRole('button', { name: /手動建立/ }).click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).getByRole('button', { name: /長文作品/ }).click();
  await page.locator('#sourceManualBtn').click();
  const manualDialog = page.getByRole('dialog', { name: '建立手動作品' });
  await expect(manualDialog).toBeVisible();
  await expect(manualDialog.getByRole('button', { name: '關閉', exact: true })).toHaveText('×');
  await manualDialog.getByRole('button', { name: '關閉', exact: true }).click();

  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  const searchDialog = page.getByRole('dialog', { name: '搜尋 StoryFlow' });
  await expect(searchDialog).toBeVisible();
  await expect(searchDialog.getByRole('button', { name: '關閉搜尋', exact: true })).toHaveText('×');

  const unlabeledDialogs = await page.locator('dialog').evaluateAll(dialogs => dialogs
    .filter(dialog => !dialog.getAttribute('aria-label') && !dialog.getAttribute('aria-labelledby'))
    .map(dialog => dialog.id));
  expect(unlabeledDialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('desktop pages stay bounded from laptop through extended-monitor widths', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '響應式版面測試' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '延伸螢幕測試章節';
    chapter.draft = '第一個場景。\n\n第二個場景。';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [{
      id: 'responsive-layout-part',
      title: '延伸螢幕測試文章',
      chars: 7,
      startBlock: 0,
      endBlock: 1,
      raw: '第一個場景。',
      formatted: '第一個場景。',
      published: false,
      platformStatus: {}
    }];
    renderAll();
  });

  const sizes = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 }
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.locator('.nav-item[data-view="workspace"]').click();
    await expect(page.locator('#workspaceView')).toBeVisible();

    const workspaceLayout = await page.evaluate(() => {
      const main = document.querySelector('.main');
      const mainStyle = getComputedStyle(main);
      const source = document.querySelector('.workspace-grid.workspace-hierarchy > .source-panel');
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        contentWidth: main.clientWidth - parseFloat(mainStyle.paddingLeft) - parseFloat(mainStyle.paddingRight),
        sourceWidth: source?.getBoundingClientRect().width || 0,
        hasRightColumn: Boolean(document.querySelector('.workspace-main-column')),
        statsBottom: document.querySelector('.workspace-main-column > .stats-grid')?.getBoundingClientRect().bottom || 0,
        splitterTop: document.querySelector('.workspace-main-column > .splitter-panel')?.getBoundingClientRect().top || 0
      };
    });
    expect(workspaceLayout.documentWidth).toBeLessThanOrEqual(workspaceLayout.viewportWidth);
    expect(workspaceLayout.hasRightColumn).toBe(true);
    expect(workspaceLayout.splitterTop - workspaceLayout.statsBottom).toBeGreaterThanOrEqual(15);
    expect(workspaceLayout.splitterTop - workspaceLayout.statsBottom).toBeLessThanOrEqual(21);
    expect(workspaceLayout.contentWidth).toBeLessThanOrEqual(1801);
    if (size.width >= 1600) {
      expect(workspaceLayout.sourceWidth).toBeGreaterThanOrEqual(319);
      expect(workspaceLayout.sourceWidth).toBeLessThanOrEqual(381);
    }

    for (const view of ['projects', 'publishing']) {
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      await expect(page.locator(`#${view}View`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    }

    await page.locator('#sidebarSettingsBtn').click();
    await expect(page.locator('#settingsView')).toBeVisible();
    const settingsLayout = await page.locator('#settingsDialog').evaluate(element => ({
      width: element.getBoundingClientRect().width,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth
    }));
    expect(settingsLayout.documentWidth).toBeLessThanOrEqual(settingsLayout.viewportWidth);
    expect(settingsLayout.width).toBeLessThanOrEqual(1441);
  }

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.locator('#sidebarToggle').click();
  const collapsedContent = await page.locator('.main').evaluate(element => {
    const style = getComputedStyle(element);
    return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });
  expect(collapsedContent).toBeLessThanOrEqual(1801);
  expect(pageErrors).toEqual([]);
});

test('manual project can reach workspace, works, publishing, and settings', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '內容發布工作台' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-storyflow-load-error', 'true');
  await expect(page.locator('script[data-storyflow-owner]')).toHaveCount(53);

  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).getByRole('button', { name: /長文作品/ }).click();
  await page.locator('#sourceManualBtn').click();
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
  const contentModelState = await page.evaluate(() => ({
    contentMode: state.contentMode,
    visualEntryCount: state.visualEntries?.length,
    savedContentMode: StoryFlowProjects.searchSnapshot()[0]?.state?.contentMode
  }));
  expect(contentModelState).toEqual({ contentMode: 'longform', visualEntryCount: 0, savedContentMode: 'longform' });

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
    StoryFlowProjects.createProject({ title: '其他樣式測試作品' }, { quiet: true });
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
  const managePublishing = page.getByRole('button', { name: /管理發布/ });
  await expect(manageChapters.first()).toBeVisible();
  await expect(managePublishing.first()).toBeVisible();
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
      chapters: values(document.querySelector('.project-library-card.active .project-manage-chapters-btn')),
      inactiveChapters: values(document.querySelector('.project-library-card:not(.active) .project-manage-chapters-btn')),
      publishing: values(document.querySelector('.project-publish-btn'))
    };
  });
  expect(managementStyles.chapters.height).toBe('40px');
  expect(managementStyles.chapters.fontSize).toBe('14px');
  expect(managementStyles.chapters.backgroundColor).toBe('rgb(220, 235, 245)');
  expect(managementStyles.chapters.color).toBe('rgb(35, 68, 99)');
  expect(managementStyles.inactiveChapters.backgroundColor).toBe(managementStyles.chapters.backgroundColor);
  expect(managementStyles.inactiveChapters.borderColor).toBe(managementStyles.chapters.borderColor);
  expect(managementStyles.inactiveChapters.color).toBe(managementStyles.chapters.color);
  expect(managementStyles.publishing.backgroundColor).toBe('rgb(245, 249, 252)');
  expect(managementStyles.publishing.color).toBe('rgb(45, 93, 133)');
  expect(managementStyles.open.height).toBe(managementStyles.chapters.height);
  expect(managementStyles.open.fontSize).toBe(managementStyles.chapters.fontSize);
  expect(managementStyles.open.fontWeight).toBe(managementStyles.chapters.fontWeight);
  expect(managementStyles.open.backgroundColor).toBe('rgb(255, 255, 255)');

  const newWorkStyle = await page.locator('#projectsNewWorkBtn').evaluate(button => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return { height: rect.height, width: rect.width, fontSize: parseFloat(style.fontSize) };
  });
  expect(newWorkStyle.height).toBeLessThanOrEqual(42);
  expect(newWorkStyle.fontSize).toBeGreaterThanOrEqual(14);
  expect(newWorkStyle.width / newWorkStyle.height).toBeLessThan(3.2);
  expect(await page.locator('#projectsNewWorkBtn').evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgb(255, 255, 255)');
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
  await page.setViewportSize({ width: 1440, height: 760 });
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
  const initialDialogLayout = await dialog.evaluate(node => {
    const card = node.querySelector('.review-dialog-card');
    const grid = node.querySelector('.review-dialog-grid');
    const footer = node.querySelector('.platform-preview-actions');
    const button = node.querySelector('#closeReviewDialogBottom');
    const dialogRect = node.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      dialogBottom: dialogRect.bottom,
      gridHeight: grid.getBoundingClientRect().height,
      footerBottom: footerRect.bottom,
      buttonBottom: buttonRect.bottom,
      cardClientHeight: card.clientHeight,
      cardScrollHeight: card.scrollHeight,
      cardOverflowY: getComputedStyle(card).overflowY
    };
  });
  expect(initialDialogLayout.gridHeight).toBeGreaterThan(200);
  expect(initialDialogLayout.footerBottom).toBeLessThanOrEqual(initialDialogLayout.dialogBottom + 2);
  expect(initialDialogLayout.buttonBottom).toBeLessThanOrEqual(initialDialogLayout.dialogBottom - 8);
  expect(initialDialogLayout.cardScrollHeight).toBeLessThanOrEqual(initialDialogLayout.cardClientHeight + 1);
  expect(initialDialogLayout.cardOverflowY).toBe('hidden');
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
  await page.getByRole('dialog', { name: '選擇作品類型' }).getByRole('button', { name: /長文作品/ }).click();
  await page.locator('#sourceManualBtn').click();
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
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
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
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
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

test('storage cleanup keeps referenced and recent files', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/storage-management-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.locator('#result')).toContainText('ALL PASS');
  expect(pageErrors).toEqual([]);
});

test('backup center renders safe workspace metadata', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/backup-center-ui.html');

  await expect(page.getByText('備份與復原')).toBeVisible();
  await expect(page.getByText('StoryFlow-test')).toBeVisible();
  await expect(page.getByText('2 部作品 · 8 個章節 · 3 篇發布稿')).toBeVisible();
  await expect(page.getByRole('button', { name: '從最近備份恢復', exact: true })).toBeEnabled();
  await expect(page.getByText('儲存空間整理', { exact: true })).toBeVisible();
  await expect(page.getByText('Recovery JSON', { exact: true })).toBeVisible();
  await expect(page.getByText('未被引用的 Works 圖片', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '預覽可清理內容', exact: true }).click();
  await expect(page.getByText('可清理 4 個檔案（3.0 MB）', { exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '確認清理', exact: true }).click();
  await expect(page.locator('#backupCenterStatus')).toContainText('已清理 4 個檔案');
  expect(await page.evaluate(() => fixtureCleanupCalls)).toBe(1);
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
  await expect(page.locator('#publishingContentTypeFilters')).toBeVisible();
  await expect(page.locator('#publishingContentTypeFilters [data-content-type="longform"]')).toContainText('長文 1');
  await expect(page.locator('.publishing-project-group-title .publishing-project-type-badge')).toHaveText('長文');
  await page.locator('#publishingContentTypeFilters [data-content-type="visual"]').click();
  await expect(page.locator('.publishing-filter-empty')).toContainText('沒有符合目前篩選的內容');
  await page.locator('#publishingContentTypeFilters [data-content-type="all"]').click();
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
  await expect(card.locator('.publish-article-tools')).toContainText('圖片 1 張 · 後記 0 字');
  await expect(card.locator('.publish-platform-row').first()).toBeVisible();

  await card.getByRole('button', { name: '文章圖片 1', exact: true }).click();
  let toolDialog = page.locator('#publishingArticleToolDialog');
  await expect(toolDialog).toBeVisible();
  await expect(toolDialog.getByRole('button', { name: '＋ 匯入圖片', exact: true }))
    .toHaveAttribute('data-mobile-safe-write-control', 'true');
  await toolDialog.getByRole('button', { name: '完成', exact: true }).click();

  await card.getByRole('button', { name: '後記', exact: true }).click();
  toolDialog = page.locator('#publishingArticleToolDialog');
  const editor = toolDialog.locator('.publish-afterword-editor');
  await expect(editor).toBeVisible();
  await editor.locator('textarea').fill('這是寫給讀者的後記。');
  await expect(editor.locator('.publish-afterword-count')).toContainText('10 字');
  await editor.getByRole('button', { name: '保存後記', exact: true }).click();
  await expect(card.locator('.publish-afterword-badge')).toContainText('有後記 10 字');
  await toolDialog.getByRole('button', { name: '完成', exact: true }).click();

  await card.getByRole('button', { name: '預覽預設設定「有後記的文章」', exact: true }).click();
  const preview = page.locator('#platformPreviewDialog');
  await expect(preview).toBeVisible();
  await expect(preview.locator('#platformPreviewContent')).toContainText('正文原稿。');
  await expect(preview.locator('#platformPreviewContent')).toContainText('後記');
  await expect(preview.locator('#platformPreviewContent')).toContainText('這是寫給讀者的後記。');

  await preview.locator('#platformPreviewOptions summary').click();
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
  await platformRow.getByRole('button', { name: '記錄「巴哈小屋」發布紀錄', exact: true }).click();

  const dialog = page.locator('#publicationRecordDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#publicationRecordDate')).not.toHaveValue('');
  await dialog.locator('#publicationRecordUrl').fill('example.com/story/1');
  await dialog.getByRole('button', { name: '保存發布紀錄', exact: true }).click();

  await expect(platformRow.getByText('已發布', { exact: true })).toBeVisible();
  await expect(platformRow.locator('.publish-platform-record-summary')).toContainText('已記錄網址');
  await expect(platformRow.getByRole('button', { name: '查看「巴哈小屋」發布紀錄', exact: true })).toBeVisible();

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

  await platformRow.getByRole('button', { name: '查看「巴哈小屋」發布紀錄', exact: true }).click();
  await expect(dialog.locator('#openPublicationRecordUrl')).toHaveAttribute('href', 'https://example.com/story/1');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();

  page.once('dialog', async confirmation => {
    expect(confirmation.message()).toContain('清除已記錄的發布時間與文章網址');
    await confirmation.accept();
  });
  await platformRow.getByRole('button', { name: '取消「巴哈小屋」已發布', exact: true }).click();
  await expect(platformRow.getByText('尚未發布', { exact: true })).toBeVisible();
  const cleared = await page.evaluate(() => {
    const record = state.chapters.find(chapter => chapter.title === '發布紀錄測試章節').parts[0].publicationRecords['巴哈小屋'];
    return record;
  });
  expect(cleared).toEqual({ publishedAt: '', url: '' });
  expect(pageErrors).toEqual([]);
});

test('platform titles stay separate and copy can prepend heading or bold title', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedPublishingValue = value; } }
    });
    window.confirm = () => false;
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
  const card = page.locator('.publish-list-item', { hasText: '內部文章名稱' });
  await card.getByRole('button', { name: /展開.*發布平台/ }).click();
  const platformRow = card.locator('.publish-platform-row', { hasText: '巴哈小屋' });
  await platformRow.getByRole('button', { name: '預覽與複製「巴哈小屋」', exact: true }).click();
  const preview = page.locator('#platformPreviewDialog');
  await preview.getByRole('button', { name: '修改此平台標題', exact: true }).click();
  await preview.getByRole('textbox', { name: '此平台標題', exact: true }).fill('給讀者看的正式標題');
  await preview.getByRole('button', { name: '保存標題', exact: true }).click();

  await expect(preview.locator('#platformPreviewPublishTitle')).toHaveText('給讀者看的正式標題');
  await expect(preview.locator('#platformPreviewTitleSource')).toContainText('此平台自訂');
  await expect(card.locator('.publish-platform-title-summary')).toContainText('給讀者看的正式標題');
  const saved = await page.evaluate(() => {
    const chapter = state.chapters.find(item => item.title === '內部章節名稱');
    const part = chapter.parts[0];
    const metadata = chapterMetadata(chapter);
    return {
      internalTitle: part.title,
      platformTitle: part.platformTitles['巴哈小屋'],
      otherPlatformTitle: StoryFlowPublishingOutput.titleFor(part, '方格子'),
      output: StoryFlowPublishingOutput.forPart(part, ''),
      metadataVersion: metadata.schemaVersion,
      metadataTitle: metadata.parts[0].platformTitles['巴哈小屋']
    };
  });
  expect(saved).toEqual({
    internalTitle: '內部文章名稱',
    platformTitle: '給讀者看的正式標題',
    otherPlatformTitle: '內部文章名稱',
    output: '只應出現在內容區的正文。',
    metadataVersion: 8,
    metadataTitle: '給讀者看的正式標題'
  });

  await expect(preview.locator('#platformPreviewContent')).toHaveText('只應出現在內容區的正文。');
  await preview.getByRole('button', { name: '複製標題', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('給讀者看的正式標題');
  await preview.locator('#platformPreviewOptions summary').click();
  await preview.getByRole('checkbox', { name: '內容前附上標題' }).check();
  await expect(preview.locator('.sf-md-heading-1')).toHaveText('給讀者看的正式標題');
  await preview.getByRole('button', { name: '複製內容', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('# 給讀者看的正式標題\n\n只應出現在內容區的正文。');

  await platformRow.getByRole('button', { name: '預覽與複製「巴哈小屋」', exact: true }).click();
  await preview.locator('#platformPreviewOptions summary').click();
  await preview.getByRole('checkbox', { name: '內容前附上標題' }).check();
  await preview.locator('#platformPreviewTitleStyle').selectOption('bold');
  await expect(preview.locator('#platformPreviewContent strong')).toHaveText('給讀者看的正式標題');
  await preview.getByRole('button', { name: '複製內容', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('**給讀者看的正式標題**\n\n只應出現在內容區的正文。');
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
  const card = page.locator('.publish-list-item', { hasText: '附圖文章' });
  await card.getByRole('button', { name: /展開.*發布平台/ }).click();
  await card.getByRole('button', { name: '文章圖片', exact: true }).click();
  const toolDialog = page.locator('#publishingArticleToolDialog');
  await expect(toolDialog).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8xQAAAAASUVORK5CYII=', 'base64');
  await toolDialog.locator('.article-image-manager input[type="file"]').setInputFiles([
    { name: '插圖.png', mimeType: 'image/png', buffer: png },
    { name: '插圖.png', mimeType: 'image/png', buffer: png }
  ]);

  await expect(toolDialog.locator('.article-image-row')).toHaveCount(2);
  await expect(card.locator('.publish-image-badge')).toHaveText('附圖 2 張');
  let firstRow = toolDialog.locator('.article-image-row').first();
  await firstRow.locator('input').nth(0).fill('夜空中的城堡');
  await firstRow.locator('input').nth(1).fill('抵達王都前的夜景');
  await firstRow.locator('select').selectOption('before-body');
  await firstRow.getByRole('button', { name: '保存圖片資訊', exact: true }).click();

  await toolDialog.locator('.article-image-row').nth(1).getByRole('button', { name: '上移', exact: true }).click();
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
  expect(reordered.metadataVersion).toBe(8);
  expect(reordered.metadataImages).toBe(2);
  expect(reordered.markdown).toContain('![夜空中的城堡](<./assets/image-test-part/插圖.png>)');
  expect(reordered.markdown).toContain('_抵達王都前的夜景_');

  firstRow = toolDialog.locator('.article-image-row').nth(1);
  await firstRow.getByRole('button', { name: '複製 Markdown', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImageMarkdown)).toContain('夜空中的城堡');

  await toolDialog.getByRole('button', { name: '完成', exact: true }).click();
  await card.getByRole('button', { name: '預覽預設設定「附圖文章」', exact: true }).click();
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

  await card.getByRole('button', { name: '文章圖片 2', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await toolDialog.locator('.article-image-row').first().scrollIntoViewIfNeeded();
  const narrowLayout = await page.evaluate(() => {
    const dialog = document.getElementById('publishingArticleToolDialog');
    const row = dialog?.querySelector('.article-image-row')?.getBoundingClientRect();
    const manager = dialog?.querySelector('.article-image-manager')?.getBoundingClientRect();
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

  await toolDialog.getByRole('button', { name: '完成', exact: true }).click();
  await page.evaluate(() => {
    window.__imageFiles.delete('插圖.png');
    renderParts();
  });
  await card.getByRole('button', { name: '文章圖片 2', exact: true }).click();
  await expect(toolDialog.locator('.article-image-thumb.missing')).toContainText('找不到檔案');
  await page.evaluate(() => window.__imageFiles.set('插圖.png', window.__allImageFiles.get('插圖.png')));

  await toolDialog.locator('.article-image-row').first().getByRole('button', { name: '移除', exact: true }).click();
  const removeDialog = page.locator('#articleImageRemoveDialog');
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole('button', { name: '只從文章移除', exact: true }).click();
  await expect(toolDialog.locator('.article-image-row')).toHaveCount(1);
  expect(await page.evaluate(() => window.__imageFiles.has('插圖-2.png'))).toBe(true);

  await toolDialog.locator('.article-image-row').first().getByRole('button', { name: '移除', exact: true }).click();
  await removeDialog.getByRole('button', { name: '備份後刪除檔案', exact: true }).click();
  await expect(toolDialog.locator('.article-image-row')).toHaveCount(0);
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

test('visual content phase zero contracts pass', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/tests/visual-content-model-core.html');
  await expect(page.locator('body')).toHaveAttribute('data-test-status', 'pass');
  await expect(page.getByText('ALL PASS')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('visual content phase one creates, edits, stores, previews, orders, and removes entries safely', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => {
    window.__visualFiles = new Map();
    window.__savedVisualEntry = null;
    window.__removedVisualEntries = [];
    window.__visualRecoveryReasons = [];
    window.__copiedVisualHelper = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedVisualHelper = value; } }
    });
    StoryFlowIntegrations.restoreOutputDirectory = async () => ({ connected: true, name: 'StoryFlow-test' });
    StoryFlowIntegrations.saveWorkspace = async () => 'StoryFlow-test/workspace.json';
    StoryFlowIntegrations.createWorkspaceRecoverySnapshot = async reason => {
      window.__visualRecoveryReasons.push(reason);
      return { artifactPath: `StoryFlow-test/Recovery/${reason}.json` };
    };
    StoryFlowIntegrations.importVisualImages = async ({ files }) => Array.from(files).map((file, index) => {
      const storedName = index ? `插圖-${index + 1}.png` : '插圖.png';
      window.__visualFiles.set(storedName, file);
      return { id: crypto.randomUUID(), storedName, relativePath: `./assets/${storedName}`, mimeType: file.type, bytes: file.size, large: false };
    });
    StoryFlowIntegrations.getVisualImageFile = async ({ storedName }) => {
      const file = window.__visualFiles.get(storedName);
      if (!file) throw new DOMException(`${storedName} missing`, 'NotFoundError');
      return file;
    };
    StoryFlowIntegrations.saveVisualEntry = async payload => {
      window.__savedVisualEntry = structuredClone(payload);
      return `StoryFlow-test/Works/${payload.projectTitle}/Visual/${payload.entry.id}`;
    };
    StoryFlowIntegrations.removeVisualEntryFiles = async payload => {
      window.__removedVisualEntries.push(payload.entryId);
      return `StoryFlow-test/Recovery/${payload.entryId}.json`;
    };
  });

  const longformSourceWidth = await page.locator('.workspace-grid > .source-panel').evaluate(panel => panel.getBoundingClientRect().width);

  await page.locator('.nav-item[data-view="projects"]').click();
  await page.locator('.projects-empty-state .button').click();
  const typeDialog = page.locator('#visualTypeDialog');
  await expect(typeDialog).toBeVisible();
  await expect(typeDialog.locator('#visualTypeDialogTitle')).toHaveText('選擇作品類型');
  await expect(typeDialog.locator('#visualTypeOptions')).toBeVisible();
  await expect(typeDialog.locator('#visualSeriesCreatePanel')).toBeHidden();
  await typeDialog.locator('#chooseVisualType').click();
  await expect(typeDialog.locator('#visualTypeOptions')).toBeHidden();
  await expect(typeDialog.locator('#visualSeriesCreatePanel')).toBeVisible();
  await expect(typeDialog.locator('#visualTypeDialogTitle')).toHaveText('建立圖文系列');
  await typeDialog.locator('#visualSeriesTitle').fill('夜色圖文集');
  await typeDialog.locator('#visualFirstEntryTitle').fill('月下預告');
  await typeDialog.getByRole('button', { name: '建立圖文系列', exact: true }).click();

  await expect(page.locator('#visualWorkspace')).toBeVisible();
  await expect(page.locator('.workspace-grid')).toBeHidden();
  await expect(page.locator('#visualEditorEmpty')).toBeHidden();
  expect(await page.locator('#visualEditorForm').evaluate(form => {
    const panel = form.closest('.visual-editor-panel');
    return form.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  })).toBeLessThan(80);
  await expect(page.getByRole('heading', { name: '圖文工作台', exact: true })).toBeVisible();
  await expect(page.locator('#visualWorkspace > .visual-workspace-head .eyebrow')).toHaveText('STORYFLOW / WORKSPACE');
  await expect(page.locator('#visualWorkspace > .visual-workspace-head .muted')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '作品與圖文', exact: true })).toBeVisible();
  const visualSourceWidth = await page.locator('.visual-workspace-layout > .visual-entry-list-panel').evaluate(panel => panel.getBoundingClientRect().width);
  expect(Math.abs(visualSourceWidth - longformSourceWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('#visualProjectTitle')).toHaveValue('夜色圖文集');
  await expect(page.locator('.visual-current-project')).toHaveCount(0);
  await expect(page.locator('#visualProjectSwitchBtn')).toHaveText('切換作品');
  await expect(page.locator('#visualProjectSwitchBtn')).toHaveClass(/quick-switch-project-btn/);
  expect(await page.locator('#visualProjectSwitchBtn').evaluate(button => Boolean(button.closest('.visual-entry-list-panel')))).toBe(true);
  await expect(page.locator('#visualDeleteEntryBtn')).toHaveCount(0);
  const visualWorkspaceMore = page.locator('#visualEntryList').getByRole('button', { name: '更多「月下預告」操作', exact: true });
  await expect(visualWorkspaceMore).toBeVisible();
  await visualWorkspaceMore.click();
  await expect(page.locator('#visualEntryList').getByRole('menuitem', { name: '編輯圖文', exact: true })).toBeVisible();
  await expect(page.locator('#visualEntryList').getByRole('menuitem', { name: '刪除圖文', exact: true })).toBeVisible();
  await page.locator('#visualEntryList').getByRole('menuitem', { name: '編輯圖文', exact: true }).click();
  await expect(page.locator('#visualEntryTitle')).toBeFocused();
  await expect(page.locator('#visualNewEntryBtn')).toBeVisible();
  expect(await page.locator('#visualNewEntryBtn').evaluate(button => Boolean(button.closest('.visual-entry-list-panel')))).toBe(true);
  expect(await page.locator('.visual-entry-list-panel').evaluate(panel => {
    const list = panel.querySelector('#visualEntryList').getBoundingClientRect();
    const button = panel.querySelector('#visualNewEntryBtn').getBoundingClientRect();
    return button.top >= list.bottom;
  })).toBe(true);

  await page.locator('#visualProjectSwitchBtn').click();
  await expect(page.locator('#visualProjectNewWork')).toBeVisible();
  await page.locator('#visualProjectNewWork').click();
  await expect(typeDialog).toBeVisible();
  await typeDialog.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(typeDialog).toBeHidden();

  const originalVisualProjectId = await page.evaluate(() => StoryFlowProjects.activeId());
  await page.evaluate(() => StoryFlowProjects.createProject({ title: '第二圖文集', contentMode: 'visual' }, { quiet: true }));
  await expect(page.locator('#visualProjectTitle')).toHaveValue('第二圖文集');
  await page.locator('#visualProjectSwitchBtn').click();
  await expect(page.locator('#visualProjectMenu')).toBeVisible();
  await page.locator('#visualProjectMenu .workspace-project-quick-switch-item', { hasText: '夜色圖文集' }).click();
  await expect(page.locator('#visualProjectTitle')).toHaveValue('夜色圖文集');
  expect(await page.evaluate(() => StoryFlowProjects.activeId())).toBe(originalVisualProjectId);
  await expect(page.locator('#visualEntryList')).toContainText('月下預告');
  await expect(page.locator('#visualEntrySummary')).toHaveCount(0);
  await expect(page.locator('#visualEntryHashtags')).toHaveCount(0);
  await expect(page.locator('#visualEntryStatusHelp')).toHaveText('兩種狀態都會保存。草稿代表仍在編輯；可發布代表內容已準備完成，但不會自動發布。');
  await expect(page.locator('#visualSaveEntryBtn')).toHaveText('保存草稿');
  const bodyLayout = await page.locator('#visualEntryBody').evaluate(bodyElement => {
    const bodyStyle = getComputedStyle(bodyElement);
    return {
      height: bodyElement.getBoundingClientRect().height,
      paddingTop: parseFloat(bodyStyle.paddingTop),
      paddingBottom: parseFloat(bodyStyle.paddingBottom),
      lineHeight: parseFloat(bodyStyle.lineHeight),
      fontSize: parseFloat(bodyStyle.fontSize)
    };
  });
  expect(bodyLayout.height).toBeGreaterThanOrEqual(72);
  expect(bodyLayout.paddingTop).toBeGreaterThanOrEqual(10);
  expect(bodyLayout.paddingBottom).toBeGreaterThanOrEqual(10);
  expect(bodyLayout.lineHeight).toBeGreaterThan(bodyLayout.fontSize);
  await page.locator('#visualEntryBody').fill('月光落在城牆上。\n\n第二段圖文內容。');
  await page.locator('#visualEntryStatus').selectOption('ready');
  await expect(page.locator('#visualSaveEntryBtn')).toHaveText('保存並設為可發布');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8xQAAAAASUVORK5CYII=', 'base64');
  await page.locator('#visualImageInput').setInputFiles([
    { name: '插圖.png', mimeType: 'image/png', buffer: png },
    { name: '插圖.png', mimeType: 'image/png', buffer: png }
  ]);
  await expect(page.locator('.visual-image-card')).toHaveCount(2);
  await expect(page.locator('.visual-image-card').first()).toHaveAttribute('draggable', 'true');

  await page.locator('.visual-image-card').first().getByRole('button', { name: '編輯', exact: true }).click();
  const imageDialog = page.getByRole('dialog', { name: '編輯圖片資訊' });
  await imageDialog.locator('#visualImageAlt').fill('月光下的城堡');
  await imageDialog.locator('#visualImageCaption').fill('夜色系列封面');
  await imageDialog.locator('#visualImageCover').check();
  await imageDialog.getByRole('button', { name: '保存圖片資訊', exact: true }).click();
  await expect(page.locator('.visual-image-card').first()).toContainText('月光下的城堡');
  await expect(page.locator('.visual-image-card').first()).toContainText('封面');

  await page.locator('.visual-image-card').nth(1).getByRole('button', { name: '向前移動', exact: true }).click();
  await page.locator('#visualSaveEntryBtn').click();
  await expect.poll(() => page.evaluate(() => window.__savedVisualEntry?.entry?.title)).toBe('月下預告');
  await expect(page.locator('#visualOpenPublishingBtn')).toHaveCount(0);
  const visualActionGap = await page.evaluate(() => {
    const preview = document.getElementById('visualPreviewEntryBtn')?.getBoundingClientRect();
    const save = document.getElementById('visualSaveEntryBtn')?.getBoundingClientRect();
    return preview && save ? save.left - preview.right : 0;
  });
  expect(visualActionGap).toBeGreaterThanOrEqual(12);
  await page.locator('#visualPreviewEntryBtn').click();
  const workspacePreview = page.getByRole('dialog', { name: '圖文預覽 · 月下預告' });
  await expect(workspacePreview).toBeVisible();
  await expect(workspacePreview.locator('#visualPreviewBody')).toContainText('第二段圖文內容');
  await expect(workspacePreview.locator('#visualPreviewImages figure')).toHaveCount(2);
  expect(await workspacePreview.locator('.visual-dialog-actions').evaluate(element => parseFloat(getComputedStyle(element).marginTop))).toBeGreaterThanOrEqual(16);
  await workspacePreview.getByRole('button', { name: '關閉', exact: true }).last().click();

  const stored = await page.evaluate(() => ({
    mode: state.contentMode,
    chapters: state.chapters.length,
    entryCount: state.visualEntries.length,
    status: state.visualEntries[0].status,
    order: state.visualEntries[0].images.map(image => image.storedName),
    cover: state.visualEntries[0].coverImageId,
    firstImageId: state.visualEntries[0].images[0].id
  }));
  expect(stored).toMatchObject({
    mode: 'visual', chapters: 0, entryCount: 1, status: 'ready',
    order: ['插圖-2.png', '插圖.png']
  });
  expect(stored.cover).not.toBe(stored.firstImageId);

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('#publishingContentTypeFilters [data-content-type="visual"]')).toContainText('圖文 1');
  await expect(page.locator('.publishing-project-group-title .publishing-project-type-badge')).toHaveText('圖文');
  const publishCard = page.locator('.publish-list-item', { hasText: '月下預告' });
  await expect(publishCard).toBeVisible();
  await expect(publishCard.locator('.publish-content-type')).toHaveText('圖文');
  await expect(publishCard.getByRole('button', { name: '預覽與複製「月下預告」', exact: true })).toBeVisible();
  await expect(publishCard.getByRole('button', { name: '更多「月下預告」操作', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.id = 'publishingScrollAnchorFixture';
    spacer.style.height = '720px';
    document.getElementById('partsList').before(spacer);
  });
  const managePublishing = publishCard.getByRole('button', { name: /展開「月下預告」的發布平台/ });
  await managePublishing.evaluate(button => button.scrollIntoView({ block: 'center' }));
  const beforeManage = await publishCard.evaluate(card => ({ top: card.getBoundingClientRect().top, scrollY: window.scrollY }));
  await managePublishing.click();
  const afterManage = await publishCard.evaluate(card => ({ top: card.getBoundingClientRect().top, scrollY: window.scrollY }));
  expect(beforeManage.scrollY).toBeGreaterThan(0);
  expect(afterManage.scrollY).toBeGreaterThan(0);
  expect(Math.abs(afterManage.top - beforeManage.top)).toBeLessThanOrEqual(2);
  await expect(publishCard.getByRole('button', { name: /收合「月下預告」的發布平台/ })).toBeFocused();
  await page.evaluate(() => document.getElementById('publishingScrollAnchorFixture')?.remove());
  await expect(publishCard.locator('.visual-publish-helpers')).toHaveCount(0);
  const helperToolButton = publishCard.getByRole('button', { name: '摘要與 Hashtags', exact: true });
  await expect(helperToolButton).toBeVisible();
  await helperToolButton.click();
  const visualHelperDialog = page.getByRole('dialog', { name: '摘要與 Hashtags' });
  await expect(visualHelperDialog).toBeVisible();
  await visualHelperDialog.locator('.visual-publish-summary-input').fill('月光下的城堡預告');
  await visualHelperDialog.locator('.visual-publish-hashtags-input').fill('#StoryFlow #夜色創作');
  await visualHelperDialog.getByRole('button', { name: '保存摘要與 Hashtags', exact: true }).click();
  await expect(visualHelperDialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => state.visualEntries[0].summary)).toBe('月光下的城堡預告');
  expect(await page.evaluate(() => ({
    hashtags: state.visualEntries[0].hashtags,
    tags: state.visualEntries[0].tags,
    savedSummary: window.__savedVisualEntry?.entry?.summary,
    savedHashtags: window.__savedVisualEntry?.entry?.hashtags
  }))).toEqual({
    hashtags: '#StoryFlow #夜色創作',
    tags: ['StoryFlow', '夜色創作'],
    savedSummary: '月光下的城堡預告',
    savedHashtags: '#StoryFlow #夜色創作'
  });
  const summaryHint = publishCard.locator('.publish-summary-hint');
  await expect(summaryHint).toHaveAttribute('aria-label', '摘要：月光下的城堡預告');
  await summaryHint.focus();
  await expect.poll(() => summaryHint.evaluate(element => getComputedStyle(element.closest('.publish-list-item')).overflow)).toBe('visible');
  await expect(publishCard.locator('.publish-platform-row')).toHaveCount(2);
  const firstPlatformRow = publishCard.locator('.publish-platform-row').first();
  const platformHashtags = firstPlatformRow.locator('.publish-platform-hashtags');
  await expect(platformHashtags).toHaveText('#StoryFlow #夜色創作');
  await platformHashtags.click();
  await expect.poll(() => page.evaluate(() => window.__copiedVisualHelper)).toBe('#StoryFlow #夜色創作');

  await firstPlatformRow.getByRole('button', { name: '預覽與複製「巴哈小屋」', exact: true }).click();
  const publishingPreview = page.locator('#platformPreviewDialog');
  await expect(publishingPreview).toBeVisible();
  await expect(publishingPreview.locator('#platformPreviewOptions')).toHaveJSProperty('open', false);
  await expect(publishingPreview.locator('#platformPreviewMeta')).toBeHidden();
  await expect(publishingPreview.locator('[data-sf-preview-control="publish"]')).toBeHidden();
  await expect(publishingPreview.locator('#platformPreviewSummaryEditor')).toBeHidden();
  await expect(publishingPreview.locator('#platformPreviewHashtagsEditor')).toBeHidden();
  expect(await publishingPreview.evaluate(dialog => {
    const body = dialog.querySelector('.platform-preview-body');
    const contentHead = dialog.querySelector('.platform-preview-content-head');
    const content = dialog.querySelector('#platformPreviewContent');
    const summaryEditor = dialog.querySelector('#platformPreviewSummaryEditor');
    const hashtagsEditor = dialog.querySelector('#platformPreviewHashtagsEditor');
    const rows = [...dialog.querySelectorAll('.platform-preview-extra-row')];
    const buttonsContained = rows.every(row => {
      const rowBox = row.getBoundingClientRect();
      const buttonBox = row.querySelector(':scope > .button')?.getBoundingClientRect();
      return buttonBox && buttonBox.left >= rowBox.left - 1 && buttonBox.right <= rowBox.right + 1
        && buttonBox.top >= rowBox.top - 1 && buttonBox.bottom <= rowBox.bottom + 1;
    });
    return {
      contentBeforeEditors: Boolean(content && summaryEditor && hashtagsEditor
        && (content.compareDocumentPosition(summaryEditor) & Node.DOCUMENT_POSITION_FOLLOWING)
        && (content.compareDocumentPosition(hashtagsEditor) & Node.DOCUMENT_POSITION_FOLLOWING)),
      compactTop: Boolean(body && contentHead && contentHead.getBoundingClientRect().top - body.getBoundingClientRect().top <= 170),
      buttonsContained
    };
  })).toEqual({ contentBeforeEditors: true, compactTop: true, buttonsContained: true });
  await publishingPreview.locator('#editPlatformPreviewSummary').click();
  await expect(publishingPreview.locator('#platformPreviewSummaryEditor')).toBeVisible();
  await publishingPreview.locator('#platformPreviewSummaryInput').fill('更新後的月光摘要');
  await publishingPreview.locator('#savePlatformPreviewSummary').click();
  await expect(publishingPreview.locator('#platformPreviewSummaryEditor')).toBeHidden();
  await expect(publishingPreview.locator('#platformPreviewSummary')).toHaveText('更新後的月光摘要');
  await expect.poll(() => page.evaluate(() => state.visualEntries[0].summary)).toBe('更新後的月光摘要');
  await publishingPreview.locator('#editPlatformPreviewHashtags').click();
  await expect(publishingPreview.locator('#platformPreviewHashtagsEditor')).toBeVisible();
  await expect(publishingPreview.locator('#platformPreviewHashtagsState')).toHaveText('沿用共用');
  await expect(publishingPreview.locator('#platformPreviewHashtagsInput')).toHaveValue('#StoryFlow #夜色創作');
  await publishingPreview.locator('#platformPreviewHashtagsInput').fill('#巴哈限定 #圖文');
  await publishingPreview.locator('#savePlatformPreviewHashtags').click();
  await expect(publishingPreview.locator('#platformPreviewHashtagsState')).toHaveText('此平台自訂');
  await expect(publishingPreview.locator('#platformPreviewHashtags')).toHaveText('#巴哈限定 #圖文');
  await expect(firstPlatformRow.locator('.publish-platform-hashtags')).toHaveText('#巴哈限定 #圖文');
  expect(await page.evaluate(() => ({
    stateHashtags: state.visualEntries[0].platformHashtags?.['巴哈小屋'],
    savedHashtags: window.__savedVisualEntry?.entry?.platformHashtags?.['巴哈小屋']
  }))).toEqual({
    stateHashtags: '#巴哈限定 #圖文',
    savedHashtags: '#巴哈限定 #圖文'
  });
  await expect(publishCard.locator('.publish-platform-row').nth(1).locator('.publish-platform-hashtags')).toHaveText('#StoryFlow #夜色創作');

  expect(await publishingPreview.locator('.platform-preview-actions .button').allTextContents()).toEqual(['標註已發布', '關閉', '複製內容']);
  await expect(publishingPreview.locator('.visual-upload-order')).toContainText('圖片不會被複製或自動上傳');
  await expect(publishingPreview.locator('.visual-upload-order li')).toHaveCount(2);
  await expect(publishingPreview.locator('#platformPreviewSummary')).toHaveText('更新後的月光摘要');
  await expect(publishingPreview.locator('#platformPreviewHashtags')).toHaveText('#巴哈限定 #圖文');
  expect(await publishingPreview.evaluate(dialog => {
    const content = dialog.querySelector('#platformPreviewContent');
    const lastImage = dialog.querySelector('.visual-upload-order li:last-child');
    const extras = dialog.querySelector('#platformPreviewVisualExtras');
    if (!content || !lastImage || !extras) return null;
    const contentBox = content.getBoundingClientRect();
    const imageBox = lastImage.getBoundingClientRect();
    const extrasBox = extras.getBoundingClientRect();
    return {
      imageInsideContent: imageBox.bottom <= contentBox.bottom + 1,
      extrasAfterContent: extrasBox.top >= contentBox.bottom - 1
    };
  })).toEqual({ imageInsideContent: true, extrasAfterContent: true });
  await publishingPreview.locator('#copyPlatformHashtags').click();
  await expect.poll(() => page.evaluate(() => window.__copiedVisualHelper)).toBe('#巴哈限定 #圖文');
  await publishingPreview.locator('#editPlatformTitle').click();
  await publishingPreview.locator('#platformPreviewTitleInput').fill('巴哈月下預告');
  await publishingPreview.locator('#savePlatformPreviewTitle').click();
  await expect(publishingPreview.locator('#platformPreviewPublishTitle')).toHaveText('巴哈月下預告');
  await publishingPreview.locator('#cancelPlatformCopy').click();
  await page.locator('#globalSearchBtn').click();
  await page.locator('#globalSearchInput').fill('巴哈月下');
  await expect(page.locator('.global-search-result-type.visual')).toHaveText('發布圖文');
  await page.locator('#globalSearchInput').fill('#夜色');
  await expect(page.locator('.global-search-empty')).toContainText('找不到符合內容');
  await page.locator('#globalSearchInput').fill('#夜色創作');
  await expect(page.locator('.global-search-result-type.visual')).toHaveText('Hashtag');
  await expect(page.locator('.global-search-result small')).toHaveText('分類：#夜色創作');
  await page.locator('#closeGlobalSearch').click();
  await page.locator('.nav-item[data-view="workspace"]').click();

  await page.locator('#visualNewEntryBtn').click();
  const entryDialog = page.getByRole('dialog', { name: '新增圖文' });
  await entryDialog.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(entryDialog).toBeHidden();
  await expect(page.locator('#visualEntryList [data-entry-id]')).toHaveCount(1);

  await page.locator('#visualNewEntryBtn').click();
  await entryDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(entryDialog).toBeHidden();
  await expect(page.locator('#visualEntryList [data-entry-id]')).toHaveCount(1);

  await page.locator('#visualNewEntryBtn').click();
  await entryDialog.locator('#newVisualEntryTitle').fill('準備刪除的草稿');
  await entryDialog.getByRole('button', { name: '新增圖文', exact: true }).click();
  await expect(page.locator('#visualEntryList [data-entry-id]')).toHaveCount(2);
  await page.locator('.nav-item[data-view="publishing"]').click();
  const deletionCard = page.locator('.publish-list-item', { hasText: '準備刪除的草稿' });
  await expect(deletionCard).toBeVisible();
  await deletionCard.getByRole('button', { name: '更多「準備刪除的草稿」操作', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await deletionCard.getByRole('menuitem', { name: '刪除圖文', exact: true }).click();
  await expect(deletionCard).toHaveCount(0);
  const deletion = await page.evaluate(() => ({ removed: window.__removedVisualEntries.length, reasons: window.__visualRecoveryReasons }));
  expect(deletion.removed).toBe(1);
  expect(deletion.reasons).toContain('before-visual-entry-delete');

  await page.locator('.nav-item[data-view="projects"]').click();
  const card = page.locator('.project-library-card', { hasText: '夜色圖文集' });
  await expect(card.locator('.project-type-badge')).toHaveText('圖文');
  await expect(card.getByRole('button', { name: '工作台「夜色圖文集」', exact: true })).toBeVisible();
  const inactiveVisualCard = page.locator('.project-library-card', { hasText: '第二圖文集' });
  await expect(inactiveVisualCard.getByRole('button', { name: '開啟「第二圖文集」', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '管理發布「夜色圖文集」', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '更多「夜色圖文集」操作', exact: true })).toBeVisible();
  await card.getByRole('button', { name: '查看圖文', exact: true }).click();
  await expect(card.locator('.project-chapter-manager-head strong')).toHaveText('圖文');
  const visualDetail = card.locator('.project-visual-entry-row', { hasText: '月下預告' });
  await expect(visualDetail).toContainText('可發布');
  await expect(visualDetail).toContainText('2 張圖片');
  await expect(visualDetail.getByRole('button', { name: '編輯圖文「月下預告」', exact: true })).toBeVisible();
  const worksMore = visualDetail.getByRole('button', { name: '更多「月下預告」操作', exact: true });
  await expect(worksMore).toBeVisible();
  await worksMore.click();
  const worksDelete = visualDetail.getByRole('menuitem', { name: '刪除圖文', exact: true });
  await expect(worksDelete).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await worksDelete.click();
  await expect(card.locator('.project-visual-entry-row')).toHaveCount(0);
  await expect(card.locator('.project-chapter-manager-empty')).toHaveText('目前還沒有圖文。');
  const worksDeletion = await page.evaluate(() => ({
    removed: window.__removedVisualEntries.length,
    recoveryCount: window.__visualRecoveryReasons.filter(reason => reason === 'before-visual-entry-delete').length
  }));
  expect(worksDeletion).toEqual({ removed: 2, recoveryCount: 2 });
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
