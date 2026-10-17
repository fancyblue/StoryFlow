import { expect, test } from '@playwright/test';
import { prepare, gotoWorkbench } from './support/workbench.js';

// What "stays stable" protects is that working in a 24-chapter rail does not cost you your
// place in it — CHROME_ACCEPTANCE states it as "neither the page nor chapter rail jumps to
// the top". This was written as pixel-exact equality instead, a stricter claim than that
// line and than the app can make: rebuilding the list re-clamps the rail by a few pixels,
// which failed about one run in twenty under load. Selection is the app's own re-render, so
// that step keeps a bound, at one row: lose less than a row and you are still looking at what
// you were looking at.
//
// Opening the ⋯ is a different matter and gets no position bound at all. The user agent
// reveals the control it has just focused, scrolling the nearest scrollable ancestor — which
// is this rail — and then the page; a scroll listener catches one event with no script in its
// stack, and forcing the page back puts the menu 74px below the fold. How far it reveals is
// the browser's decision and varies with load, so a bound on it is a bound on nothing: 44px
// held for sixty consecutive runs of this test and was then exceeded at 79px by the same test
// inside the full suite. What the app decides at that step is that the menu lands inside the
// rail and the viewport, opens upward, and moves neither the rail's size nor the splitter —
// all asserted below.
const RAIL_ROW = 44;

