import { expect, test } from '@playwright/test';
import { prepare, gotoWorkbench } from './support/workbench.js';

test('visual metadata stores afterword and its platform-output preference', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');

  const metadata = await page.evaluate(async () => {
    const writtenFiles = new Map();
    const makeDirectory = path => ({
      kind: 'directory',
      name: path.split('/').filter(Boolean).at(-1) || 'StoryFlow-test',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getDirectoryHandle: async name => makeDirectory(`${path}/${name}`),
      getFileHandle: async (name, options = {}) => {
        const filePath = `${path}/${name}`;
        if (!options.create && !writtenFiles.has(filePath)) {
          throw new DOMException(`File not found: ${name}`, 'NotFoundError');
        }
        return {
          kind: 'file',
          name,
          getFile: async () => ({
            text: async () => writtenFiles.get(filePath) || ''
          }),
          createWritable: async () => ({
            write: async value => writtenFiles.set(filePath, String(value)),
            close: async () => {}
          })
        };
      }
    });
    const root = makeDirectory('StoryFlow-test');
    window.showDirectoryPicker = async () => root;
    await StoryFlowIntegrations.chooseOutputDirectory();

    await StoryFlowIntegrations.saveVisualEntry({
      projectTitle: '安全測試作品',
      entry: {
        id: 'visual-afterword-metadata',
        title: '圖文後記測試',
        body: '圖文正文',
        afterword: '獨立保存的圖文後記',
        includeAfterword: false,
        images: []
      }
    });

    const metadataText = [...writtenFiles.entries()]
      .find(([path]) => path.endsWith('/metadata.json'))?.[1];
    return JSON.parse(metadataText);
  });

  expect(metadata).toMatchObject({
    id: 'visual-afterword-metadata',
    afterword: '獨立保存的圖文後記',
    includeAfterword: false
  });
  expect(metadata).not.toHaveProperty('status');
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
  await gotoWorkbench(page);
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
  await expect(page.locator('#workspaceView > .topbar')).toBeVisible();
  await expect(page.locator('#workspaceView > .topbar').getByRole('heading', { name: '圖文工作台', exact: true })).toBeVisible();
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  await expect(page.locator('#visualWorkspace > .visual-workspace-head')).toHaveCount(0);
  await expect(page.locator('#saveState')).toBeHidden();
  await expect(page.locator('#saveBtn')).toBeHidden();
  await expect(page.locator('#generateBtn')).toBeHidden();
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
  // Geometry after an edit re-renders the list: poll the settled layout, not one frame of it.
  await expect.poll(() => page.locator('.visual-entry-list-panel').evaluate(panel => {
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
  // The summary is written about the entry, so it is written here. Hashtags are not: a
  // platform may override them, so they stay with publishing.
  await expect(page.locator('#visualEntrySummary')).toHaveCount(1);
  await expect(page.locator('#visualEntryHashtags')).toHaveCount(0);
  await expect(page.locator('#visualEntryStatus')).toHaveCount(0);
  await expect(page.locator('#visualEntryStatusHelp')).toHaveCount(0);
  await expect(page.locator('#visualSaveEntryBtn')).toHaveCount(0);
  await expect(page.locator('#visualEditorSaveStatus')).toContainText(/已儲存|儲存中/);
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
  await expect(page.locator('#visualEditorSaveStatus')).toContainText(/尚未儲存|儲存中/);
  await expect.poll(() => page.evaluate(() => window.__savedVisualEntry?.entry?.body))
    .toBe('月光落在城牆上。\n\n第二段圖文內容。');
  await expect(page.locator('#visualEditorSaveStatus')).toContainText('已儲存');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8xQAAAAASUVORK5CYII=', 'base64');
  await page.locator('#visualImageInput').setInputFiles([
    { name: '插圖.png', mimeType: 'image/png', buffer: png },
    { name: '插圖.png', mimeType: 'image/png', buffer: png }
  ]);
  await expect(page.locator('.visual-image-card')).toHaveCount(2);
  await expect(page.locator('.visual-image-card').first()).toHaveAttribute('draggable', 'true');

  await page.locator('.visual-image-card').first().getByRole('button', { name: '編輯', exact: true }).click();
  const imageDialog = page.getByRole('dialog', { name: '編輯圖片資訊' });
  // Deleting the file wears the destructive colour and stands apart from saving, on the left
  // with the other way of removing the image.
  await expect.poll(() => imageDialog.evaluate(dialog => {
    const remove = dialog.querySelector('#visualDeleteImageFile').getBoundingClientRect();
    const save = dialog.querySelector('#visualSaveImageMeta').getBoundingClientRect();
    return {
      color: getComputedStyle(dialog.querySelector('#visualDeleteImageFile')).color,
      apart: save.left - remove.right > 24
    };
  })).toEqual({ color: 'rgb(168, 68, 58)', apart: true });
  await imageDialog.locator('#visualImageAlt').fill('月光下的城堡');
  await imageDialog.locator('#visualImageCaption').fill('夜色系列封面');
  await imageDialog.locator('#visualImageCover').check();
  await imageDialog.getByRole('button', { name: '保存圖片資訊', exact: true }).click();
  await expect(page.locator('.visual-image-card').first()).toContainText('月光下的城堡');
  await expect(page.locator('.visual-image-card').first()).toContainText('封面');

  await page.locator('.visual-image-card').nth(1).getByRole('button', { name: '向前移動', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__savedVisualEntry?.entry?.images?.map(image => image.storedName)))
    .toEqual(['插圖-2.png', '插圖.png']);
  await expect(page.locator('#visualEditorSaveStatus')).toContainText('已儲存');
  await expect(page.locator('#visualOpenPublishingBtn')).toHaveCount(0);
  await expect(page.locator('#visualPreviewEntryBtn')).toBeVisible();
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
    hasLegacyStatus: Object.prototype.hasOwnProperty.call(state.visualEntries[0], 'status'),
    order: state.visualEntries[0].images.map(image => image.storedName),
    cover: state.visualEntries[0].coverImageId,
    firstImageId: state.visualEntries[0].images[0].id
  }));
  expect(stored).toMatchObject({
    mode: 'visual', chapters: 0, entryCount: 1, hasLegacyStatus: false,
    order: ['插圖-2.png', '插圖.png']
  });
  expect(stored.cover).not.toBe(stored.firstImageId);

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('#publishingContentTypeFilters [data-content-type="visual"]')).toContainText('圖文 1');
  await expect(page.locator('.publishing-project-group-title .publishing-project-type-badge')).toHaveText('圖文');
  const publishCard = page.locator('.publish-list-item', { hasText: '月下預告' });
  await expect(publishCard).toBeVisible();
  await expect(publishCard.locator('.publish-content-type')).toHaveText('圖文');
  const defaultVisualPreview = publishCard.getByRole('button', { name: '預覽「月下預告」', exact: true });
  await expect(defaultVisualPreview).toBeVisible();
  await expect(publishCard.locator('.publish-list-actions > button:visible')).toHaveText(['預覽', '管理發布', '⋯']);
  await expect(publishCard.getByRole('button', { name: '更多「月下預告」操作', exact: true })).toBeVisible();
  await defaultVisualPreview.click();
  const plainVisualPreview = publishCard.locator('.publish-preview-panel');
  await expect(plainVisualPreview.locator('#platformPreviewTitle')).toHaveText('預覽');
  await expect(plainVisualPreview.locator('#platformPreviewSettings')).toBeHidden();
  await expect(plainVisualPreview.locator('#platformPreviewVisualExtras')).toBeHidden();
  await publishCard.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(plainVisualPreview).toHaveCount(0);
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
  // Opening moves focus into the lightbox that opened over the row.
  await expect(publishCard.getByRole('button', { name: '關閉', exact: true })).toBeFocused();
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
  await publishCard.getByRole('button', { name: '後記', exact: true }).click();
  const visualAfterwordDialog = page.getByRole('dialog', { name: '後記' });
  await visualAfterwordDialog.locator('.publish-afterword-input').fill('圖文也有後記。');
  await visualAfterwordDialog.getByRole('button', { name: '保存後記', exact: true }).click();
  await expect(visualAfterwordDialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => state.visualEntries[0].afterword)).toBe('圖文也有後記。');
  // The rail lists the default output first, then one entry per platform.
  await expect(publishCard.locator('.publish-platform-row')).toHaveCount(3);
  await expect(publishCard.locator('.publish-platform-row').first()).toHaveAttribute('data-platform', '');
  const firstPlatformRow = publishCard.locator('.publish-platform-row[data-platform="巴哈小屋"]');
  const platformHashtags = firstPlatformRow.locator('.publish-platform-hashtags');
  await expect(platformHashtags).toHaveText('#StoryFlow #夜色創作');
  await platformHashtags.click();
  await expect.poll(() => page.evaluate(() => window.__copiedVisualHelper)).toBe('#StoryFlow #夜色創作');

  await firstPlatformRow.locator('.publish-platform-choose').click();
  const publishingPreview = publishCard.locator('.publish-preview-panel');
  await expect(publishingPreview).toBeVisible();
  await expect(publishingPreview.locator('#platformPreviewSettings')).toBeVisible();
  await expect(publishingPreview.locator('#platformPreviewOptions')).toBeVisible();
  await expect(publishingPreview.locator('#platformPreviewMeta')).toBeHidden();
  await expect(publishingPreview.locator('[data-sf-preview-control="publish"]')).toHaveCount(0);
  // The summary is authored in the visual editor, so the preview only shows and copies it.
  await expect(publishingPreview.locator('#platformPreviewSummaryBlock')).toBeVisible();
  await expect(publishingPreview.locator('#editPlatformPreviewSummary')).toHaveCount(0);
  await expect(publishingPreview.locator('#platformPreviewHashtagsEditor')).toBeHidden();
  expect(await publishingPreview.evaluate(panel => {
    const body = panel.querySelector('.platform-preview-body');
    const contentHead = panel.querySelector('.platform-preview-content-head');
    const content = panel.querySelector('#platformPreviewContent');
    const extras = panel.querySelector('#platformPreviewVisualExtras');
    const hashtagsEditor = panel.querySelector('#platformPreviewHashtagsEditor');
    const rows = [...panel.querySelectorAll('.platform-preview-extra-row')];
    const buttonsContained = rows.every(row => {
      const rowBox = row.getBoundingClientRect();
      const button = row.querySelector(':scope > .button');
      if (!button) return true;
      const buttonBox = button.getBoundingClientRect();
      return buttonBox.left >= rowBox.left - 1 && buttonBox.right <= rowBox.right + 1
        && buttonBox.top >= rowBox.top - 1 && buttonBox.bottom <= rowBox.bottom + 1;
    });
    return {
      contentBeforeEditors: Boolean(content && extras && hashtagsEditor
        && (content.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING)
        && (content.compareDocumentPosition(hashtagsEditor) & Node.DOCUMENT_POSITION_FOLLOWING)),
      compactTop: Boolean(body && contentHead && contentHead.getBoundingClientRect().top - body.getBoundingClientRect().top <= 170),
      buttonsContained
    };
  })).toEqual({ contentBeforeEditors: true, compactTop: true, buttonsContained: true });

  // Editing it happens where the entry is written, and the preview reflects that.
  await page.locator('.nav-item[data-view="workspace"]').click();
  await page.locator('#visualEntrySummary').fill('更新後的月光摘要');
  await expect.poll(() => page.evaluate(() => state.visualEntries[0].summary)).toBe('更新後的月光摘要');
  // The row and the platform it was left on both survive the trip, so coming back shows the
  // same version with the new summary in it.
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(firstPlatformRow).toHaveClass(/is-current/);
  await expect(publishingPreview.locator('#platformPreviewSummary')).toHaveText('更新後的月光摘要');
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
  await expect(publishCard.locator('.publish-platform-row[data-platform="方格子"] .publish-platform-hashtags')).toHaveText('#StoryFlow #夜色創作');

  // Everything you can do to the selected version sits beside the version itself.
  expect(await publishingPreview.locator('.platform-preview-actions .button:visible').allTextContents()).toEqual(['記錄發布', '標註已發布', '複製內容']);
  await expect(publishingPreview.locator('.visual-upload-order')).toContainText('圖片不會被複製或自動上傳');
  await expect(publishingPreview.locator('.visual-upload-order li')).toHaveCount(2);
  await expect(publishingPreview.locator('#platformPreviewSummary')).toHaveText('更新後的月光摘要');
  await expect(publishingPreview.locator('#platformPreviewHashtags')).toHaveText('#巴哈限定 #圖文');
  await expect(publishingPreview.locator('#platformPreviewIncludeAfterword')).toBeChecked();
  await expect(publishingPreview.locator('#platformPreviewContent')).toContainText('圖文也有後記。');
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
  await page.locator('#sidebarSearchBtn').click();
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
  await entryDialog.locator('#newVisualEntryTitle').fill('準備刪除的圖文');
  await entryDialog.getByRole('button', { name: '新增圖文', exact: true }).click();
  await expect(page.locator('#visualEntryList [data-entry-id]')).toHaveCount(2);
  await page.locator('.nav-item[data-view="publishing"]').click();
  const deletionCard = page.locator('.publish-list-item', { hasText: '準備刪除的圖文' });
  await expect(deletionCard).toBeVisible();
  await expect(deletionCard.locator('.publish-readiness-badge')).toHaveText('內容尚未完成');
  // 月下預告 is still open from before the trip to the workbench; its lightbox covers the queue.
  await page.locator('.publish-lightbox:not([hidden])').getByRole('button', { name: '關閉', exact: true }).click();
  await deletionCard.getByRole('button', { name: '展開「準備刪除的圖文」的發布平台', exact: true }).click();
  await deletionCard.locator('.publish-platform-row[data-platform="巴哈小屋"] .publish-platform-choose').click();
  await expect(deletionCard.locator('#togglePlatformPublished')).toBeDisabled();
  await expect(deletionCard.locator('#platformPreviewRecordBtn')).toBeDisabled();
  await deletionCard.getByRole('button', { name: '關閉', exact: true }).click();
  await deletionCard.getByRole('button', { name: '更多「準備刪除的圖文」操作', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await deletionCard.getByRole('menuitem', { name: '刪除圖文', exact: true }).click();
  await expect(deletionCard).toHaveCount(0);
  const deletion = await page.evaluate(() => ({ removed: window.__removedVisualEntries.length, reasons: window.__visualRecoveryReasons }));
  expect(deletion.removed).toBe(1);
  expect(deletion.reasons).toContain('before-visual-entry-delete');

  await page.locator('.nav-item[data-view="projects"]').click();
  const card = page.locator('.project-library-card', { hasText: '夜色圖文集' });
  await expect(card.locator('.project-type-badge')).toHaveText('圖文');
  // One label whichever work it is, current or not: the destination is the same, and the
  // row says which one is current with its tint, its marker and its 目前作品 badge.
  await expect(card.getByRole('button', { name: '開啟「夜色圖文集」', exact: true })).toBeVisible();
  const inactiveVisualCard = page.locator('.project-library-card', { hasText: '第二圖文集' });
  await expect(inactiveVisualCard.getByRole('button', { name: '開啟「第二圖文集」', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '管理發布「夜色圖文集」', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '更多「夜色圖文集」操作', exact: true })).toBeVisible();
  await card.getByRole('button', { name: '管理圖文', exact: true }).click();
  await expect(card.locator('.project-chapter-manager-head strong')).toHaveText('圖文');
  const visualDetail = card.locator('.project-visual-entry-row', { hasText: '月下預告' });
  await expect(visualDetail).toContainText('內容完整');
  await expect(visualDetail).not.toContainText(/草稿|可發布/);
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

  await inactiveVisualCard.getByRole('button', { name: '管理圖文', exact: true }).click();
  await expect(inactiveVisualCard).toHaveClass(/active/);
  await expect(inactiveVisualCard.getByRole('button', {
    name: '更多「第二圖文集」操作',
    exact: true
  })).toBeVisible();
  await expect(inactiveVisualCard.locator('.project-chapter-manager-empty')).toHaveText('目前還沒有圖文。');
  await expect(pageErrors).toEqual([]);
});

