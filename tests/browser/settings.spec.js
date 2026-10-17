import { expect, test } from '@playwright/test';
import { prepare } from './support/workbench.js';

// The privacy policy is the page a Google OAuth consent screen links to, so it has to be served
// beside the app and reachable from it. Its claims are the app's behaviour: the one scope it
// requests is the one config.js asks for.
test('settings links to a privacy policy that states the scope the app requests', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await page.locator('#sidebarSettingsBtn').click();
  const link = page.locator('#storyflowDevicePrivacySection').getByRole('link', { name: '隱私權政策' });
  await expect(link).toHaveAttribute('href', './privacy.html');
  await expect(link).toHaveAttribute('target', '_blank');
  const scopes = await page.evaluate(() => window.STORYFLOW_CONFIG.googleScopes);

  await page.goto('/privacy.html');
  await expect(page.getByRole('heading', { level: 1, name: 'StoryFlow 隱私權政策' })).toBeVisible();
  for (const scope of scopes) await expect(page.locator('main')).toContainText(scope);
  await expect(page.getByRole('link', { name: 'github.com/fancyblue/StoryFlow/issues' }).first())
    .toHaveAttribute('href', 'https://github.com/fancyblue/StoryFlow/issues');
  await expect(page.getByRole('link', { name: '← 回到 StoryFlow' })).toHaveAttribute('href', './');
  expect(pageErrors).toEqual([]);
});

// Two works holding records for both platforms: a longform article in one, a visual entry in
// the other, so a removal that only reached the open work would leave the other behind.
async function seedPlatformRecords(page) {
  await page.evaluate(() => {
    window.__notes = [];
    window.__recoveryReasons = [];
    window.__savedSettings = [];
    const baseNotify = notify;
    notify = (message, isError = false) => {
      window.__notes.push([message, Boolean(isError)]);
      return baseNotify(message, isError);
    };
    StoryFlowIntegrations.saveWorkspace = async () => 'StoryFlow-test/workspace.json';
    StoryFlowIntegrations.saveStoryFlowSettings = async settings => {
      window.__savedSettings.push(structuredClone(settings));
      return 'StoryFlow-test/settings.json';
    };
    StoryFlowIntegrations.createWorkspaceRecoverySnapshot = async reason => {
      // Recovery has to see the data before anything is removed.
      window.__recoveryReasons.push([reason, platforms.includes('方格子')]);
      return { artifactPath: `StoryFlow-test/Recovery/${reason}.json` };
    };
    const records = () => ({
      platformStatus: { 巴哈小屋: true, 方格子: true },
      publicationRecords: {
        巴哈小屋: { publishedAt: '2026-10-01T08:00', url: 'https://example.com/baha' },
        方格子: { publishedAt: '2026-10-02T08:00', url: 'https://example.com/vocus' }
      },
      platformTitles: { 巴哈小屋: '巴哈標題', 方格子: '方格子標題' },
      platformHashtags: { 巴哈小屋: '#巴哈', 方格子: '#方格子' },
      platformIncludeAfterword: { 巴哈小屋: true, 方格子: false }
    });
    StoryFlowProjects.createProject({ title: '平台長文' }, { quiet: true });
    state.chapters[0].parts.push({ id: 'platform-part', title: '第一篇', markdown: '內文', startBlock: 0, endBlock: 1, ...records() });
    StoryFlowProjects.createProject({
      title: '平台圖文',
      contentMode: 'visual',
      visualEntry: { id: 'platform-entry', title: '圖文一', body: '內文', ...records() }
    }, { quiet: true });
  });
}

async function platformRecordKeys(page) {
  return page.evaluate(() => StoryFlowProjects.searchSnapshot().map(project => {
    const items = [
      ...(project.state.chapters || []).flatMap(chapter => chapter.parts || []),
      ...(project.state.visualEntries || [])
    ];
    return {
      title: project.title,
      keys: items.map(item => ['platformStatus', 'publicationRecords', 'platformTitles', 'platformHashtags', 'platformIncludeAfterword']
        .map(field => Object.keys(item[field] || {}).sort().join('+')).join(' '))
    };
  }));
}

const BOTH_PLATFORMS = '巴哈小屋+方格子 巴哈小屋+方格子 巴哈小屋+方格子 巴哈小屋+方格子 巴哈小屋+方格子';

const ONLY_BAHA = '巴哈小屋 巴哈小屋 巴哈小屋 巴哈小屋 巴哈小屋';

async function openPlatformMenu(page, name) {
  if (!(await page.locator('#settingsView').isVisible())) await page.locator('#sidebarSettingsBtn').click();
  const row = page.locator(`#platformFormatSettings .platform-setting-row[data-platform="${name}"]`);
  await row.getByRole('button', { name: `更多「${name}」操作` }).click();
  return { row, item: row.getByRole('menuitem', { name: `刪除平台「${name}」` }) };
}

