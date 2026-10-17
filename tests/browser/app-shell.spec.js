import { expect, test } from '@playwright/test';
import { prepare, gotoWorkbench } from './support/workbench.js';

test('startup and legacy compatibility API preserve browser data', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.addInitScript(() => {
    localStorage.setItem('storyflow.state.v4', 'legacy-workspace-fixture');
    localStorage.setItem('storyflow.googlePickerApiKey', 'legacy-picker-fixture');
    window.__legacyDatabaseDeleteCalls = [];
    Object.defineProperty(indexedDB, 'deleteDatabase', {
      configurable: true,
      value: name => {
        window.__legacyDatabaseDeleteCalls.push(name);
        return {};
      }
    });
  });
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const inspection = await StoryFlowIntegrations.inspectLegacyBrowserStorage();
    const compatibility = await StoryFlowIntegrations.purgeLegacyBrowserStorage();
    return {
      stateValue: localStorage.getItem('storyflow.state.v4'),
      pickerValue: localStorage.getItem('storyflow.googlePickerApiKey'),
      deleteCalls: window.__legacyDatabaseDeleteCalls,
      inspection,
      compatibility
    };
  });

  expect(result.stateValue).toBe('legacy-workspace-fixture');
  expect(result.pickerValue).toBe('legacy-picker-fixture');
  expect(result.deleteCalls).toEqual([]);
  expect(result.inspection.localKeys).toEqual([
    'storyflow.state.v4',
    'storyflow.googlePickerApiKey'
  ]);
  expect(result.compatibility).toMatchObject({
    removed: false,
    reason: 'disabled-for-data-safety',
    hasLegacyData: true
  });
  expect(pageErrors).toEqual([]);
});

