import { expect, test } from '@playwright/test';
import { prepare, gotoWorkbench } from './support/workbench.js';
import { standInForDrivePhotos } from './support/drive-photos.js';

// One image per article (docs/REDESIGN_PROPOSAL.md Phase C): a title, an optional quote, one
// photo from the writer's Google Drive with its caption, and the body, edited beside a live
// preview. Drive is stood in for by tests/browser/support/drive-photos.js.

async function createVisualWork(page, { title = '北海道十日', first = '函館夜景' } = {}) {
  await page.locator('#createProjectManually').click();
  const dialog = page.locator('#visualTypeDialog');
  await expect(dialog.locator('#chooseVisualType')).toBeEnabled();
  await dialog.locator('#chooseVisualType').click();
  await dialog.locator('#visualSeriesTitle').fill(title);
  await dialog.locator('#visualFirstEntryTitle').fill(first);
  await dialog.getByRole('button', { name: '建立圖文作品', exact: true }).click();
  await expect(page.locator('#visualWorkspace')).toBeVisible();
}

async function openVisualWorkspace(page) {
  const pageErrors = await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWorkbench(page, '/?visual-regression=1');
  await standInForDrivePhotos(page);
  return pageErrors;
}

test('a visual work is created through the type chooser, and closing it creates nothing', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await page.locator('#createProjectManually').click();
  const dialog = page.locator('#visualTypeDialog');
  await dialog.locator('#chooseVisualType').click();
  await expect(dialog.locator('#visualTypeDialogTitle')).toHaveText('建立圖文作品');
  // Closing is not submitting: no validation, no work.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => StoryFlowProjects.list().filter(project => project.contentMode === 'visual').length)).toBe(0);

  await createVisualWork(page);
  const work = await page.evaluate(() => ({ mode: state.contentMode, title: state.projectTitle, entries: state.visualEntries.map(entry => entry.title), photos: state.photos.length }));
  expect(work).toEqual({ mode: 'visual', title: '北海道十日', entries: ['函館夜景'], photos: 0 });
  await expect(page.locator('#workspaceView > .topbar h1')).toHaveText('圖文工作台');
  expect(pageErrors).toEqual([]);
});

test('photos come from Drive as references, are chosen from the library and show where they are used', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await createVisualWork(page);

  await page.locator('#visualAddPhotosBtn').click();
  const tiles = page.locator('#visualPhotoGrid .visual-photo-tile');
  await expect(tiles).toHaveCount(3);
  // The article without a photo takes the first one picked.
  const firstPhoto = await page.evaluate(() => state.photos.find(photo => photo.driveFileId === 'drive-photo-1').id);
  expect(await page.evaluate(() => state.visualEntries[0].photoId)).toBe(firstPhoto);
  await expect(page.locator('#visualPhotoCount')).toHaveText('用了 1 / 3 張');
  await expect(page.locator('#visualPhotoFilters [data-photo-filter="unused"]')).toHaveText('沒用到的 2');
  await expect(page.locator('#visualEntryPhoto img')).toBeVisible();
  await expect(page.locator('#visualEntryPhotoMeta')).toContainText('IMG_0412.jpg');

  // A reference holds no image: no data, blob or base64 in the work.
  const stored = await page.evaluate(() => JSON.stringify(state.photos));
  expect(stored).not.toMatch(/blob:|data:|base64/);
  expect(Object.keys(JSON.parse(stored)[0]).sort()).toEqual(['addedAt', 'alt', 'driveFileId', 'height', 'id', 'mimeType', 'name', 'sourceFolderId', 'takenAt', 'width']);

  // Picking the same files again adds nothing.
  await page.locator('#visualAddPhotosBtn').click();
  await expect(tiles).toHaveCount(3);

  // 沒用到的 narrows to what has not been written about; clicking one makes it the article's.
  await page.locator('#visualPhotoFilters [data-photo-filter="unused"]').click();
  await expect(tiles).toHaveCount(2);
  await tiles.first().locator('.visual-photo-choose').click();
  await expect(page.locator('#visualPhotoFilters [data-photo-filter="unused"]')).toHaveText('沒用到的 2');
  await page.locator('#visualPhotoFilters [data-photo-filter="all"]').click();
  await expect(page.locator('#visualPhotoGrid .visual-photo-tile.is-current .visual-photo-choose')).toHaveAttribute('aria-label', /IMG_0418\.jpg，用在《函館夜景》/);

  // A second article may use the same photo; the library and the editor say so.
  await page.locator('#visualNewEntryBtn').click();
  await page.locator('#newVisualEntryTitle').fill('湯倉神社');
  await page.locator('#confirmNewVisualEntry').click();
  await page.locator('#visualPhotoGrid .visual-photo-tile', { hasText: '函館夜景' }).locator('.visual-photo-choose').click();
  await expect(page.locator('#visualEntryPhotoMeta')).toContainText('也用在《函館夜景》');
  await expect(page.locator('#visualPhotoGrid .visual-photo-tile.is-current .visual-photo-used')).toHaveText('2 則');
  expect(pageErrors).toEqual([]);
});