// AGENTS.md: infrequent or destructive row actions use ⋯ → menu action. A platform row used
// to end in an always-visible red 刪除, the one list in the app that still did.
test('a publishing platform is removed from its row\'s ⋯ menu, from every work, after Recovery', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await seedPlatformRecords(page);
  await page.locator('#sidebarSettingsBtn').click();
  const row = page.locator('#platformFormatSettings .platform-setting-row[data-platform="方格子"]');
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: /刪除/ })).toHaveCount(0);
  await expect(row.getByText('刪除', { exact: true })).toHaveCount(0);

  const more = row.getByRole('button', { name: '更多「方格子」操作' });
  await expect(more).toHaveAttribute('aria-haspopup', 'menu');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  const box = await more.boundingBox();
  expect({ width: Math.round(box.width), height: Math.round(box.height) }).toEqual({ width: 34, height: 34 });
  expect(await more.evaluate(node => getComputedStyle(node).borderRadius)).toBe('8px');

  // Escape and a click elsewhere close it without removing anything.
  await more.click();
  const item = row.getByRole('menuitem', { name: '刪除平台「方格子」' });
  await expect(item).toBeVisible();
  await expect(item).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(item).toBeHidden();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(item).toBeVisible();
  await page.locator('#settingsView h2, #settingsView .settings-section > strong').first().click();
  await expect(item).toBeHidden();
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  // Declining the confirmation keeps the platform and takes no Recovery copy.
  page.once('dialog', dialog => dialog.dismiss());
  await more.click();
  await item.click();
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => window.__recoveryReasons)).toEqual([]);
  expect(await platformRecordKeys(page)).toEqual([
    { title: '平台長文', keys: [BOTH_PLATFORMS] },
    { title: '平台圖文', keys: [BOTH_PLATFORMS] }
  ]);

  page.once('dialog', dialog => {
    expect(dialog.message()).toContain('移除「方格子」平台？');
    expect(dialog.message()).toContain('所有作品');
    dialog.accept();
  });
  await more.click();
  await item.click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('#platformFormatSettings .platform-setting-row[data-platform="巴哈小屋"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__notes.at(-1))).toEqual(['已移除平台「方格子」', false]);

  expect(await page.evaluate(() => window.__recoveryReasons)).toEqual([['before-platform-delete', true]]);
  // Both works lose the platform — the open visual one and the longform one behind it — and
  // the other platform's records stay untouched.
  expect(await platformRecordKeys(page)).toEqual([
    { title: '平台長文', keys: [ONLY_BAHA] },
    { title: '平台圖文', keys: [ONLY_BAHA] }
  ]);
  // Success is reported only after settings.json was written without the platform.
  const persisted = await page.evaluate(() => {
    const last = window.__savedSettings.at(-1);
    return { platforms: last.platforms, config: Object.keys(last.formatting.platforms) };
  });
  expect(persisted).toEqual({ platforms: ['巴哈小屋'], config: ['巴哈小屋'] });
  expect(pageErrors).toEqual([]);
});

test('a platform stays when its Recovery copy cannot be made', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await seedPlatformRecords(page);
  await page.evaluate(() => {
    StoryFlowIntegrations.createWorkspaceRecoverySnapshot = async () => { throw new Error('磁碟已滿'); };
  });
  const { row, item } = await openPlatformMenu(page, '方格子');
  page.once('dialog', dialog => dialog.accept());
  await item.click();
  await expect.poll(() => page.evaluate(() => window.__notes.at(-1)))
    .toEqual(['尚未移除平台：無法建立 Recovery 安全副本（磁碟已滿）', true]);
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => [...platforms])).toEqual(['巴哈小屋', '方格子']);
  expect(await platformRecordKeys(page)).toEqual([
    { title: '平台長文', keys: [BOTH_PLATFORMS] },
    { title: '平台圖文', keys: [BOTH_PLATFORMS] }
  ]);
  expect(pageErrors).toEqual([]);
});

test('a platform removal that cannot be saved is put back', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await seedPlatformRecords(page);
  await page.evaluate(() => {
    StoryFlowIntegrations.saveStoryFlowSettings = async () => { throw new Error('寫入失敗'); };
  });
  const { row, item } = await openPlatformMenu(page, '方格子');
  page.once('dialog', dialog => dialog.accept());
  await item.click();
  await expect.poll(() => page.evaluate(() => window.__notes.at(-1)))
    .toEqual(['尚未移除平台：無法寫入 StoryFlow 資料夾，「方格子」已保留', true]);
  expect(await page.evaluate(() => window.__recoveryReasons)).toEqual([['before-platform-delete', true]]);
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => ({
    platforms: [...platforms],
    config: Boolean(state.formatting.platforms['方格子'])
  }))).toEqual({ platforms: ['巴哈小屋', '方格子'], config: true });
  expect(await platformRecordKeys(page)).toEqual([
    { title: '平台長文', keys: [BOTH_PLATFORMS] },
    { title: '平台圖文', keys: [BOTH_PLATFORMS] }
  ]);
  expect(pageErrors).toEqual([]);
});