test('long chapter rail stays stable and manual add/edit share a large filled editor', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWorkbench(page);
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
  // Selecting a chapter rebuilds the rail. The claim is about where it comes to rest, not
  // about the frame mid-rerender, which drifts under load — so poll the resting position
  // rather than reading whichever frame the first evaluate lands on.
  await expect.poll(() => panel.evaluate((element, before) => Math.max(
    Math.abs(element.scrollTop - before.scrollTop),
    Math.abs(window.scrollY - before.windowY)
  ), beforeSelect), { message: 'the rail and the page come to rest where they were' }).toBeLessThan(RAIL_ROW);

  await page.locator('#chapterList .chapter-more-button').last().click();
  const menu = page.locator('#chapterList .chapter-row-action-menu:not([hidden])');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveClass(/opens-up/);
  // Opening the menu can still be followed by the tail of that rebuild; measure once the
  // menu sits inside both the rail and the window, then check the rest of the layout.
  await expect.poll(() => page.evaluate(() => {
    const source = document.querySelector('.source-panel').getBoundingClientRect();
    const open = document.querySelector('#chapterList .chapter-row-action-menu:not([hidden])');
    if (!open) return 'closed';
    const rect = open.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= Math.min(source.bottom, innerHeight) ? 'inside' : `${Math.round(rect.top)}–${Math.round(rect.bottom)}`;
  }), { message: 'the row menu comes to rest inside the rail and the window' }).toBe('inside');
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
      overflowY: getComputedStyle(source).overflowY
    };
  });
  expect(Math.abs(openLayout.sourceHeight - beforeSelect.height)).toBeLessThanOrEqual(2);
  expect(openLayout.sourceHeight).toBeLessThanOrEqual(openLayout.viewportHeight - 40);
  expect(openLayout.menuTop).toBeGreaterThanOrEqual(0);
  expect(openLayout.menuBottom).toBeLessThanOrEqual(Math.min(openLayout.sourceBottom, openLayout.viewportHeight));
  expect(openLayout.splitterTop).toBeLessThan(openLayout.viewportHeight);
  expect(openLayout.overflowY).toBe('auto');

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
  const activeCard = page.locator('.project-library-card.active');
  await activeCard.getByRole('button', { name: '管理章節', exact: true }).click();
  const manualRow = activeCard.locator('.project-chapter-manager-row').last();
  await expect(manualRow.getByRole('button', { name: /編輯章節/ })).toBeVisible();
  const manualMore = manualRow.getByRole('button', { name: /更多「.*」操作/ });
  await expect(manualMore).toBeVisible();
  await manualMore.click();
  await expect(manualRow.getByRole('menuitem', { name: /刪除章節/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await activeCard.getByRole('button', { name: '收合章節', exact: true }).click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(0, 0);
  await expect.poll(() => activeCard.getByRole('button', { name: '管理章節', exact: true })
    .evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgb(236, 233, 224)');
  // borderColor has its own transition, and the assertions below compare the inactive
  // card's border against the active one's. Waiting only on the active background left
  // the inactive border still animating, so the comparison read two different points of
  // the same fade — rgb(111, 162, 207) against rgb(111, 163, 205).
  await expect.poll(() => page.evaluate(() => {
    const border = selector => getComputedStyle(document.querySelector(selector)).borderColor;
    return border('.project-library-card.active .project-manage-chapters-btn')
      === border('.project-library-card:not(.active) .project-manage-chapters-btn');
  })).toBe(true);
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
  expect(managementStyles.chapters.backgroundColor).toBe('rgb(236, 233, 224)');
  // At rest 管理章節 is Publishing's 管理發布: the ground's fill in --denim-800. Full ink is its
  // hover and open state, as it is that one's; it used to rest in the open state.
  expect(managementStyles.chapters.color).toBe('rgb(58, 53, 68)');
  expect(managementStyles.inactiveChapters.backgroundColor).toBe(managementStyles.chapters.backgroundColor);
  expect(managementStyles.inactiveChapters.borderColor).toBe(managementStyles.chapters.borderColor);
  expect(managementStyles.inactiveChapters.color).toBe(managementStyles.chapters.color);
  expect(managementStyles.publishing.backgroundColor).toBe('rgb(251, 250, 246)');
  expect(managementStyles.publishing.color).toBe('rgb(58, 53, 68)');
  expect(managementStyles.open.height).toBe(managementStyles.chapters.height);
  expect(managementStyles.open.fontSize).toBe(managementStyles.chapters.fontSize);
  expect(managementStyles.open.fontWeight).toBe(managementStyles.chapters.fontWeight);
  expect(managementStyles.open.backgroundColor).toBe('rgb(251, 250, 246)');

  const newWorkStyle = await page.locator('#projectsNewWorkBtn').evaluate(button => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return { height: rect.height, width: rect.width, fontSize: parseFloat(style.fontSize) };
  });
  expect(newWorkStyle.height).toBeLessThanOrEqual(42);
  expect(newWorkStyle.fontSize).toBeGreaterThanOrEqual(14);
  expect(newWorkStyle.width / newWorkStyle.height).toBeLessThan(3.2);
  await expect.poll(() => page.locator('#projectsNewWorkBtn').evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgb(251, 250, 246)');
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

test('reading and seam are one surface that can move an ending without changing the source', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 760 });
  await gotoWorkbench(page);
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

  // 讀稿 is a page, not a modal: the workbench rails collapse instead of being covered.
  await page.locator('#openReadingViewBtn').click();
  const view = page.locator('#readingView');
  await expect(view).toBeVisible();
  await expect(view).toHaveAttribute('data-view', 'read');
  await expect(page.locator('#workspaceView > .workspace-grid')).toBeHidden();
  await expect(view.locator('#readingViewTitle')).toHaveText('六千字長場景');
  await expect(view.locator('.manual-boundary-target')).toHaveCount(0);

  const readingLayout = await view.evaluate(node => {
    const flow = node.querySelector('#readingFlow');
    const actions = node.querySelector('.reading-view-actions');
    const confirm = node.querySelector('#readingConfirmBtn');
    const viewRect = node.getBoundingClientRect();
    return {
      flowHeight: flow.getBoundingClientRect().height,
      flowScrolls: getComputedStyle(flow).overflowY,
      actionsBottom: actions.getBoundingClientRect().bottom,
      confirmBottom: confirm.getBoundingClientRect().bottom,
      viewBottom: viewRect.bottom,
      headLeft: node.querySelector('.reading-view-head').getBoundingClientRect().left,
      flowLeft: flow.getBoundingClientRect().left
    };
  });
  expect(readingLayout.flowHeight).toBeGreaterThan(200);
  expect(readingLayout.flowScrolls).toBe('auto');
  expect(readingLayout.actionsBottom).toBeLessThanOrEqual(readingLayout.viewBottom + 2);
  expect(readingLayout.confirmBottom).toBeLessThanOrEqual(readingLayout.viewBottom + 2);
  // Head and text share one left edge; the width left over is right-hand margin.
  expect(Math.abs(readingLayout.headLeft - readingLayout.flowLeft)).toBeLessThanOrEqual(22);

  // Context is told apart by ink depth in one flow rather than by a second column.
  const tones = await view.evaluate(node => {
    const blocks = [...node.querySelectorAll('#readingFlow .reading-block')];
    return {
      total: blocks.length,
      current: blocks.filter(block => block.classList.contains('is-current')).length,
      ahead: blocks.filter(block => block.classList.contains('is-ahead')).length
    };
  });
  expect(tones.total).toBe(18);
  expect(tones.current).toBe(18);

  await view.getByRole('button', { name: '接縫', exact: true }).click();
  await expect(view).toHaveAttribute('data-view', 'seam');
  await expect(view.locator('#readingViewHint')).toContainText('不修改原稿');
  await expect(view.locator('.manual-boundary-target')).toHaveCount(18);
  await expect(view.locator('.manual-boundary-target.is-current')).toHaveAttribute('data-boundary-end', '18');

  const seamLayout = await view.evaluate(node => {
    const candidates = [...node.querySelectorAll('.manual-boundary-target:not(.is-current)')];
    const current = node.querySelector('.manual-boundary-target.is-current');
    const quietLabel = candidates[0]?.querySelector('.manual-boundary-label');
    const modeControl = node.querySelector('[data-sf-preview-control="reading"]');
    return {
      maxCandidateHeight: Math.max(...candidates.map(target => target.getBoundingClientRect().height)),
      currentHeight: current?.getBoundingClientRect().height || 0,
      quietLabelOpacity: quietLabel ? getComputedStyle(quietLabel).opacity : '',
      modeControlHidden: modeControl ? getComputedStyle(modeControl).display === 'none' : true,
      charsFontSize: parseFloat(getComputedStyle(node.querySelector('#readingCurrentChars')).fontSize)
    };
  });
  expect(seamLayout.maxCandidateHeight).toBeLessThanOrEqual(18);
  expect(seamLayout.currentHeight).toBeLessThanOrEqual(24);
  expect(seamLayout.quietLabelOpacity).toBe('0');
  // Raw Markdown would throw away the cut points this view is made of.
  expect(seamLayout.modeControlHidden).toBe(true);
  expect(seamLayout.charsFontSize).toBeLessThanOrEqual(13);
  await expect.poll(() => view.locator('.manual-boundary-target.is-current').evaluate(marker => {
    const flow = marker.closest('#readingFlow');
    const markerRect = marker.getBoundingClientRect();
    const flowRect = flow?.getBoundingClientRect();
    return Boolean(flowRect && markerRect.top >= flowRect.top && markerRect.bottom <= flowRect.bottom);
  })).toBe(true);

  await view.locator('.manual-boundary-target[data-boundary-end="10"]').click();
  await expect.poll(() => page.evaluate(() => suggestion?.end)).toBe(10);
  await expect(view.locator('#readingCurrentChars')).toContainText(/本篇 .* 字 · 後續 .* 字/);
  await expect(view.locator('#readingFlow .current-range-highlight')).toHaveCount(10);
  await expect(view.locator('#readingFlow .reading-block.is-ahead')).toHaveCount(8);
  await expect(page.locator('#suggestionTitleInput')).toHaveValue('自訂長場景上篇');

  await view.locator('.manual-boundary-target.is-current')
    .dragTo(view.locator('.manual-boundary-target[data-boundary-end="11"]'));
  await expect.poll(() => page.evaluate(() => suggestion?.end)).toBe(11);
  await expect(view.locator('.manual-boundary-target.is-current')).toHaveAttribute('data-boundary-end', '11');

  const result = await page.evaluate(() => ({
    draft: activeChapter().draft,
    title: suggestion?.name,
    start: suggestion?.start,
    end: suggestion?.end
  }));
  expect(result).toEqual({ draft: originalDraft, title: '自訂長場景上篇', start: 0, end: 11 });

  // Switching back is a view change, not the end of a mode: the cut stays where it was put.
  await view.getByRole('button', { name: '讀稿', exact: true }).click();
  await expect(view).toHaveAttribute('data-view', 'read');
  await expect(view.locator('.manual-boundary-target')).toHaveCount(0);
  await expect(page.locator('#readingViewHint')).toBeHidden();
  await expect.poll(() => page.evaluate(() => suggestion?.end)).toBe(11);
  await expect.poll(() => view.locator('#readingFlow .range-end').evaluate(marker => {
    const flow = marker.closest('#readingFlow');
    const markerRect = marker.getBoundingClientRect();
    const flowRect = flow?.getBoundingClientRect();
    return Boolean(flowRect && markerRect.top >= flowRect.top && markerRect.bottom <= flowRect.bottom);
  })).toBe(true);

  await view.getByRole('button', { name: '接縫', exact: true }).click();
  await page.locator('#closeReadingViewBtn').click();
  await expect(view).toBeHidden();
  await expect(page.locator('#workspaceView > .workspace-grid')).toBeVisible();
  await page.locator('#openReadingViewBtn').click();
  await expect(view).toHaveAttribute('data-view', 'read');
  await expect(view.locator('.manual-boundary-target')).toHaveCount(0);

  // A page has no built-in dismissal the way a dialog does, so Escape has to be wired up.
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();

  // The primary action belongs to the reading surface, not to the collapsed panel behind it.
  await page.evaluate(() => {
    window.StoryFlowIntegrations.savePart = async () => 'Works/手動切點測試/六千字長場景/自訂長場景上篇.md';
  });
  await page.locator('#openReadingViewBtn').click();
  await expect(view).toBeVisible();
  await page.locator('#readingConfirmBtn').click();
  await expect(view).toBeHidden();
  await expect.poll(() => page.evaluate(() => activeChapter().parts.length)).toBe(1);
  expect(await page.evaluate(() => activeChapter().parts[0].title)).toBe('自訂長場景上篇');

  // Reading is about one chapter of one work: leaving the workbench closes it rather than
  // leaving the previous chapter's text behind the next destination.
  expect(await view.evaluate(node => Boolean(node.closest('#workspaceView')))).toBe(true);
  await page.locator('#openReadingViewBtn').click();
  await expect(view).toBeVisible();
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(view).toBeHidden();
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect(view).toBeHidden();
  await expect(page.locator('#workspaceView > .workspace-grid')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('canceling a new manual work does not create an empty project', async ({ page }) => {
  const pageErrors = await prepare(page);
  await gotoWorkbench(page);

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
  const typeDialog = page.getByRole('dialog', { name: '選擇作品類型' });
  await typeDialog.locator('#chooseLongformType').click();
  await expect(page.locator('#backSourceCreationBtn')).toBeVisible();
  await page.locator('#backSourceCreationBtn').click();
  await expect(typeDialog).toBeVisible();
  await typeDialog.locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await expect(page.locator('#manualProjectTitleField')).toBeVisible();
  await expect(page.locator('#backManualCreationBtn')).toBeVisible();
  await page.locator('#backManualCreationBtn').click();
  await expect(page.locator('#sourceDialog')).toBeVisible();
  await page.locator('#closeSourceDialog').click();

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

  const preferences = page.locator('#splitSettingsToggle');
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

test('works cards report publishing progress per content type using publishing rules', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWorkbench(page, '/?visual-regression=1');

  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('進度作品');
  await page.locator('#manualSourceTitle').fill('08、印紋');
  await page.locator('#manualSourceText').fill('第一段。\n\n第二段。\n\n第三段。');
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await page.locator('#confirmBtn').click();

  await page.locator('.nav-item[data-view="projects"]').click();
  const progress = page.locator('.project-library-card .project-progress').first();
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('已完成 0 / 1');

  // The card must not invent its own definition of "published": marking every platform
  // through the normal publishing controls is what moves it.
  await page.locator('.nav-item[data-view="publishing"]').click();
  await page.locator('.publish-manage-btn').first().click();
  // The rail's first entry is the default output; marking published is per platform, so
  // each one is selected in turn and marked from the panel beside its content.
  const platformNames = await page.locator('.publish-platform-row:not([data-platform=""])')
    .evaluateAll(rows => rows.map(row => row.dataset.platform));
  expect(platformNames.length).toBeGreaterThan(1);

  const markPublished = async name => {
    if (!(await page.locator('.publish-platform-row').first().isVisible())) {
      await page.locator('.publish-manage-btn').first().click();
    }
    await page.locator(`.publish-platform-row[data-platform="${name}"] .publish-platform-choose`).click();
    await page.locator('#togglePlatformPublished').click();
  };

  // Publishing to some platforms but not all is "部分發布", not done. The card has to
  // agree, or it would be reporting a second, looser definition of finished.
  await markPublished(platformNames[0]);
  await page.locator('.nav-item[data-view="projects"]').click();
  await expect(progress).toContainText('已完成 0 / 1');

  await page.locator('.nav-item[data-view="publishing"]').click();
  for (const name of platformNames.slice(1)) {
    await markPublished(name);
  }

  await page.locator('.nav-item[data-view="projects"]').click();
  await expect(progress).toContainText('已完成 1 / 1');
  // The bar is decorative; the numbers reach assistive technology through one name.
  await expect(progress).toHaveAttribute('aria-label', /已完成 1 \/ 1/);

  // A visual series counts entries, not chapters.
  await page.evaluate(() => {
    window.StoryFlowIntegrations.saveVisualEntry = async payload => 'x/' + payload.entry.id;
  });
  await page.locator('#projectsNewWorkBtn').click();
  const typeDialog = page.locator('#visualTypeDialog');
  await typeDialog.locator('#chooseVisualType').click();
  await typeDialog.locator('#visualSeriesTitle').fill('圖文進度');
  await typeDialog.locator('#visualFirstEntryTitle').fill('月下預告');
  await typeDialog.getByRole('button', { name: '建立圖文系列', exact: true }).click();

  await page.locator('.nav-item[data-view="projects"]').click();
  const visualCard = page.locator('.project-library-card', { hasText: '圖文進度' });
  await expect(visualCard.locator('.project-library-meta')).toContainText('則圖文');
  await expect(visualCard.locator('.project-progress')).toContainText('已完成 0 / 1');

  expect(pageErrors).toEqual([]);
});

// This button used to forward its click to #loadSourceBtn, a control in a source action row
// that project-source-sync.js removed on its first render. The capture handler in
// workspace-project-ux.js was already what opened the chooser; with the row gone, it is the
// only path, so it is pinned here.
test('an empty work offers its first article from the workbench', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => StoryFlowProjects.createProject({ title: '空白作品' }, { quiet: true }));
  await page.locator('.nav-item[data-view="workspace"]').click();

  await page.getByRole('button', { name: '新增第一篇文章', exact: true }).click();
  await expect(page.locator('#sourceDialog')).toBeVisible();
  await expect(page.locator('#sourcePanelActions')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('work creation waits for a connected folder and opens once there is one', async ({ page }) => {
  // No folder stand-in: this test is about the state before one exists.
  const pageErrors = await prepare(page, { connectedFolder: false });
  await gotoWorkbench(page, '/?visual-regression=1');

  const manual = page.locator('#createProjectManually');
  const google = page.locator('#createProjectFromGoogle');
  await expect(manual).toBeVisible();
  await expect(manual).toBeDisabled();
  await expect(google).toBeDisabled();

  // A disabled control has to say why, and the reason is the note the options point at
  // rather than a second copy inside each button.
  await expect(manual).toHaveAttribute('title', /先連接 StoryFlow 資料夾/);
  await expect(manual).toHaveAttribute('aria-describedby', 'projectCreationChooserNote');
  await expect(page.locator('#projectCreationChooserNote')).toContainText('要先連接');

  // Forcing the click past the disabled attribute must still not start a creation flow.
  await manual.click({ force: true });
  await expect(page.locator('#visualTypeDialog')).toBeHidden();
  expect(await page.evaluate(() => window.StoryFlowProjects?.list?.().length ?? 0)).toBe(0);

  // The guard is on the flow, not only on the button, so the programmatic entry point
  // every other control funnels through refuses too.
  expect(await page.evaluate(() => window.StoryFlowStartNewWork())).toBe(false);
  expect(await page.evaluate(() => window.StoryFlowProjects?.list?.().length ?? 0)).toBe(0);

  // Connecting the folder opens the options without a reload.
  await page.evaluate(() => {
    StoryFlowIntegrations.restoreOutputDirectory = async () => ({
      supported: true, connected: true, name: 'StoryFlow 測試資料夾', remembered: true
    });
    return refreshFolderStatus();
  });
  await expect(manual).toBeEnabled();
  await expect(google).toBeEnabled();
  await expect(page.locator('#projectCreationChooserNote')).toContainText('建立後會固定使用');

  expect(pageErrors).toEqual([]);
});

test('the works list keeps its order and its row actions while being managed and filtered', async ({ page }) => {
  // Managing a work makes it current, and the current work used to be pinned to the top of
  // the list. Opening one from the bottom of a scrolled list therefore teleported it to the
  // first row and re-sorted everything around it, which is the whole reason this is pinned:
  // the row has to stay where the reader left it.
  const pageErrors = await prepare(page);
  await gotoWorkbench(page, '/?visual-regression=1');
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('排序甲');
  await page.locator('#manualSourceTitle').fill('01、第一章');
  await page.locator('#manualSourceText').fill('第一段。');
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '排序乙', contentMode: 'longform' }, { quiet: true });
    StoryFlowProjects.createProject({ title: '排序丙圖文', contentMode: 'visual' }, { quiet: true });
    StoryFlowProjects.switchProject(
      StoryFlowProjects.list().find(project => project.title === '排序甲').id, { quiet: true }
    );
  });

  await page.locator('.nav-item[data-view="projects"]').click();
  await expect(page.locator('.project-library-card')).toHaveCount(3);
  const titles = () => page.locator('.project-library-card .project-library-title-row strong')
    .allTextContents().then(list => list.map(text => text.trim()));
  // Which order the collation produces is not the contract and varies with ICU; that it
  // does not change under the reader is. Take it as given and hold it to that.
  const order = await titles();
  expect(order).toHaveLength(3);

  // Manage the last row. It becomes the current work, and it stays where it is.
  const lastTitle = order[2];
  await page.locator('.project-library-card').nth(2)
    .getByRole('button', { name: /^管理(章節|圖文)$/ }).click();
  await expect(page.locator('.project-library-card.active .project-library-title-row strong'))
    .toHaveText(lastTitle);
  await expect.poll(titles).toEqual(order);

  // One label whichever work it is; the current one is named by its badge, not by its action.
  expect([...new Set(await page.locator('.project-open-btn').allTextContents())]).toEqual(['開啟']);
  await expect(page.locator('.project-library-card.active .project-current-badge')).toHaveText('目前作品');

  // The filter narrows the list, and what other modules add to each row survives it: the
  // manage action used to be paired to rows by index against an unfiltered list, and gave
  // up entirely whenever the two counts disagreed.
  await expect(page.locator('#worksTypeFilters [data-content-type="all"]')).toHaveText('全部類型 3');
  await expect(page.locator('#worksTypeFilters [data-content-type="longform"]')).toHaveText('長文 2');
  await expect(page.locator('#worksTypeFilters [data-content-type="visual"]')).toHaveText('圖文 1');

  await page.locator('#worksTypeFilters [data-content-type="visual"]').click();
  await expect.poll(titles).toEqual(['排序丙圖文']);
  await expect(page.locator('.project-manage-chapters-btn')).toHaveCount(1);
  await expect(page.locator('.project-library-more-btn')).toHaveCount(1);

  await page.locator('#worksTypeFilters [data-content-type="longform"]').click();
  await expect.poll(titles).toEqual(order.filter(title => title !== '排序丙圖文'));
  await expect(page.locator('.project-manage-chapters-btn')).toHaveCount(2);

  await page.locator('#worksTypeFilters [data-content-type="all"]').click();
  await expect.poll(titles).toEqual(order);
  expect(pageErrors).toEqual([]);
});

// The reading view is a <pre>, so a scene marker sat at the left margin there while every other
// rendering of the same manuscript — the split preview, the source preview, Publishing —
// centred it. And once a chapter was split to its last paragraph, the empty split panel kept
// whatever it had last said, which was "這個作品還沒有可切篇的章節": the opposite of what
// had just happened.
test('a finished chapter says so, and the reading view centres its scene markers', async ({ page }) => {
  const pageErrors = await prepare(page);
  await gotoWorkbench(page);
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).getByRole('button', { name: /長文作品/ }).click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('切完測試作品');
  await page.locator('#manualSourceTitle').fill('一章');
  await page.locator('#manualSourceText').fill('第一段。\n\n第二段。\n\n第三段。');
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  await expect(page.locator('#chapterListCount')).toHaveText('1 章');

  await page.locator('#openReadingViewBtn').click();
  const separators = page.locator('#readingFlow .reading-scene-separator');
  await expect(separators.first()).toBeVisible();
  // The marker spans the text column and its ink sits in the middle of it. The flow re-renders
  // as the view settles, so query it afresh on each reading rather than holding a node that
  // the next render detaches.
  await expect.poll(() => page.evaluate(() => {
    const node = document.querySelector('#readingFlow .reading-scene-separator');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(node);
    const ink = text.getBoundingClientRect();
    const flow = node.closest('#readingFlow');
    const flowStyle = getComputedStyle(flow);
    const column = flow.clientWidth - parseFloat(flowStyle.paddingLeft) - parseFloat(flowStyle.paddingRight);
    return {
      spansColumn: box.width >= column * 0.8,
      centred: Math.abs((ink.left - box.left) - (box.right - ink.right)) <= 2
    };
  })).toEqual({ spansColumn: true, centred: true });
  // The markup changed, not the text: copy and search still read the marker as written.
  await expect(page.locator('#readingFlow')).toContainText('第一段。');
  await page.locator('#readingView').getByRole('button', { name: '回到工作台' }).click();

  await page.evaluate(() => { window.StoryFlowIntegrations.savePart = async () => 'x.md'; });
  await page.locator('#confirmBtn').click();
  const empty = page.locator('#suggestionEmpty');
  await expect(empty).toBeVisible();
  await expect(empty.locator('strong')).toHaveText('這一章已全部切完');

  // A longform article's summary is written in 摘要與 Hashtags, so that is where an empty one
  // points — not at the visual editor, which an article does not have — and the tool's own
  // placeholder speaks of an article.
  await page.locator('.nav-item[data-view="publishing"]').click();
  const row = page.locator('.publish-list-item').first();
  await row.locator('.publish-manage-btn').click();
  await row.locator('.publish-platform-choose').filter({ hasText: '巴哈小屋' }).click();
  await expect(row.locator('#copyPlatformSummary small')).toHaveText('在「摘要與 Hashtags」設定');
  await row.getByRole('button', { name: '摘要與 Hashtags', exact: true }).click();
  await expect(page.locator('.visual-publish-summary-input')).toHaveAttribute('placeholder', '簡短介紹這篇文章');
  expect(pageErrors).toEqual([]);
});