test('the preview follows the editor as it is typed, in reading order', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await createVisualWork(page);
  await page.locator('#visualAddPhotosBtn').click();

  const article = page.locator('#visualPreviewArticle');
  await page.locator('#visualEntryQuote').fill('是否有什麼事情，能令你慌迷得失去知覺？');
  await expect(article.locator('.visual-article-quote')).toContainText('是否有什麼事情');
  await page.locator('#visualEntryCaption').fill('2010 年攝於東京');
  await expect(article.locator('figcaption')).toHaveText('2010 年攝於東京');
  await page.locator('#visualEntryBody').fill('F，太遲太早或許都是種緊張。或許文字能讓我平靜。');
  await expect(article.locator('.visual-article-body')).toContainText('F，太遲太早');
  await expect(article.locator('.visual-article-figure img')).toBeVisible();

  const order = await article.evaluate(node => [...node.children].map(child => child.className.split(' ')[0]));
  expect(order).toEqual(['visual-article-title', 'visual-article-quote', 'visual-article-figure', 'visual-article-body']);

  // Phone width by default, a desktop page on request.
  await expect(article).toHaveAttribute('data-width', 'phone');
  await page.locator('#visualPreviewWidths [data-preview-width="desktop"]').click();
  await expect(article).toHaveAttribute('data-width', 'desktop');

  // 從正文第一句帶入 fills the quote, and 復原 puts back what it replaced.
  await page.locator('#visualQuoteFromBody').click();
  await expect(page.locator('#visualEntryQuote')).toHaveValue('F，太遲太早或許都是種緊張。');
  await page.locator('#visualUndoBar button').click();
  await expect(page.locator('#visualEntryQuote')).toHaveValue('是否有什麼事情，能令你慌迷得失去知覺？');

  // Autosave writes the article with its photo reference.
  await page.evaluate(() => {
    window.__visualSaves = [];
    StoryFlowIntegrations.saveVisualEntry = async payload => { window.__visualSaves.push(payload); return 'x'; };
  });
  await page.locator('#visualEntryBody').fill('改過的正文。');
  await expect(page.locator('#visualEditorSaveStatus')).toContainText('已儲存');
  const saved = await page.evaluate(() => window.__visualSaves.at(-1));
  expect(saved.entry.body).toBe('改過的正文。');
  expect(saved.photo.driveFileId).toBe('drive-photo-1');
  expect(pageErrors).toEqual([]);
});