// What each work holds for a renamed platform: the keys of every per-platform field, and the
// renamed article's title and URL, which must follow the platform to its new name.
async function renamedRecords(page, name) {
  return page.evaluate(name => StoryFlowProjects.searchSnapshot().map(project => {
    const item = [
      ...(project.state.chapters || []).flatMap(chapter => chapter.parts || []),
      ...(project.state.visualEntries || [])
    ][0];
    return {
      title: project.title,
      fields: ['platformStatus', 'publicationRecords', 'platformTitles', 'platformHashtags', 'platformIncludeAfterword']
        .map(field => Object.hasOwn(item[field], name) && !Object.hasOwn(item[field], '方格子')),
      platformTitle: item.platformTitles[name] ?? null,
      url: item.publicationRecords[name]?.url ?? null
    };
  }), name);
}

async function renameVocus(page, nextName) {
  if (!(await page.locator('#settingsView').isVisible())) await page.locator('#sidebarSettingsBtn').click();
  const input = page.getByRole('textbox', { name: '方格子 平台名稱' });
  await input.fill(nextName);
  await input.press('Enter');
  return input;
}

test('renaming a platform moves its records in every work, after Recovery', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await seedPlatformRecords(page);
  // A title left under the new name by an earlier removal must not replace the one the user
  // can see. It sits in the work that is not open.
  expect(await page.evaluate(() => {
    let planted = 0;
    StoryFlowProjects.forEachState(projectState => {
      if (projectState.projectTitle !== '平台長文') return;
      projectState.chapters[0].parts[0].platformTitles['方格子 Plus'] = '早已移除的平台標題';
      planted += 1;
    });
    return planted;
  })).toBe(1);

  await renameVocus(page, '方格子 Plus');
  await expect(page.locator('#platformFormatSettings .platform-setting-row[data-platform="方格子 Plus"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...platforms])).toEqual(['巴哈小屋', '方格子 Plus']);
  expect(await page.evaluate(() => window.__recoveryReasons)).toEqual([['before-platform-rename', true]]);
  expect(await renamedRecords(page, '方格子 Plus')).toEqual([
    { title: '平台長文', fields: [true, true, true, true, true], platformTitle: '方格子標題', url: 'https://example.com/vocus' },
    { title: '平台圖文', fields: [true, true, true, true, true], platformTitle: '方格子標題', url: 'https://example.com/vocus' }
  ]);
  const persisted = await page.evaluate(() => {
    const last = window.__savedSettings.at(-1);
    return { platforms: last.platforms, config: Object.keys(last.formatting.platforms) };
  });
  expect(persisted).toEqual({ platforms: ['巴哈小屋', '方格子 Plus'], config: ['巴哈小屋', '方格子 Plus'] });
  expect(pageErrors).toEqual([]);
});

test('a platform keeps its name when the rename cannot be made safely', async ({ page }) => {
  const pageErrors = await prepare(page);
  await page.goto('/');
  await seedPlatformRecords(page);
  await page.evaluate(() => {
    StoryFlowIntegrations.createWorkspaceRecoverySnapshot = async () => { throw new Error('磁碟已滿'); };
  });
  const input = await renameVocus(page, '方格子 Plus');
  await expect.poll(() => page.evaluate(() => window.__notes.at(-1)))
    .toEqual(['尚未更新平台名稱：無法建立 Recovery 安全副本（磁碟已滿）', true]);
  await expect(input).toHaveValue('方格子');
  expect(await page.evaluate(() => [...platforms])).toEqual(['巴哈小屋', '方格子']);
  expect(await platformRecordKeys(page)).toEqual([
    { title: '平台長文', keys: [BOTH_PLATFORMS] },
    { title: '平台圖文', keys: [BOTH_PLATFORMS] }
  ]);

  // Recovery succeeds but the folder refuses the write: the rename is put back.
  await page.evaluate(() => {
    StoryFlowIntegrations.createWorkspaceRecoverySnapshot = async reason => ({ artifactPath: `StoryFlow-test/Recovery/${reason}.json` });
    StoryFlowIntegrations.saveStoryFlowSettings = async () => { throw new Error('寫入失敗'); };
  });
  await renameVocus(page, '方格子 Plus');
  await expect.poll(() => page.evaluate(() => window.__notes.at(-1)))
    .toEqual(['尚未更新平台名稱：無法寫入 StoryFlow 資料夾，仍為「方格子」', true]);
  await expect(page.getByRole('textbox', { name: '方格子 平台名稱' })).toHaveValue('方格子');
  expect(await page.evaluate(() => ({
    platforms: [...platforms],
    configs: Object.keys(state.formatting.platforms)
  }))).toEqual({ platforms: ['巴哈小屋', '方格子'], configs: ['巴哈小屋', '方格子'] });
  expect(await platformRecordKeys(page)).toEqual([
    { title: '平台長文', keys: [BOTH_PLATFORMS] },
    { title: '平台圖文', keys: [BOTH_PLATFORMS] }
  ]);
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