test('visual autosave retries failures and flushes before entry switches', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await page.evaluate(() => {
    StoryFlowIntegrations.restoreOutputDirectory = async () => ({ connected: true, name: 'StoryFlow-test' });
    StoryFlowIntegrations.saveWorkspace = async () => 'StoryFlow-test/workspace.json';
    window.__visualAutosaveAttempts = [];
    window.__visualAutosaveSaved = {};
    window.__visualAutosaveFailNext = true;
    StoryFlowIntegrations.saveVisualEntry = async payload => {
      window.__visualAutosaveAttempts.push(structuredClone(payload));
      if (window.__visualAutosaveFailNext) {
        window.__visualAutosaveFailNext = false;
        throw new Error('fixture write failure');
      }
      window.__visualAutosaveSaved[payload.entry.id] = structuredClone(payload.entry);
      return `StoryFlow-test/Works/${payload.projectTitle}/Visual/${payload.entry.id}`;
    };

    const now = new Date().toISOString();
    StoryFlowProjects.createProject({
      title: '自動儲存測試',
      contentMode: 'visual',
      visualEntry: {
        id: 'autosave-first',
        title: '第一則',
        body: '',
        images: [],
        createdAt: now,
        updatedAt: now
      }
    }, { quiet: true });
    state.visualEntries.push(StoryFlowContentModel.normalizeVisualEntry({
      id: 'autosave-second',
      title: '第二則',
      body: '第二則內容',
      images: [],
      createdAt: now,
      updatedAt: now
    }));
    StoryFlowNavigate('workspace');
    StoryFlowVisualWorkspace.render();
  });

  await expect(page.locator('#visualEntryTitle')).toHaveValue('第一則');
  await page.locator('#visualEntryBody').fill('第一次寫入會失敗');
  await expect(page.locator('#visualEditorSaveStatus')).toHaveText('儲存失敗 · 請重試', { timeout: 5000 });
  await expect(page.locator('#visualRetrySaveBtn')).toBeVisible();
  await page.locator('#visualRetrySaveBtn').click();
  await expect(page.locator('#visualEditorSaveStatus')).toContainText('已儲存');
  await expect.poll(() => page.evaluate(() => window.__visualAutosaveSaved['autosave-first']?.body))
    .toBe('第一次寫入會失敗');

  await page.locator('#visualEntryBody').fill('切換前必須立即儲存');
  await page.locator('#visualEntryList [data-entry-id="autosave-second"]').click();
  await expect(page.locator('#visualEntryTitle')).toHaveValue('第二則');
  await expect.poll(() => page.evaluate(() => window.__visualAutosaveSaved['autosave-first']?.body))
    .toBe('切換前必須立即儲存');
  expect(await page.evaluate(() => window.__visualAutosaveAttempts.length)).toBeGreaterThanOrEqual(3);
  expect(pageErrors).toEqual([]);
});