test('replacing, removing and taking a photo out of the library are confirmed in place and undoable', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await createVisualWork(page);
  await page.locator('#visualAddPhotosBtn').click();
  const entryPhoto = () => page.evaluate(() => state.visualEntries[0].photoId);
  const photoOf = fileId => page.evaluate(id => state.photos.find(photo => photo.driveFileId === id)?.id, fileId);

  // 換一張 is a mode the library announces; Esc leaves it without changing anything.
  await page.locator('#visualReplacePhoto').click();
  await expect(page.locator('#visualPhotoMode')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#visualPhotoMode')).toBeHidden();
  await page.locator('#visualReplacePhoto').click();
  await page.locator('#visualPhotoGrid .visual-photo-tile').nth(2).locator('.visual-photo-choose').click();
  await expect(page.locator('#visualPhotoMode')).toBeHidden();
  expect(await entryPhoto()).toBe(await photoOf('drive-photo-3'));

  // 移除圖片 asks on the button, then offers 復原.
  const remove = page.locator('#visualRemovePhoto');
  await remove.click();
  await expect(remove).toHaveText('再按一次確認');
  expect(await entryPhoto()).toBe(await photoOf('drive-photo-3'));
  await remove.click();
  expect(await entryPhoto()).toBe('');
  await expect(page.locator('#visualUndoBar')).toContainText('已移除圖片');
  await page.locator('#visualUndoBar button').click();
  expect(await entryPhoto()).toBe(await photoOf('drive-photo-3'));

  // The lightbox steps through the library and 移出照片庫 removes the reference only.
  await page.locator('#visualPhotoGrid .visual-photo-tile').nth(2).locator('.visual-photo-zoom').click();
  const dialog = page.locator('#visualPhotoDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#visualPhotoDialogCaption')).toContainText('IMG_0501.png');
  await expect(dialog.locator('#visualPhotoDialogCaption')).toContainText('用在《函館夜景》');
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('#visualPhotoDialogCaption')).toContainText('IMG_0418.jpg');
  await expect(dialog.locator('#visualPhotoDialogCaption')).toContainText('還沒用到');
  await page.keyboard.press('ArrowRight');
  await dialog.locator('#visualPhotoAlt').fill('夜裡的港口');
  await dialog.locator('#visualPhotoAlt').press('Tab');
  expect(await page.evaluate(() => state.photos.find(photo => photo.driveFileId === 'drive-photo-3').alt)).toBe('夜裡的港口');
  const removeFromLibrary = dialog.locator('#visualPhotoRemove');
  await removeFromLibrary.click();
  await expect(removeFromLibrary).toHaveText('再按一次確認');
  await removeFromLibrary.click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => state.photos.map(photo => photo.driveFileId))).toEqual(['drive-photo-1', 'drive-photo-2']);
  expect(await entryPhoto()).toBe('');
  await page.locator('#visualUndoBar button').click();
  expect(await page.evaluate(() => state.photos.length)).toBe(3);
  expect(await entryPhoto()).toBe(await photoOf('drive-photo-3'));
  expect(pageErrors).toEqual([]);
});

test('a photo Drive cannot give is shown as missing, and a signed-out session says how to see it', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await page.evaluate(() => {
    window.__driveMissing.add('drive-photo-1');
    window.__driveSignedOut.add('drive-photo-3');
  });
  await createVisualWork(page);
  await page.locator('#visualAddPhotosBtn').click();
  await expect(page.locator('#visualEntryPhoto .visual-photo-thumb')).toHaveText('Google Drive 上找不到這張照片');
  // The reference is kept: nothing is removed because Drive could not answer.
  expect(await page.evaluate(() => state.visualEntries[0].photoId)).not.toBe('');

  await page.locator('#visualPhotoGrid .visual-photo-tile').nth(2).locator('.visual-photo-choose').click();
  await expect(page.locator('#visualEntryPhoto .visual-photo-thumb')).toHaveText('登入 Google 後顯示照片');
  // Typing still works and the preview still lays out without the image.
  await page.locator('#visualEntryBody').fill('沒有照片也能寫。');
  await expect(page.locator('#visualPreviewArticle .visual-article-body')).toHaveText('沒有照片也能寫。');
  expect(pageErrors).toEqual([]);
});

