// Records what every element in the app resolves to, so a stylesheet change that should not
// change what anything looks like can be shown not to. Run through scripts/css-fingerprint.mjs.
//
// For each state, every element under <body> gets one hash of its full computed style, its
// ::before and ::after, and its rounded box, keyed by its path in the DOM (ids where there are
// any). A UUID in an id is replaced so runs compare; properties are sorted, because custom properties set at runtime do
// not enumerate in a fixed order; the clock is fixed and notify() is silenced, because both
// change text in the header. Two runs of an unchanged tree give identical files.
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { prepare } from '../browser/support/workbench.js';

const OUT = process.env.CSS_FINGERPRINT_OUT;
const DETAIL = Boolean(process.env.CSS_FINGERPRINT_DETAIL);
const WIDTHS = [1440, 800, 390];

async function fingerprint(page) {
  return page.evaluate(detail => {
    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const pathOf = el => {
      const parts = [];
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        // An id names the element wherever it is; dialogs are appended to <body> in an order
        // that varies between runs. Anything else is counted among its unnamed namesakes.
        if (node.id) { parts.unshift(`${node.tagName}#${node.id.replace(UUID, 'UUID')}`); continue; }
        const index = [...node.parentElement.children].filter(sibling => !sibling.id && sibling.tagName === node.tagName).indexOf(node);
        parts.unshift(`${node.tagName}:${index}`);
      }
      return parts.join('>');
    };
    const hash = text => {
      let h = 2166136261;
      for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(36);
    };
    const props = style => [...style].sort().map(name => `${name}:${style.getPropertyValue(name)}`).join(';');
    const out = {};
    // A toast comes and goes on its own clock, so whether one is showing differs between two
    // runs of the same tree. Its rules are not covered here.
    const transient = document.getElementById('storyflowToastStack');
    document.body.querySelectorAll('*').forEach(el => {
      if (['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(el.tagName)) return;
      if (transient?.contains(el)) return;
      let text = props(getComputedStyle(el));
      ['::before', '::after'].forEach(pseudo => { text += `${pseudo}{${props(getComputedStyle(el, pseudo))}}`; });
      const box = el.getBoundingClientRect();
      text += `|box:${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`;
      out[pathOf(el)] = detail ? text : hash(text);
    });
    return out;
  }, DETAIL);
}

async function seed(page) {
  await page.evaluate(() => {
    window.notify = () => {};
    StoryFlowIntegrations.savePart = async () => 'x.md';
    StoryFlowIntegrations.saveVisualEntry = async payload => `W/${payload.entry.id}`;
    StoryFlowProjects.createProject({ title: '樣式比對長文' }, { quiet: true });
    const chapter = state.chapters[0];
    chapter.title = '比對章節';
    chapter.draft = '第一段正文。\n\n第二段正文。\n\n第三段正文。';
    chapter.confirmedBlockCount = 2;
    chapter.parts = [1, 2].map(index => ({
      id: `fingerprint-part-${index}`, title: `比對文章 ${index}`, chars: 6, startBlock: index - 1, endBlock: index,
      raw: '第一段正文。', formatted: '第一段正文。', summary: '摘要文字', hashtags: '#一 #二', afterword: '後記文字',
      images: [], published: false, platformStatus: { 方格子: index === 2 }
    }));
    renderAll();
    const longform = StoryFlowProjects.activeId();
    StoryFlowProjects.createProject({ title: '樣式比對圖文', contentMode: 'visual', visualEntry: {
      id: 'fingerprint-visual-1', title: '比對圖文', quote: '引言一句。', caption: '圖說', body: '月光。\n\n＊＊＊\n\n第二段。',
      summary: '', hashtags: '', tags: [], images: [], coverImageId: '', platformTitles: {}, platformStatus: {},
      publicationRecords: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    } }, { quiet: true });
    window.__fingerprintProjects = { longform, visual: StoryFlowProjects.activeId() };
    StoryFlowProjects.switchProject(longform, { quiet: true });
  });
}

const settle = page => page.waitForTimeout(300);
const view = async (page, name) => { await page.evaluate(target => window.StoryFlowNavigate(target), name); await settle(page); };
const switchTo = (page, which) => page.evaluate(key => StoryFlowProjects.switchProject(window.__fingerprintProjects[key], { quiet: true }), which);

test('css fingerprint', async ({ page }) => {
  test.skip(!OUT, 'Run through scripts/css-fingerprint.mjs');
  test.setTimeout(600000);
  await prepare(page);
  await page.clock.setFixedTime(new Date('2026-01-05T09:30:00+08:00'));
  const result = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?visual-regression=1');
    await seed(page);
    const snap = async name => { await settle(page); result[`${width}:${name}`] = await fingerprint(page); };

    await view(page, 'projects');
    await snap('works');
    await view(page, 'workspace');
    await snap('workspace-longform');

    await view(page, 'publishing');
    await snap('publishing-list');
    const row = page.locator('.publish-list-item:not(.publishing-combined-row)', { hasText: '比對文章 1' }).first();
    await row.locator('.publish-manage-btn').click();
    await page.locator('.publish-lightbox:not([hidden]) .publish-platform-row:not(.is-default-output) .publish-platform-choose').first().click();
    await page.locator('#editPlatformTitle').click();
    await page.locator('#editPlatformPreviewHashtags').click();
    await snap('publishing-lightbox');
    await page.keyboard.press('Escape');

    await view(page, 'settings');
    await snap('settings');

    await switchTo(page, 'visual');
    await view(page, 'workspace');
    await snap('workspace-visual');
    await view(page, 'publishing');
    const visualRow = page.locator('.publish-list-item:not(.publishing-combined-row)', { hasText: '比對圖文' }).first();
    await visualRow.locator('.publish-manage-btn').click();
    await snap('publishing-visual-lightbox');
    await page.keyboard.press('Escape');

    await page.evaluate(() => window.StoryFlowVisualWorkspace.openTypeChooser());
    await snap('type-chooser-dialog');
  }
  writeFileSync(OUT, JSON.stringify(result));
});
