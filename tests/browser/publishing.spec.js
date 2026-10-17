import { expect, test } from '@playwright/test';
import { prepare, gotoWorkbench } from './support/workbench.js';

test('publishing counts content types by work even when one work has several entries and keeps filters aligned', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '長文篩選測試' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '測試章節';
    chapter.draft = '測試內容';
    chapter.confirmedBlockCount = 1;
    chapter.parts = [1, 2, 3].map(index => ({
      id: `publishing-filter-part-${index}`,
      title: `測試發布文章 ${index}`,
      chars: 4,
      startBlock: index - 1,
      endBlock: index,
      formatted: '測試內容',
      platformStatus: {}
    }));
    renderAll();
  });

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.getByText('測試發布文章 1', { exact: true })).toBeVisible();
  await expect(page.locator('#publishingContentTypeFilters')).toBeVisible();
  await expect(page.locator('#publishingContentTypeFilters [data-content-type="all"]')).toHaveText('全部類型 1');
  await expect(page.locator('#publishingContentTypeFilters [data-content-type="longform"]')).toHaveText('長文 1');
  await expect(page.locator('#publishingContentTypeFilters [data-content-type="visual"]')).toHaveText('圖文 0');
  await expect(page.locator('#publishingFilters [data-filter="all"]')).toHaveText('全部 3');

  const filterStyles = await page.evaluate(() => [
    '#publishingProjectFilterBtn',
    '#publishingContentTypeFilters [data-content-type="all"]',
    '#publishingFilters [data-filter="all"]'
  ].map(selector => {
    const element = document.querySelector(selector);
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      height: Math.round(element.getBoundingClientRect().height)
    };
  }));
  expect(new Set(filterStyles.map(style => style.fontSize)).size).toBe(1);
  expect(new Set(filterStyles.map(style => style.fontWeight)).size).toBe(1);
  expect(new Set(filterStyles.map(style => style.lineHeight)).size).toBe(1);
  expect(new Set(filterStyles.map(style => style.height)).size).toBe(1);

  const firstCard = page.locator('.publish-list-item', { hasText: '測試發布文章 1' });
  await expect(firstCard.getByRole('button', { name: '預覽「測試發布文章 1」', exact: true })).toBeVisible();
  await expect(firstCard.locator('.publish-list-actions > button:visible')).toHaveText(['預覽', '管理發布', '⋯']);
  await expect(page.locator('.publishing-project-group-title .publishing-project-type-badge')).toHaveText('長文');

  const projectGroup = page.locator('.publishing-project-group', { hasText: '長文篩選測試' });
  const collapseWork = projectGroup.locator('.publishing-project-collapse-btn');
  await expect(collapseWork).toHaveAttribute('aria-label', '收合作品「長文篩選測試」');
  await expect(collapseWork).toHaveAttribute('aria-expanded', 'true');
  await expect(collapseWork).toHaveAttribute('aria-controls', /publishing-project-body-/);
  const collapseGeometry = await collapseWork.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const controls = button.closest('.publishing-project-group-controls').getBoundingClientRect();
    const count = button.closest('.publishing-project-group-controls')
      .querySelector('.publishing-project-group-count').getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      noText: button.textContent.trim() === '',
      contained: rect.left >= controls.left && rect.right <= controls.right,
      followsCount: count.right <= rect.left
    };
  });
  expect(collapseGeometry).toEqual({
    width: 26,
    height: 26,
    noText: true,
    contained: true,
    followsCount: true
  });
  await collapseWork.click();
  await expect(collapseWork).toHaveAttribute('aria-expanded', 'false');
  await expect(collapseWork).toHaveAttribute('aria-label', '展開作品「長文篩選測試」');
  await expect(firstCard).toBeHidden();

  await page.locator('#publishingContentTypeFilters [data-content-type="visual"]').click();
  await expect(page.locator('.publishing-filter-empty')).toContainText('沒有符合目前篩選的內容');
  await page.locator('#publishingContentTypeFilters [data-content-type="all"]').click();
  const expandWork = page.getByRole('button', { name: '展開作品「長文篩選測試」', exact: true });
  await expect(expandWork).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('測試發布文章 3', { exact: true })).toBeHidden();
  await expandWork.click();
  await expect(page.getByText('測試發布文章 3', { exact: true })).toBeVisible();

  await page.locator('#publishingProjectFilterBtn').click();
  const checkbox = page.locator('.publishing-project-filter-option input').first();
  await expect(checkbox).toBeChecked();
  await checkbox.click({ noWaitAfter: true });

  await expect(page.locator('#publishingProjectFilterSummary')).toHaveText('全部');
  await expect(page.locator('.publishing-project-filter-option input').first()).toBeChecked();
  await expect(page.getByText('尚未選擇作品')).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const toolbar = document.querySelector('.publishing-toolbar')?.getBoundingClientRect();
    const stack = document.querySelector('.publishing-filter-stack')?.getBoundingClientRect();
    const actions = document.querySelector('.publishing-toolbar-actions')?.getBoundingClientRect();
    const button = document.getElementById('continuePublishingBtn')?.getBoundingClientRect();
    // Whatever trails the page action: the sort control for a longform work, the hint that
    // explains the fixed order for a visual one. Measuring a specific one breaks the moment
    // the other is the one on screen.
    const trailing = document.querySelector('.publishing-toolbar-actions > *:not([hidden])');
    const hint = trailing?.getBoundingClientRect();
    if (!toolbar || !stack || !actions || !button || !hint || trailing === button) return null;
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

  // Preview is the lightbox's left column, and the rail on the right chooses which version it
  // shows; StoryFlow 預設 is the rail's first entry. Nothing opens on top of the lightbox.
  await card.locator('.publish-platform-row[data-platform=""] .publish-platform-choose').click();
  const preview = card.locator('.publish-preview-panel');
  await expect(preview).toBeVisible();
  await expect(card.locator('.publish-platform-row.is-current')).toHaveAttribute('data-platform', '');
  await expect(preview.locator('#platformPreviewContent')).toContainText('正文原稿。');
  await expect(preview.locator('#platformPreviewContent')).toContainText('後記');
  await expect(preview.locator('#platformPreviewContent')).toContainText('這是寫給讀者的後記。');
  await expect(preview.locator('#platformPreviewSettings')).toBeHidden();
  await expect(preview.locator('#platformPreviewVisualExtras')).toBeHidden();

  const platformRow = card.locator('.publish-platform-row').nth(1);
  await platformRow.locator('.publish-platform-choose').click();
  await expect(platformRow).toHaveClass(/is-current/);
  const include = card.locator('#platformPreviewIncludeAfterword');
  await expect(card.locator('#platformPreviewSettings')).toBeVisible();
  await expect(include).toBeChecked();
  await include.uncheck();
  await expect(card.locator('#platformPreviewContent')).not.toContainText('這是寫給讀者的後記。');
  // The choice belongs to this platform: the rail says so, and every other version — the
  // default output, the next platform — still follows the article and keeps the afterword.
  const platformName = await platformRow.getAttribute('data-platform');
  await expect(platformRow.locator('.publish-platform-afterword-summary')).toHaveText('此平台不附後記');
  const otherRow = card.locator('.publish-platform-row').nth(2);
  await otherRow.locator('.publish-platform-choose').click();
  await expect(card.locator('#platformPreviewIncludeAfterword')).toBeChecked();
  await expect(card.locator('#platformPreviewContent')).toContainText('這是寫給讀者的後記。');
  await platformRow.locator('.publish-platform-choose').click();
  await expect(card.locator('#platformPreviewIncludeAfterword')).not.toBeChecked();
  await expect(card.locator('#platformPreviewContent')).not.toContainText('這是寫給讀者的後記。');

  const stateResult = await page.evaluate(platform => {
    const chapter = state.chapters.find(item => item.title === '後記測試章節');
    chapter.draft = '來源更新後的正文。';
    const part = chapter.parts[0];
    return {
      afterword: part.afterword,
      includeAfterword: part.includeAfterword,
      platformIncludeAfterword: part.platformIncludeAfterword,
      platformOutput: StoryFlowPublishingOutput.forPart(part, platform),
      defaultOutput: StoryFlowPublishingOutput.forPart(part, '')
    };
  }, platformName);
  expect(stateResult).toEqual({
    afterword: '這是寫給讀者的後記。',
    includeAfterword: true,
    platformIncludeAfterword: { [platformName]: false },
    platformOutput: '正文原稿。',
    defaultOutput: '正文原稿。\n\n---\n\n後記\n\n這是寫給讀者的後記。'
  });
  // Ticking it again agrees with the article's default, so the platform follows it once more.
  await card.locator('#platformPreviewIncludeAfterword').check();
  await expect.poll(() => page.evaluate(() => state.chapters.find(item => item.title === '後記測試章節').parts[0].platformIncludeAfterword)).toEqual({});
  await card.locator('#platformPreviewIncludeAfterword').uncheck();

  await page.evaluate(() => {
    window.__afterwordDeleteMessages = [];
    window.confirm = message => {
      window.__afterwordDeleteMessages.push(message);
      return false;
    };
  });
  // Deleting is a row action (⋯ in the queue), so the lightbox closes first.
  await card.getByRole('button', { name: '關閉', exact: true }).click();
  await card.locator('.publish-more-btn').click();
  await card.getByRole('menuitem', { name: '刪除文章', exact: true }).click();
  const deleteMessage = await page.evaluate(() => window.__afterwordDeleteMessages.at(-1));
  expect(deleteMessage).toContain('1 篇有後記');
  expect(deleteMessage).toContain('後記也會一併刪除');
  expect(deleteMessage).toContain('共附有 1 張圖片');
  expect(deleteMessage).toContain('會一併移除；檔案先備份到 Recovery/Assets');
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
  // Recording a publication is about one platform's version, so it happens beside that
  // version: pick it in the rail, then act on it in the left column.
  const platformRow = card.locator('.publish-platform-row[data-platform="巴哈小屋"]');
  await platformRow.locator('.publish-platform-choose').click();
  // Saving the record marks the platform published, which re-renders the list and so
  // rebuilds this panel. A copy option chosen a moment earlier has to survive that.
  await card.getByRole('checkbox', { name: '內容前附上標題' }).check();
  await card.getByRole('button', { name: '記錄「巴哈小屋」發布紀錄', exact: true }).click();

  const dialog = page.locator('#publicationRecordDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#publicationRecordDate')).not.toHaveValue('');
  await dialog.locator('#publicationRecordUrl').fill('example.com/story/1');
  await dialog.getByRole('button', { name: '保存發布紀錄', exact: true }).click();

  await expect(platformRow.getByText('已發布', { exact: true })).toBeVisible();
  await expect(card.getByRole('checkbox', { name: '內容前附上標題' })).toBeChecked();
  await expect(platformRow.locator('.publish-platform-record-summary')).toContainText('已記錄網址');
  await expect(card.getByRole('button', { name: '查看「巴哈小屋」發布紀錄', exact: true })).toBeVisible();

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

  await card.getByRole('button', { name: '查看「巴哈小屋」發布紀錄', exact: true }).click();
  await expect(dialog.locator('#openPublicationRecordUrl')).toHaveAttribute('href', 'https://example.com/story/1');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();

  page.once('dialog', async confirmation => {
    expect(confirmation.message()).toContain('清除已記錄的發布時間與文章網址');
    await confirmation.accept();
  });
  await card.getByRole('button', { name: '取消「巴哈小屋」已發布', exact: true }).click();
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
  const helperButton = card.getByRole('button', { name: '摘要與 Hashtags', exact: true });
  await helperButton.click();
  const helperDialog = page.getByRole('dialog', { name: '摘要與 Hashtags' });
  await helperDialog.locator('.visual-publish-summary-input').fill('長文共用摘要');
  await helperDialog.locator('.visual-publish-hashtags-input').fill('#長文 #共用');
  await helperDialog.getByRole('button', { name: '保存摘要與 Hashtags', exact: true }).click();
  await expect(helperDialog).toBeHidden();
  await expect(card.locator('.publish-summary-hint')).toHaveAttribute('aria-label', '摘要：長文共用摘要');

  const platformRow = card.locator('.publish-platform-row', { hasText: '巴哈小屋' });
  await expect(platformRow.locator('.publish-platform-hashtags')).toHaveText('#長文 #共用');
  await platformRow.locator('.publish-platform-choose').click();
  const preview = card.locator('.publish-preview-panel');
  await expect(platformRow).toHaveClass(/is-current/);
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
      metadataTitle: metadata.parts[0].platformTitles['巴哈小屋'],
      summary: metadata.parts[0].summary,
      hashtags: metadata.parts[0].hashtags,
      tags: metadata.parts[0].tags
    };
  });
  expect(saved).toEqual({
    internalTitle: '內部文章名稱',
    platformTitle: '給讀者看的正式標題',
    otherPlatformTitle: '內部文章名稱',
    output: '只應出現在內容區的正文。',
    metadataVersion: 9,
    metadataTitle: '給讀者看的正式標題',
    summary: '長文共用摘要',
    hashtags: '#長文 #共用',
    tags: ['長文', '共用']
  });

  await expect(preview.locator('#platformPreviewContent')).toHaveText('只應出現在內容區的正文。');
  await expect(preview.locator('#platformPreviewMeta')).toBeHidden();
  await expect(preview.locator('[data-sf-preview-control="publish"]')).toHaveCount(0);
  await expect(preview.locator('#platformPreviewSettings')).toBeVisible();
  await expect(preview.locator('#platformPreviewOptions')).toBeVisible();
  await expect(preview.locator('#platformPreviewSummary')).toHaveText('長文共用摘要');
  await expect(preview.locator('#platformPreviewHashtags')).toHaveText('#長文 #共用');
  await preview.getByRole('button', { name: '複製標題', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('給讀者看的正式標題');
  await preview.getByRole('checkbox', { name: '內容前附上標題' }).check();
  await expect(preview.locator('.sf-md-heading-1')).toHaveText('給讀者看的正式標題');
  await preview.getByRole('button', { name: '複製內容', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('# 給讀者看的正式標題\n\n只應出現在內容區的正文。');

  // Copy options belong to one article-and-platform pairing. Leaving the platform and
  // coming back is a fresh decision, so they start from the default again.
  await card.locator('.publish-platform-row[data-platform=""] .publish-platform-choose').click();
  await card.locator('.publish-platform-row[data-platform="巴哈小屋"] .publish-platform-choose').click();
  await expect(preview.getByRole('checkbox', { name: '內容前附上標題' })).not.toBeChecked();
  await preview.getByRole('checkbox', { name: '內容前附上標題' }).check();
  await preview.locator('#platformPreviewTitleStyle').selectOption('bold');
  await expect(preview.locator('#platformPreviewContent strong')).toHaveText('給讀者看的正式標題');
  await preview.getByRole('button', { name: '複製內容', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedPublishingValue)).toBe('**給讀者看的正式標題**\n\n只應出現在內容區的正文。');
  await page.locator('#sidebarSearchBtn').click();
  await page.locator('#globalSearchInput').fill('#長文');
  await expect(page.locator('.global-search-result-type')).toHaveText('Hashtag');
  await page.locator('#closeGlobalSearch').click();
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
  // The line under the dialog title follows the imports; it used to keep the count it opened with.
  await expect(toolDialog.locator('#publishingArticleToolMeta')).toContainText('2 張圖片');
  // Copying never carries the files, and the manager says so before any image exists, not
  // as a consequence of having some.
  await expect(toolDialog.locator('.article-image-manager-head span')).toContainText('不會隨「複製內容」送出');

  // Both imports came from a file called 插圖.png, so the visible name identifies neither
  // row; the stored id does.
  const idFor = fileName => page.evaluate(name => {
    const part = state.chapters.find(chapter => chapter.title === '圖片章節').parts[0];
    return part.images.find(image => image.fileName === name)?.id;
  }, fileName);
  const namedRow = async name => toolDialog.locator(`.article-image-row[data-image-id="${await idFor(name)}"]`);
  await (await namedRow('插圖.png')).locator('input').nth(0).fill('夜空中的城堡');
  await (await namedRow('插圖.png')).locator('input').nth(1).fill('抵達王都前的夜景');
  await (await namedRow('插圖.png')).getByRole('button', { name: '保存圖片資訊', exact: true }).click();

  // Both images still land in the same place, so ordering between them is meaningful.
  await expect(toolDialog.locator('.article-image-group')).toHaveCount(1);
  await (await namedRow('插圖-2.png')).getByRole('button', { name: '上移', exact: true }).click();
  const reordered = await page.evaluate(() => {
    const part = state.chapters.find(chapter => chapter.title === '圖片章節').parts[0];
    return {
      filenames: part.images.map(image => image.fileName),
      firstAlt: part.images.find(image => image.fileName === '插圖.png').alt,
      metadataVersion: window.__savedArticleMetadata.schemaVersion,
      metadataImages: window.__savedArticleMetadata.parts[0].images.length,
      markdown: window.__savedArticleMarkdown
    };
  });
  expect(reordered.filenames).toEqual(['插圖-2.png', '插圖.png']);
  expect(reordered.firstAlt).toBe('夜空中的城堡');
  expect(reordered.metadataVersion).toBe(9);
  expect(reordered.metadataImages).toBe(2);
  expect(reordered.markdown).toContain('![夜空中的城堡](<./assets/image-test-part/插圖.png>)');
  expect(reordered.markdown).toContain('_抵達王都前的夜景_');

  // Moving one image elsewhere splits the list the way the output is split. Ordering across
  // that line would be meaningless, so it is not offered.
  await (await namedRow('插圖.png')).locator('select').selectOption('before-body');
  await (await namedRow('插圖.png')).getByRole('button', { name: '保存圖片資訊', exact: true }).click();
  await expect(toolDialog.locator('.article-image-group')).toHaveCount(2);
  await expect(toolDialog.locator('.article-image-group').first()).toHaveAttribute('data-placement', 'before-body');
  await expect(toolDialog.locator('.article-image-group-head strong').first()).toHaveText('正文前');
  await expect((await namedRow('插圖.png')).getByRole('button', { name: '上移', exact: true })).toBeDisabled();
  await expect((await namedRow('插圖.png')).getByRole('button', { name: '下移', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => {
    const part = state.chapters.find(chapter => chapter.title === '圖片章節').parts[0];
    return part.images.find(image => image.fileName === '插圖.png').placement;
  })).toBe('before-body');

  await (await namedRow('插圖.png')).getByRole('button', { name: '複製 Markdown', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedImageMarkdown)).toContain('夜空中的城堡');

  await toolDialog.getByRole('button', { name: '完成', exact: true }).click();
  await card.locator('.publish-platform-row[data-platform=""] .publish-platform-choose').click();
  const preview = card.locator('.publish-preview-panel');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.platform-preview-image')).toHaveCount(2);
  await expect(preview.locator('#platformPreviewContent')).toContainText('圖片文章正文。');
  await expect(preview.locator('#platformPreviewContent')).toContainText('抵達王都前的夜景');
  await expect(preview.locator('.platform-preview-image-notice')).toContainText('逐張上傳');
  await preview.locator('.platform-preview-image img').first().click();
  await expect(page.locator('#articleImageLightbox')).toBeVisible();
  await page.getByRole('button', { name: '關閉圖片', exact: true }).click();

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

  // Removing an image deletes the file, backed up first. There is no "detach only"
  // branch any more: choosing between keeping and deleting StoryFlow's own copy was a
  // decision about its filing, not about the manuscript.
  await toolDialog.locator('.article-image-row').first().getByRole('button', { name: '移除', exact: true }).click();
  const removeDialog = page.locator('#articleImageRemoveDialog');
  await expect(removeDialog).toBeVisible();
  await expect(removeDialog.getByRole('button', { name: '只從文章移除' })).toHaveCount(0);
  await removeDialog.getByRole('button', { name: '移除圖片', exact: true }).click();
  await expect(toolDialog.locator('.article-image-row')).toHaveCount(1);

  await toolDialog.locator('.article-image-row').first().getByRole('button', { name: '移除', exact: true }).click();
  await removeDialog.getByRole('button', { name: '移除圖片', exact: true }).click();
  await expect(toolDialog.locator('.article-image-row')).toHaveCount(0);
  const removed = await page.evaluate(() => ({
    deleted: window.__deletedImageFiles,
    remainingState: state.chapters.find(chapter => chapter.title === '圖片章節').parts[0].images.length,
    finalMarkdown: window.__savedArticleMarkdown
  }));
  expect(removed.deleted.sort()).toEqual(['插圖-2.png', '插圖.png']);
  expect(removed.remainingState).toBe(0);
  expect(removed.finalMarkdown).toBe('圖片文章正文。');
  expect(pageErrors).toEqual([]);
});

test('publishing order can follow chapters, and the choice follows the writer not the work', async ({ page }) => {
  // The queue could only be read newest-first, which is the wrong end to start from when
  // publishing a backlog. Neither option reads a timestamp: a longform part carries none, so
  // both are directions through the same document order.
  const pageErrors = await prepare(page);
  await gotoWorkbench(page, '/?visual-regression=1');
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('排序測試');
  await page.locator('#manualSourceTitle').fill('01、第一章');
  await page.locator('#manualSourceText').fill('第一段。\n\n第二段。');
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  await page.evaluate(() => { window.StoryFlowIntegrations.savePart = async () => 'x.md'; });
  await page.locator('#confirmBtn').click();

  await page.evaluate(() => {
    const first = state.chapters[0];
    const clone = JSON.parse(JSON.stringify(first.parts[0]));
    clone.id = 'sort-part-2';
    clone.title = '02、第二章（1）';
    state.chapters.push({
      ...JSON.parse(JSON.stringify(first)), id: 'sort-chapter-2', title: '02、第二章', parts: [clone]
    });
    window.renderAll?.();
  });

  // Each chapter holds one part, so neither has a header of its own: the order is read from
  // the rows, by the chapter number their titles start with.
  const chapterOrder = () => page.evaluate(() =>
    [...document.querySelectorAll('.publishing-project-group-body .publish-list-title-row strong')]
      .map(node => node.textContent.trim().slice(0, 2)));

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('#publishingSortControl')).toBeVisible();
  await expect(page.getByRole('button', { name: '最新在前', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Polled, not read once. The pressed state lands with the click; the list behind it is
  // re-rendered through wrappers that run on their own turn of the event loop, so a single
  // reading can be taken before the order it is asserting has been drawn. Seen as a flaky
  // pass on CI, where the retry then succeeded.
  await expect.poll(chapterOrder).toEqual(['02', '01']);
  // A one-part chapter is a row, not a header over a row that repeats it.
  await expect(page.locator('#publishingView .publishing-chapter-group')).toHaveCount(0);

  await page.getByRole('button', { name: '章節順序', exact: true }).click();
  await expect(page.getByRole('button', { name: '章節順序', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(chapterOrder).toEqual(['01', '02']);

  // It belongs to the writer, not to one work: switchProject() replaces `state` wholesale, so
  // carrying it has to be deliberate, the way the split preferences above it already are.
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '另一個作品' }, { quiet: true });
  });
  expect(await page.evaluate(() => state.publishSort)).toBe('chapter');
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.getByRole('button', { name: '章節順序', exact: true })).toHaveAttribute('aria-pressed', 'true');

  expect(pageErrors).toEqual([]);
});

test('a visual work is not offered an order it has no chapters for', async ({ page }) => {
  const pageErrors = await prepare(page);
  await gotoWorkbench(page, '/?visual-regression=1');
  await page.locator('#createProjectManually').click();
  // The dialog renames itself once a type is chosen, so it is addressed by id rather than
  // by the name it is about to stop having.
  const typeDialog = page.locator('#visualTypeDialog');
  await typeDialog.locator('#chooseVisualType').click();
  await expect(typeDialog.locator('#visualSeriesCreatePanel')).toBeVisible();
  await typeDialog.locator('#visualSeriesTitle').fill('圖文排序測試');
  await typeDialog.locator('#visualFirstEntryTitle').fill('月下預告');
  await typeDialog.getByRole('button', { name: '建立圖文系列', exact: true }).click();
  await page.locator('.nav-item[data-view="publishing"]').click();

  // Visual entries have no chapters, and unlike parts they do carry updatedAt, so the order
  // is fixed and the sentence that explains it stays.
  await expect(page.locator('#publishingSortControl')).toBeHidden();
  await expect(page.locator('.publishing-toolbar-hint')).toHaveText('最近編輯的圖文顯示在最上面。');

  expect(pageErrors).toEqual([]);
});

// Third review pass. Publishing fixed its work selection the first time it rendered, so a work
// created afterwards — the current one included — was left out of 全部 until it was ticked by
// hand; its order control followed whichever work was active rather than what was listed; a
// visual entry's scene marker sat at the left margin where an article's is centred; and editing
// a chapter kept the creation flow's 返回建立方式.
test('publishing lists every work, orders what it lists, and editing a chapter is not creating one', async ({ page }) => {
  const pageErrors = await prepare(page);
  await gotoWorkbench(page, '/?visual-regression=1');
  await page.evaluate(() => {
    StoryFlowIntegrations.savePart = async () => 'x.md';
    StoryFlowIntegrations.saveVisualEntry = async payload => `W/${payload.entry.id}`;
  });
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).getByRole('button', { name: /長文作品/ }).click();
  await page.locator('#sourceManualBtn').click();
  await expect(page.locator('#backManualCreationBtn')).toBeVisible();
  await page.locator('#manualProjectTitle').fill('先建的長文');
  await page.locator('#manualSourceTitle').fill('第一章');
  await page.locator('#manualSourceText').fill('第一段。\n\n第二段。');
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  await page.locator('#confirmBtn').click();

  await page.locator('#chapterList .chapter-more-button').first().click();
  await page.getByRole('menuitem', { name: /編輯章節/ }).first().click();
  await expect(page.locator('#manualSourceDialog')).toHaveAttribute('data-edit-chapter-id', /.+/);
  await expect(page.locator('#backManualCreationBtn')).toBeHidden();
  await expect(page.locator('#manualProjectTitle')).toBeHidden();
  await page.locator('#cancelManualChapterEditBtn').click();

  // Publishing sees the one work first, then a visual work created after that visit.
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publishing-project-group')).toHaveCount(1);
  await page.evaluate(() => StoryFlowProjects.createProject({ title: '後建的圖文', contentMode: 'visual' }, { quiet: true }));
  await page.locator('.nav-item[data-view="workspace"]').click();
  await page.locator('#visualNewEntryBtn').click();
  await page.locator('#newVisualEntryTitle').fill('月下預告');
  await page.locator('#confirmNewVisualEntry').click();
  await page.locator('#visualEntryBody').fill('月光落在城牆上。\n\n第二段圖文內容。');
  await expect(page.locator('#visualEditorSaveStatus')).toContainText('已儲存');

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publishing-project-group')).toHaveCount(2);
  await expect(page.locator('#publishingProjectFilterSummary')).toHaveText('全部');
  // A visual work is active, but chapters are listed, so chapter order means something.
  await expect(page.locator('#publishingSortControl')).toBeVisible();
  await expect(page.locator('.publishing-toolbar-hint')).toBeHidden();
  await page.locator('#publishingContentTypeFilters [data-content-type="visual"]').click();
  await expect(page.locator('#publishingSortControl')).toBeHidden();
  await expect(page.locator('.publishing-toolbar-hint')).toBeVisible();
  await page.locator('#publishingContentTypeFilters [data-content-type="all"]').click();

  const visualRow = page.locator('.publish-list-item', { hasText: '月下預告' }).first();
  await visualRow.locator('.publish-manage-btn').click();
  const scene = visualRow.locator('.visual-publish-copy .visual-publish-scene').first();
  await expect(scene).toBeVisible();
  await expect.poll(() => scene.evaluate(node => ({
    align: getComputedStyle(node).textAlign,
    spans: Math.abs(node.getBoundingClientRect().width - node.parentElement.getBoundingClientRect().width) <= 1
  }))).toEqual({ align: 'center', spans: true });
  // Copy is unchanged: the marker is still the text the writer will paste.
  await expect(visualRow.locator('.visual-publish-copy')).toContainText('＊＊＊');
  expect(pageErrors).toEqual([]);
});

// 完成 closed a tool and nothing else, so an afterword or a summary typed and not yet saved
// with the button inside the dialog was dropped without a word — while "完成" read as "it is
// done, it is kept". Every way out now keeps what is pending: 完成, ✕ and Esc.
test('closing a publishing tool keeps what was typed in it', async ({ page }) => {
  const pageErrors = await prepare(page);
  await gotoWorkbench(page, '/?visual-regression=1');
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '關閉保存測試' }, { quiet: true });
    state.chapters = [{
      id: 'close-keeps-chapter', title: '第一章', draft: '正文原稿。', confirmedBlockCount: 1,
      parts: [{
        id: 'close-keeps-part', title: '關閉保存文章', chars: 5, startBlock: 0, endBlock: 1,
        raw: '正文原稿。', formatted: '正文原稿。', published: false, platformStatus: {},
        images: [{
          id: 'close-keeps-image', fileName: 'kept.png', originalName: 'kept.png',
          relativePath: './assets/close-keeps-part/kept.png', mimeType: 'image/png',
          size: 100, width: 1, height: 1, alt: '原本的替代文字', caption: '', placement: 'after-body'
        }]
      }]
    }];
    state.activeChapterId = 'close-keeps-chapter';
    renderAll();
  });
  const part = () => page.evaluate(() => state.chapters[0].parts[0]);

  await page.locator('.nav-item[data-view="publishing"]').click();
  const card = page.locator('.publish-list-item', { hasText: '關閉保存文章' });
  await card.getByRole('button', { name: /展開.*發布平台/ }).click();
  const toolDialog = page.locator('#publishingArticleToolDialog');

  // 完成 keeps an afterword nobody pressed 保存後記 for.
  await card.getByRole('button', { name: '後記', exact: true }).click();
  await toolDialog.locator('.publish-afterword-editor textarea').fill('寫給讀者的後記。');
  await toolDialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(toolDialog).toBeHidden();
  await expect.poll(async () => (await part()).afterword).toBe('寫給讀者的後記。');

  // Esc keeps a summary and Hashtags.
  await card.getByRole('button', { name: '摘要與 Hashtags', exact: true }).click();
  await toolDialog.locator('.visual-publish-summary-input').fill('一句話的摘要');
  await toolDialog.locator('.visual-publish-hashtags-input').fill('#關閉 #保存');
  await page.keyboard.press('Escape');
  await expect(toolDialog).toBeHidden();
  await expect.poll(async () => {
    const current = await part();
    return [current.summary, current.hashtags];
  }).toEqual(['一句話的摘要', '#關閉 #保存']);

  // ✕ keeps an image's edited alt text.
  await card.getByRole('button', { name: /^文章圖片/ }).click();
  await toolDialog.getByRole('textbox', { name: 'kept.png 的替代文字' }).fill('改過的替代文字');
  await toolDialog.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(toolDialog).toBeHidden();
  await expect.poll(async () => (await part()).images[0].alt).toBe('改過的替代文字');

  // Closing with nothing changed writes nothing and still closes.
  await card.getByRole('button', { name: /^後記/ }).click();
  await toolDialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(toolDialog).toBeHidden();
  expect(pageErrors).toEqual([]);
});