test('deleting an article is Recovery-first, stops when Recovery fails and keeps the photos', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await createVisualWork(page);
  await page.locator('#visualAddPhotosBtn').click();
  await page.evaluate(() => {
    window.__removed = [];
    StoryFlowIntegrations.removeVisualEntryFiles = async payload => { window.__removed.push(payload.entryId); return 'Recovery/x.json'; };
    StoryFlowProjectPersistence.prepareRecovery = async () => { throw new Error('Recovery 無法建立'); };
  });
  page.on('dialog', dialog => dialog.accept());
  const row = page.locator('#visualEntryList .visual-entry-row').first();
  await row.hover();
  await row.locator('.visual-entry-more').click();
  await row.getByRole('menuitem', { name: /刪除圖文/ }).click();
  await expect.poll(() => page.evaluate(() => state.visualEntries.length)).toBe(1);
  expect(await page.evaluate(() => window.__removed.length)).toBe(0);

  await page.evaluate(() => { StoryFlowProjectPersistence.prepareRecovery = async () => ({ ok: true }); });
  await row.hover();
  await row.locator('.visual-entry-more').click();
  await row.getByRole('menuitem', { name: /刪除圖文/ }).click();
  await expect.poll(() => page.evaluate(() => state.visualEntries.length)).toBe(0);
  expect(await page.evaluate(() => window.__removed.length)).toBe(1);
  // The photos are the work's, and stay in its library.
  expect(await page.evaluate(() => state.photos.length)).toBe(3);
  await expect(page.locator('#visualEditorEmpty')).toContainText('建立第一則圖文');
  expect(pageErrors).toEqual([]);
});

test('Publishing previews and copies the article in reading order with the photo marked', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await createVisualWork(page);
  await page.locator('#visualAddPhotosBtn').click();
  await page.locator('#visualEntryQuote').fill('是否有什麼事情？');
  await page.locator('#visualEntryCaption').fill('2010 年攝於東京');
  await page.locator('#visualEntryBody').fill('F，太遲太早或許都是種緊張。');
  await expect(page.locator('#visualEditorSaveStatus')).toContainText('已儲存');

  await page.locator('.nav-item[data-view="publishing"]').click();
  const row = page.locator('.publish-list-item', { hasText: '函館夜景' });
  await expect(row.locator('.publish-image-badge')).toHaveText('附圖 1 張');
  await row.locator('.publish-manage-btn').click();
  const preview = page.locator('#platformPreviewContent');
  await expect(preview.locator('.visual-article-quote')).toContainText('是否有什麼事情？');
  await expect(preview.locator('figcaption')).toHaveText('2010 年攝於東京');
  // The preview panel is built before it is attached; the photo must still arrive in it.
  await expect(preview.locator('.visual-article-figure img')).toBeVisible();
  await expect(preview.locator('.visual-photo-download-btn')).toHaveText('下載圖片');

  const copied = await page.evaluate(() => StoryFlowPublishingOutput.outputFor(state.visualEntries[0], ''));
  expect(copied.split('\n\n')).toEqual(['是否有什麼事情？', '〔圖片：IMG_0412.jpg〕', '2010 年攝於東京', 'F，太遲太早或許都是種緊張。']);

  // Search finds the article by its photo's file name.
  await page.locator('.publish-lightbox-close').click();
  await page.keyboard.press('Control+K');
  await page.locator('#globalSearchInput').fill('IMG_0412');
  await expect(page.locator('#globalSearchResults .global-search-result').first()).toContainText('函館夜景');
  expect(pageErrors).toEqual([]);
});

