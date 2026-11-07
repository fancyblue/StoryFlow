// The app states the audit measures. A state reached by a step that fails (a control that
// does not exist at that width) is skipped and logged; it is not an error.
import { standInForDrivePhotos } from '../../browser/support/drive-photos.js';

// Every breakpoint band of the stylesheets has at least one width here.
export const ALL_WIDTHS = [1920, 1440, 1300, 1150, 1090, 1060, 1000, 950, 910, 880, 840, 800, 740, 690, 660, 630, 610, 590, 540, 500, 460, 390];
export const FLOW_WIDTHS = [1440, 1060, 880, 800, 600, 390];
// Where :hover, :focus and :active are forced.
export const FORCED_WIDTHS = [1440, 800];

const view = (page, name) => page.evaluate(target => window.StoryFlowNavigate(target), name);
const switchTo = (page, which) => page.evaluate(key => StoryFlowProjects.switchProject(window.__auditWorks[key], { quiet: true }), which);
const click = async (page, target, options = {}) => {
  const locator = typeof target === 'string' ? page.locator(target).first() : target;
  await locator.click({ timeout: 3000, ...options });
};
const esc = page => page.keyboard.press('Escape');

// One longform work with two published-or-not articles, and one visual work.
async function seed(page) {
  await page.evaluate(() => {
    window.notify = () => {};
    StoryFlowIntegrations.savePart = async () => 'x.md';
    StoryFlowIntegrations.saveVisualEntry = async payload => `W/${payload.entry.id}`;
    StoryFlowProjects.createProject({ title: '樣式稽核長文' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '稽核章節';
    chapter.draft = '第一段正文。\n\n第二段正文。\n\n第三段正文。';
    chapter.confirmedBlockCount = 2;
    chapter.parts = [1, 2].map(index => ({
      id: `audit-part-${index}`, title: `稽核文章 ${index}`, chars: 6, startBlock: index - 1, endBlock: index,
      raw: '第一段正文。', formatted: '第一段正文。', summary: '摘要文字', hashtags: '#一 #二', afterword: '後記文字',
      images: [], published: false, platformStatus: { 方格子: index === 2 }
    }));
    renderAll();
    const longform = StoryFlowProjects.activeId();
    StoryFlowProjects.createProject({ title: '樣式稽核圖文', contentMode: 'visual', visualEntry: {
      id: 'audit-visual-1', title: '稽核圖文', quote: '引言一句。', caption: '圖說', body: '月光。\n\n＊＊＊\n\n第二段。',
      summary: '', hashtags: '', tags: [], images: [], coverImageId: '', platformTitles: {}, platformStatus: {},
      publicationRecords: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    } }, { quiet: true });
    window.__auditWorks = { longform, visual: StoryFlowProjects.activeId() };
    StoryFlowProjects.switchProject(longform, { quiet: true });
  });
}

// Adds a Google-sourced chapter, a manual one, a fully published article with an image, a
// pending mark and enough chapters to scroll.
async function seedRich(page) {
  await seed(page);
  await page.evaluate(() => {
    const chapter = state.chapters[0];
    chapter.source = { id: 'doc-1', tabId: 't.1', tabTitle: '第一分頁', name: '來源文件' };
    chapter.parts[0].images = [{ id: 'img-1', storedName: 'a.png', relativePath: './assets/a.png', alt: '說明', caption: '圖說', placement: 'body', order: 0 }];
    chapter.parts[0].platformStatus = { 方格子: true, 巴哈小屋: true };
    chapter.parts[0].publicationRecords = { 方格子: { publishedAt: '2026-01-01T10:00:00Z', url: 'https://example.com/a' } };
    chapter.parts[1].draft = '【待補】這裡';
    state.chapters.push({ id: 'manual-2', title: '手動章節', draft: '手動正文。\n\n第二段。', confirmedBlockCount: 0, parts: [], source: null });
    for (let i = 0; i < 6; i++) state.chapters.push({ id: `extra-${i}`, title: `很長很長的章節名稱 ${i}`, draft: '段落。'.repeat(40), confirmedBlockCount: 0, parts: [], source: null });
    renderAll();
  });
}

async function freshLightbox(page, rowText) {
  await esc(page); await esc(page);
  await view(page, 'projects'); await view(page, 'publishing');
  await page.waitForTimeout(200);
  if (!(await page.locator('.publish-lightbox:not([hidden])').count())) {
    await click(page, page.locator('.publish-list-item', { hasText: rowText }).first().locator('.publish-manage-btn'));
  }
}
const lightboxTool = name => async page => {
  await freshLightbox(page, '稽核文章 1');
  await click(page, page.locator('.publish-lightbox:not([hidden])').getByRole('button', { name }).first());
};
const choosePlatform = page => click(page, '.publish-lightbox:not([hidden]) .publish-platform-row:not(.is-default-output) .publish-platform-choose');

const SOURCE_DOC = { title: '測試來源文件', tabs: [{ tabProperties: { tabId: 'tab-1', title: '本文', index: 0 }, documentTab: { body: { content: [
  { paragraph: { paragraphStyle: { namedStyleType: 'HEADING_1' }, elements: [{ textRun: { content: '第一章\n', textStyle: {} } }] } },
  { paragraph: { paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, elements: [{ textRun: { content: '新貓\n', textStyle: {} } }] } },
  { paragraph: { paragraphStyle: { namedStyleType: 'HEADING_1' }, elements: [{ textRun: { content: '第二章\n', textStyle: {} } }] } },
  { paragraph: { paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, elements: [{ textRun: { content: '新增段落\n', textStyle: {} } }] } }
] }, inlineObjects: {} } }] };

export const scenes = [
  { name: 'base', widths: ALL_WIDTHS, setup: seed, forced: true, steps: [
    { name: 'works', go: p => view(p, 'projects') },
    { name: 'workspace', go: p => view(p, 'workspace') },
    { name: 'publishing', go: p => view(p, 'publishing') },
    { name: 'lightbox', go: async p => {
      await click(p, p.locator('.publish-list-item:not(.publishing-combined-row)', { hasText: '稽核文章 1' }).first().locator('.publish-manage-btn'));
      await choosePlatform(p);
      await click(p, '#editPlatformTitle');
      await click(p, '#editPlatformPreviewHashtags');
    } },
    { name: 'settings', go: async p => { await esc(p); await view(p, 'settings'); } },
    { name: 'visual-workspace', go: async p => { await switchTo(p, 'visual'); await view(p, 'workspace'); } },
    { name: 'visual-lightbox', go: async p => {
      await view(p, 'publishing');
      await click(p, p.locator('.publish-list-item:not(.publishing-combined-row)', { hasText: '稽核圖文' }).first().locator('.publish-manage-btn'));
    } },
    { name: 'type-chooser', go: async p => { await esc(p); await p.evaluate(() => window.StoryFlowVisualWorkspace.openTypeChooser()); } }
  ] },
  { name: 'flows', widths: FLOW_WIDTHS, setup: seedRich, forced: true, steps: [
    { name: 'chapter-menu', go: async p => { await view(p, 'workspace'); await click(p, '#chapterList .chapter-more-button'); } },
    { name: 'split-preferences', go: async p => { await esc(p); await click(p, '#splitSettingsToggle'); } },
    { name: 'reading', go: async p => { await click(p, '#splitSettingsToggle'); await click(p, '#openReadingViewBtn'); } },
    { name: 'reading-settings', go: p => click(p, p.getByRole('button', { name: '閱讀設定' })) },
    { name: 'seam', go: async p => { await esc(p); await click(p, p.getByRole('button', { name: '接縫', exact: true })); } },
    { name: 'works-menu', go: async p => { await click(p, '#closeReadingViewBtn').catch(() => {}); await view(p, 'projects'); await click(p, '.project-library-more-btn'); } },
    { name: 'switch-work', go: async p => { await esc(p); await view(p, 'workspace'); await click(p, '#quickSwitchProjectBtn'); } },
    { name: 'search', go: async p => { await esc(p); await click(p, '#sidebarSearchBtn'); await p.locator('#globalSearchInput').fill('稽核'); } },
    { name: 'collapsed', go: async p => { await click(p, '#closeGlobalSearch'); await click(p, '#sidebarToggle'); } },
    { name: 'settings-menu', go: async p => { await esc(p); await view(p, 'settings'); await click(p, '.platform-row-more'); } },
    { name: 'new-work-manual', go: async p => { await esc(p); await view(p, 'projects'); await click(p, '#projectsNewWorkBtn'); await click(p, '#chooseLongformType'); await click(p, '#sourceManualBtn'); } },
    { name: 'new-work-source', go: p => click(p, '#backManualCreationBtn') }
  ] },
  { name: 'publishing-tools', widths: FLOW_WIDTHS, setup: seedRich, forced: true, steps: [
    { name: 'row-menu', go: async p => { await view(p, 'publishing'); await click(p, '.publish-more-btn'); } },
    { name: 'helper', go: lightboxTool(/^摘要與 Hashtags/) },
    { name: 'afterword', go: lightboxTool(/^後記/) },
    { name: 'images', go: lightboxTool(/^文章圖片/) },
    { name: 'record', go: async p => { await freshLightbox(p, '稽核文章 1'); await choosePlatform(p); await click(p, '#platformPreviewRecordBtn'); } },
    { name: 'maximised', go: async p => { await freshLightbox(p, '稽核文章 1'); await click(p, '.publish-lightbox-size'); } }
  ] },
  { name: 'visual', widths: FLOW_WIDTHS, forced: true, setup: async p => {
    await seed(p);
    await standInForDrivePhotos(p);
    await switchTo(p, 'visual');
    await view(p, 'workspace');
  }, steps: [
    { name: 'photos', go: async p => { await click(p, '#visualAddPhotosBtn'); await p.waitForTimeout(500); await click(p, '.visual-photo-tile'); } },
    { name: 'photo-lightbox', go: p => click(p, '.visual-photo-zoom', { force: true }) },
    { name: 'entry-menu', go: async p => { await esc(p); await click(p, '.visual-entry-more'); } },
    { name: 'new-entry', go: async p => { await esc(p); await click(p, '#visualNewEntryBtn'); } },
    { name: 'platform-summary', go: async p => { await esc(p); await view(p, 'publishing'); await click(p, '.publish-list-item .publish-manage-btn'); await choosePlatform(p); await click(p, '#editPlatformPreviewSummary'); } }
  ] },
  { name: 'source', widths: FLOW_WIDTHS, forced: true, setup: async p => {
    await p.route('https://docs.googleapis.com/v1/documents/doc-1?includeTabsContent=true', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(SOURCE_DOC) }));
    await seed(p);
  }, steps: [
    { name: 'source-diff', go: async p => {
      await view(p, 'workspace');
      await p.evaluate(() => {
        StoryFlowIntegrations.hasGoogleToken = () => true;
        StoryFlowIntegrations.restoreGoogleAccess = async () => true;
        sessionStorage.setItem('storyflow.google.access-token.v1', 'test-token');
        const linkedId = crypto.randomUUID();
        state = { ...state, projectSource: { type: 'google', docId: 'doc-1', docName: '測試來源文件' },
          sourceScopes: [{ docId: 'doc-1', docName: '測試來源文件', docUrl: 'https://docs.google.com/document/d/doc-1/edit', tabId: 'tab-1', tabTitle: '本文' }],
          chapters: [
            { id: linkedId, title: '第一章', draft: '舊狗', confirmedBlockCount: 0, parts: [], source: { id: 'doc-1', name: '測試來源文件', url: 'https://docs.google.com/document/d/doc-1/edit', tabId: 'tab-1', tabTitle: '本文', headingOrdinal: 0, headingTitle: '第一章' } },
            { id: crypto.randomUUID(), title: '手動番外', draft: '手動保留內容', confirmedBlockCount: 0, parts: [], source: null }
          ], activeChapterId: linkedId };
        renderAll();
        StoryFlowProjectSourceSync.syncUi();
      });
      await click(p, p.getByRole('button', { name: '更新作品來源', exact: true }));
      await p.locator('#projectSourceDiffDialog').waitFor({ timeout: 4000 });
    } },
    { name: 'source-diff-detail', go: p => click(p, p.locator('#projectSourceDiffDialog').getByText(/查看/).first()) },
    { name: 'visual-images-preview', go: async p => {
      await esc(p);
      await p.evaluate(() => {
        StoryFlowProjects.switchProject(window.__auditWorks.visual, { quiet: true });
        const entry = state.visualEntries[0];
        entry.images = [{ id: 'vi-1', storedName: 'old.png', relativePath: './assets/old.png', alt: '', caption: '舊圖', placement: 'body', order: 0 }];
        entry.coverImageId = 'vi-1';
        renderAll();
      });
      await view(p, 'publishing');
      await click(p, p.locator('.publish-list-item', { hasText: '稽核圖文' }).first().locator('.publish-manage-btn'));
      await choosePlatform(p);
    } }
  ] },
  { name: 'cold', widths: [1440, 800, 390], prepare: { connectedFolder: false }, steps: [
    { name: 'works', go: p => view(p, 'projects') },
    { name: 'workspace', go: p => view(p, 'workspace') },
    { name: 'publishing', go: p => view(p, 'publishing') },
    { name: 'settings', go: p => view(p, 'settings') }
  ] },
  { name: 'phone', widths: [390, 600], context: { hasTouch: true, isMobile: true }, setup: seedRich, steps: [
    { name: 'works', go: p => view(p, 'projects') },
    { name: 'workspace', go: p => view(p, 'workspace') },
    { name: 'publishing', go: async p => { await view(p, 'publishing'); await click(p, '.publish-list-item .publish-manage-btn'); } },
    { name: 'settings', go: async p => { await esc(p); await view(p, 'settings'); } }
  ] },
  { name: 'short-window', widths: [1280], height: 540, setup: seed, steps: [
    { name: 'works', go: p => view(p, 'projects') },
    { name: 'workspace', go: p => view(p, 'workspace') },
    { name: 'publishing', go: async p => { await view(p, 'publishing'); await click(p, '.publish-list-item .publish-manage-btn'); } }
  ] },
  { name: 'reduced-motion', widths: [1440, 390], context: { reducedMotion: 'reduce' }, setup: seed, steps: [
    { name: 'works', go: p => view(p, 'projects') },
    { name: 'workspace', go: p => view(p, 'workspace') }
  ] }
];