// Works is the landing page, but the workbench is what index.html contains, and it used to
// be painted for as long as the modules took to load: the topbar, the source panel and
// the split preview, under a sidebar that already said 作品. Each frame is sampled until
// DOMContentLoaded, by which point every module has run and the landing view is in place.
test('startup paints no workbench before the landing view is ready', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.addInitScript(() => {
    const frames = window.__startupFrames = [];
    let loaded = false;
    document.addEventListener('DOMContentLoaded', () => { loaded = true; }, { once: true });
    const sample = () => {
      if (loaded) return;
      const heading = [...document.querySelectorAll('.topbar h1')]
        .find(node => node.textContent.includes('內容發布工作台'));
      if (heading) {
        const box = heading.getBoundingClientRect();
        frames.push(box.width > 0 && box.height > 0 && getComputedStyle(heading).visibility === 'visible');
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto('/');

  const frames = await page.evaluate(() => window.__startupFrames);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.filter(Boolean)).toEqual([]);
  await expect(page.getByRole('heading', { name: '作品', exact: true })).toBeVisible();
  await expect(page.locator('.main')).toHaveCSS('visibility', 'visible');
  expect(pageErrors).toEqual([]);
});

// The class that hides the main column is removed by app-loader.js. If that file never
// arrives, a blank page would be worse than the flash the class prevents, so the stylesheet
// reveals the column on its own after a few seconds.
test('startup still shows the page when the module loader never arrives', async ({ page }) => {
  await prepare(page);
  await page.route(/\/app-loader\.js/, route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/storyflow-booting/);
  await expect(page.locator('.main')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.main')).toHaveCSS('visibility', 'visible', { timeout: 8000 });
});

test('primary action scale and navigation icon language stay consistent', async ({ page }) => {
  // Advanced settings appear once a folder is connected, so this test keeps the
  // unconfigured state it is describing.
  const pageErrors = await prepare(page, { connectedFolder: false });
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
  // The header action stays visible with no works — W-06 rules out a competing *solid*
  // header action, and this one is outlined. Hiding it removed the only way into creation
  // that does not go through reading the empty state first. With no folder it is disabled,
  // and it has to *look* disabled: the id rule that colours it was overriding the disabled
  // treatment, leaving a control that said why it could not be used and looked usable.
  await expect(page.locator('#projectsNewWorkBtn')).toBeVisible();
  await expect(page.locator('#projectsNewWorkBtn')).toBeDisabled();
  await expect(page.locator('#projectsNewWorkReason')).toHaveText('需要先連接資料夾');
  expect(await controlStyle(page.locator('#projectsNewWorkBtn'))).toMatchObject({
    backgroundColor: 'rgb(244, 241, 233)',
    color: 'rgb(150, 143, 128)'
  });
  expect(emptyWork).toMatchObject({
    height: 40,
    fontSize: 14,
    backgroundColor: 'rgb(75, 69, 87)',
    color: 'rgb(251, 250, 246)'
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publishing-empty')).toContainText('尚未有可發布內容');
  await expect(page.locator('.publishing-empty')).toContainText('文章或第一則圖文');
  await expect(page.locator('.publishing-empty .button')).toHaveText('回到工作台');
  await expect(page.locator('.publishing-empty .button')).toBeVisible();
  expect(await controlStyle(page.locator('.publishing-empty .button'))).toMatchObject({
    height: 40,
    fontSize: 14,
    backgroundColor: 'rgb(75, 69, 87)',
    color: 'rgb(251, 250, 246)'
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
  const rowPreview = publishingRow.getByRole('button', { name: '預覽「樣式測試文章」', exact: true });
  await expect(rowManage).toBeVisible();
  const manageStyle = await controlStyle(rowManage);
  const previewStyle = await controlStyle(rowPreview);
  expect(manageStyle).toMatchObject({
    height: 40,
    fontSize: 14,
    backgroundColor: 'rgb(236, 233, 224)',
    color: 'rgb(58, 53, 68)'
  });
  expect(manageStyle.height).toBe(previewStyle.height);
  expect(manageStyle.fontSize).toBe(previewStyle.fontSize);
  expect(previewStyle.backgroundColor).toBe('rgb(251, 250, 246)');
  await rowManage.click();
  await expect(publishingRow.getByRole('button', { name: /收合.*發布平台/ })).toBeVisible();
  // The button transitions its fill, so read the value it settles on rather than whichever
  // frame of the transition the first reading happens to catch.
  await expect.poll(() => controlStyle(publishingRow.locator('.publish-manage-btn'))).toMatchObject({
    backgroundColor: 'rgb(236, 233, 224)',
    color: 'rgb(34, 31, 26)'
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
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '搜尋 StoryFlow' })).toBeVisible();
  await page.getByRole('button', { name: '關閉搜尋', exact: true }).click();
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
        // The chapter figures moved inside the split panel, so what is checked is that
        // they are there and that nothing sits above the panel in the column any more.
        progressInsideSplitter: Boolean(document.querySelector('.workspace-main-column > .splitter-panel .chapter-progress')),
        progressHeight: document.querySelector('.chapter-progress')?.getBoundingClientRect().height || 0,
        columnTop: document.querySelector('.workspace-main-column')?.getBoundingClientRect().top || 0,
        splitterTop: document.querySelector('.workspace-main-column > .splitter-panel')?.getBoundingClientRect().top || 0
      };
    });
    expect(workspaceLayout.documentWidth).toBeLessThanOrEqual(workspaceLayout.viewportWidth);
    expect(workspaceLayout.hasRightColumn).toBe(true);
    expect(workspaceLayout.progressInsideSplitter).toBe(true);
    expect(workspaceLayout.progressHeight).toBeLessThanOrEqual(50);
    expect(workspaceLayout.splitterTop - workspaceLayout.columnTop).toBeLessThanOrEqual(1);
    expect(workspaceLayout.contentWidth).toBeLessThanOrEqual(1801);
    if (size.width >= 1600) {
      expect(workspaceLayout.sourceWidth).toBeGreaterThanOrEqual(319);
      expect(workspaceLayout.sourceWidth).toBeLessThanOrEqual(381);
    }

    for (const view of ['projects', 'publishing']) {
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      await expect(page.locator(`#${view}View`)).toBeVisible();
      // The view re-renders on its own turn after the switch; measure the page it settles into.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
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

// The four render functions used to be extended by reassignment, and a module that replaced one
// silently dropped every wrapper loaded before it. The pipeline makes the chain a list; this pins
// it, so adding, dropping or reordering a hook is a visible change rather than a load-order
// accident.
test('render functions run one implementation and their hooks in load order', async ({ page }) => {
  const pageErrors = await prepare(page);
  await gotoWorkbench(page);

  const chains = await page.evaluate(() => Object.fromEntries(
    ['renderAll', 'renderChapters', 'renderSuggestion', 'renderParts'].map(name => [name, window.StoryFlowRender.describe(name)])
  ));
  expect(chains).toEqual({
    renderAll: {
      before: [],
      impl: 'renderAll',
      after: ['reading-settings', 'workspace-ux', 'project-source-sync', 'source-article-ux', 'chapter-management', 'workspace-project-ux']
    },
    renderChapters: {
      before: ['chapter-management'],
      impl: 'renderChaptersWithActions',
      after: ['connection-ui', 'chapter-management', 'manual-chapter-edit']
    },
    renderSuggestion: {
      before: ['workspace-interactions'],
      impl: 'renderSuggestion',
      after: ['workspace-interactions', 'smart-split-ui', 'platform-lock', 'boundary-engine', 'app-ux', 'connection-ui', 'reading-settings', 'smart-split-title']
    },
    renderParts: {
      before: ['publishing-lightbox-memory'],
      impl: 'renderPublishingDashboard',
      after: ['publishing-lightbox-sync', 'publishing-disclosure', 'publishing-project-switcher', 'publishing-project-filter']
    }
  });

  // A hook registered again under its key replaces itself instead of running twice.
  const calls = await page.evaluate(() => {
    let count = 0;
    window.StoryFlowRender.after('renderParts', 'test-probe', () => { count += 1; });
    window.StoryFlowRender.after('renderParts', 'test-probe', () => { count += 1; });
    renderParts();
    return count;
  });
  expect(calls).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('manual project can reach workspace, works, publishing, and settings', async ({ page }) => {
  const pageErrors = await prepare(page);
  await gotoWorkbench(page);

  await expect(page.getByRole('heading', { name: '內容發布工作台' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-storyflow-load-error', 'true');
  await expect(page.locator('script[data-storyflow-owner]')).toHaveCount(59);

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
  await expect(page.locator('#settingsLeaveDeviceBtn')).toBeVisible();
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
  await expect(page.locator('.publish-list-item.expanded .publish-preview-panel')).toBeVisible();
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

test('row menus flip up rather than opening past the bottom of the window', async ({ page }) => {
  // One shared positioner now serves the chapter rail, the visual list and the works
  // page. The works-page rows previously had no positioning at all, and the other two
  // measured against their scroll panel only — a panel can extend past the window, so a
  // menu could sit inside its panel and still be off screen.
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '選單版面測試' }, { quiet: true });
    state.chapters = Array.from({ length: 12 }, (_, i) => ({
      id: `menu-chapter-${i + 1}`,
      title: `${String(i + 1).padStart(2, '0')}、章節`,
      draft: `第 ${i + 1} 章。`, confirmedBlockCount: 0, parts: []
    }));
    state.activeChapterId = state.chapters[0].id;
    renderAll();
  });

  await page.locator('.nav-item[data-view="projects"]').click();
  const card = page.locator('.project-library-card', { hasText: '選單版面測試' });
  await card.getByRole('button', { name: '管理章節', exact: true }).click();
  const lastRow = page.locator('.project-chapter-manager-row').last();
  // Put the row hard against the bottom of the window, which is the case that needs the
  // flip. Merely scrolling it into view leaves room below and tests nothing.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const rowBottomGap = await lastRow.evaluate(element =>
    window.innerHeight - element.getBoundingClientRect().bottom);
  expect(rowBottomGap).toBeLessThan(80);

  await lastRow.getByRole('button', { name: /更多/ }).click();
  const menu = lastRow.locator('.chapter-row-action-menu:not([hidden])');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveClass(/opens-up/);
  const fits = await menu.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, viewport: window.innerHeight };
  });
  expect(fits.top).toBeGreaterThanOrEqual(0);
  expect(fits.bottom).toBeLessThanOrEqual(fits.viewport);

  expect(pageErrors).toEqual([]);
});