test('the visual workspace lays out without sideways scrolling from phone to wide desktop', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await createVisualWork(page);
  await page.locator('#visualAddPhotosBtn').click();
  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 900, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${size.width}px`).toBeLessThanOrEqual(0);
    const preview = page.locator('.visual-preview-panel');
    if (size.width >= 1366) {
      await expect(preview, `${size.width}px shows the preview beside the editor`).toBeVisible();
      await expect(page.locator('.visual-pane-switch')).toBeHidden();
    } else {
      // Narrower, 編輯｜預覽 switches between the two in one column.
      await expect(preview).toBeHidden();
      await page.locator('.visual-pane-switch [data-pane="preview"]').click();
      await expect(preview).toBeVisible();
      await expect(page.locator('#visualEntryBody')).toBeHidden();
      await page.locator('.visual-pane-switch [data-pane="edit"]').click();
    }
  }
  expect(pageErrors).toEqual([]);
});

// The work follows one Drive photo folder, chosen in StoryFlow's own folder browser
// (REDESIGN_PROPOSAL C3, folder import). This drives the real Drive listing in google-docs.js
// against stubbed Drive responses; a session token from before the read-only permission is
// answered 403 once and asked again with the consent screen.
test('the folder browser chooses, changes and refreshes the work’s photo folder', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  const drive = {
    root: [{ id: 'trip', name: '北海道', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'tokyo', name: '東京', mimeType: 'application/vnd.google-apps.folder' }],
    trip: [
      { id: 'p-2', name: 'IMG_0002.jpg', mimeType: 'image/jpeg', imageMediaMetadata: { time: '2023:02:18 10:00:00' } },
      { id: 'p-1', name: 'IMG_0001.jpg', mimeType: 'image/jpeg', imageMediaMetadata: { time: '2023:02:18 09:00:00' } },
      { id: 'heic-1', name: 'IMG_0003.HEIC', mimeType: 'image/heic' },
      { id: 'day-2', name: 'Day 2', mimeType: 'application/vnd.google-apps.folder' }
    ],
    'day-2': [{ id: 'p-3', name: 'IMG_0101.png', mimeType: 'image/png', imageMediaMetadata: { time: '2023:02:19 08:00:00' } }],
    tokyo: [
      { id: 't-1', name: 'TKY_01.jpg', mimeType: 'image/jpeg', imageMediaMetadata: { time: '2010:05:01 12:00:00' } },
      { id: 't-2', name: 'TKY_02.jpg', mimeType: 'image/jpeg', imageMediaMetadata: { time: '2010:05:01 13:00:00' } }
    ]
  };
  await page.route('https://www.googleapis.com/drive/v3/files?**', async route => {
    if (route.request().headers().authorization === 'Bearer token-1') return route.fulfill({ status: 403, body: '{}' });
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    const name = /name contains '([^']+)'/.exec(q)?.[1];
    let files = parent ? (drive[parent] || []) : [];
    if (name) files = Object.values(drive).flat().filter(file => file.mimeType.endsWith('folder') && file.name.includes(name));
    if (q.includes(`mimeType = 'application/vnd.google-apps.folder' and trashed = false`) && !q.includes('contains')) {
      files = files.filter(file => file.mimeType.endsWith('folder'));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
  });
  await page.evaluate(() => {
    let tokens = 0;
    window.__consents = [];
    window.STORYFLOW_CONFIG.googleClientId ||= 'test-client.apps.googleusercontent.com';
    window.google = { accounts: { oauth2: { initTokenClient: config => ({
      callback: config.callback,
      requestAccessToken({ prompt } = {}) {
        window.__consents.push(prompt);
        tokens += 1;
        this.callback({ access_token: `token-${tokens}` });
      }
    }) } } };
  });
  await createVisualWork(page);
  const names = () => page.evaluate(() => [...state.photos]
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt)).map(photo => photo.name));

  // Browse: 我的雲端硬碟 lists its folders; opening one shows what it holds.
  await page.locator('#visualChooseFolderBtn').click();
  const dialog = page.locator('#visualFolderDialog');
  await expect(dialog.locator('.visual-folder-row')).toHaveText(['北海道›', '東京›']);
  await dialog.locator('.visual-folder-row', { hasText: '北海道' }).click();
  await expect(dialog.locator('#visualFolderPath')).toContainText('我的雲端硬碟›北海道');
  await expect(dialog.locator('.visual-folder-summary-count')).toHaveText('這一層 2 張照片 · 1 個子資料夾（裡面的照片也會一併加入）');
  await expect(dialog.locator('.visual-folder-row')).toHaveText(['Day 2›']);
  await dialog.locator('#visualUseFolderBtn').click();
  await expect(dialog).toBeHidden();
  await expect.poll(names).toEqual(['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0101.png']);
  await expect(page.locator('#visualPhotoFolderName')).toHaveText('北海道');
  await expect(page.locator('#visualChooseFolderBtn')).toHaveText('更換資料夾');
  await expect(page.locator('.storyflow-toast').last()).toContainText('1 個其他格式的檔案');
  expect(await page.evaluate(() => window.__consents)).toContain('consent');
  // The token the Drive listing obtained is the session's: the sidebar says signed in and a
  // reload in this tab would keep it.
  await expect(page.locator('#googleDot')).toHaveClass(/connected/);
  expect(await page.evaluate(() => sessionStorage.getItem('storyflow.google.access-token.v1'))).toBe('token-2');
  // A whole folder does not decide an article's photo for it.
  expect(await page.evaluate(() => state.visualEntries[0].photoId)).toBe('');

  // Use one photo, then change folders: the used photo stays, the old folder's unused ones go.
  await page.locator('#visualPhotoGrid .visual-photo-choose').first().click();
  await page.locator('#visualChooseFolderBtn').click();
  await expect(dialog.locator('#visualFolderPath')).toContainText('最近使用›北海道');
  await dialog.locator('[data-folder-place="mine"]').click();
  await dialog.locator('.visual-folder-row', { hasText: '東京' }).click();
  await dialog.locator('#visualUseFolderBtn').click();
  await expect.poll(names).toEqual(['TKY_01.jpg', 'TKY_02.jpg', 'IMG_0001.jpg']);
  await expect(page.locator('#visualPhotoFolderName')).toHaveText('東京');
  await expect(page.locator('#visualUndoBar')).toContainText('照片來源已改為「東京」');
  await page.locator('#visualUndoBar button').click();
  await expect.poll(names).toEqual(['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0101.png']);
  await expect(page.locator('#visualPhotoFolderName')).toHaveText('北海道');

  // Refresh adds what was put in the folder since.
  drive.trip.push({ id: 'p-4', name: 'IMG_0004.jpg', mimeType: 'image/jpeg', imageMediaMetadata: { time: '2023:02:18 11:00:00' } });
  await page.locator('#visualRefreshFolderBtn').click();
  await expect.poll(names).toEqual(['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0004.jpg', 'IMG_0101.png']);
  await expect(page.locator('.storyflow-toast').last()).toContainText('新增 1 張照片');

  // Search finds a folder by name wherever it is.
  await page.locator('#visualChooseFolderBtn').click();
  await dialog.locator('#visualFolderSearch').fill('東');
  await expect(dialog.locator('.visual-folder-row')).toHaveText(['東京›']);
  expect(pageErrors).toEqual([]);
});

// The two preview widths are real widths: the selected one is marked like every segment, and
// a 760px page in a narrower column is scaled down and says so.
test('the preview widths differ and the selected one is marked', async ({ page }) => {
  const pageErrors = await openVisualWorkspace(page);
  await createVisualWork(page);
  await page.locator('#visualEntryBody').fill('一段正文。');
  const phone = page.locator('#visualPreviewWidths [data-preview-width="phone"]');
  const desktop = page.locator('#visualPreviewWidths [data-preview-width="desktop"]');
  await expect(phone).toHaveClass(/active/);
  await expect(page.locator('#visualPreviewScale')).toHaveText('手機寬 390px');
  await desktop.click();
  await expect(desktop).toHaveClass(/active/);
  await expect(phone).not.toHaveClass(/active/);
  await expect(page.locator('#visualPreviewScale')).toHaveText(/^桌面寬 760px，縮小為 \d+% 顯示$/);
  const widths = await page.locator('#visualPreviewArticle').evaluate(node => ({
    css: node.offsetWidth, zoom: Number(getComputedStyle(node).zoom)
  }));
  expect(widths.css).toBe(760);
  expect(widths.zoom).toBeLessThan(1);
  // The format select is the split toolbar's control.
  const select = await page.locator('#visualPreviewPlatform').evaluate(node => ({
    height: getComputedStyle(node).height, radius: getComputedStyle(node).borderTopLeftRadius
  }));
  expect(select).toEqual({ height: '34px', radius: '8px' });
  expect(pageErrors).toEqual([]);
});
