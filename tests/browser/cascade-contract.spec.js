// Computed-style contract for the shared UI system.
//
// The stylesheets resolve most conflicts with `!important` rather than ownership, so
// a change in one layer can silently alter another surface. Pixel baselines do not
// catch that: they cover three 1440px pages at a 2.5% tolerance, and none of the
// overlays. This spec asserts the resolved values instead — what the cascade actually
// produced — for the controls and overlays that layering fights are about.
//
// A failure here is not automatically a bug. It means a cascade change reached
// further than intended: confirm the new value is wanted, then update the expectation
// in the same commit so the diff records the decision.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { standInForConnectedFolder } from './support/folder.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function computed(page, selector, props) {
  return page.evaluate(({ selector, props }) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const out = { __rendered: rect.width > 0 && rect.height > 0 };
    for (const prop of props) out[prop] = style[prop];
    return out;
  }, { selector, props });
}

async function expectStyle(page, selector, expected) {
  const props = Object.keys(expected).filter(key => key !== '__rendered');
  const actual = await computed(page, selector, props);
  expect(actual, `${selector} is missing from the page`).not.toBeNull();
  // These controls transition their fill, so a single reading can catch a frame of one
  // rather than the value the cascade resolved — a hover fill on its way back out reads as
  // neither colour. Settle on the resolved value instead of asserting the first frame,
  // which is also what keeps this from turning into a sleep tuned to a duration.
  await expect.poll(() => computed(page, selector, props), { message: selector })
    .toMatchObject(expected);
}

async function longformWorkspace(page) {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/?visual-regression=1');
  // Works is the landing page; these helpers are about the workbench. The click starts a
  // smooth window.scrollTo, so wait for the page to come to rest before measuring anything.
  await page.locator('.nav-item[data-view="workspace"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('契約測試');
  await page.locator('#manualSourceTitle').fill('08、印紋');
  await page.locator('#manualSourceText').fill('第一段。\n\n第二段。\n\n第三段。');
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
  // These specs assert resting appearance. The pointer stays wherever the last click left
  // it, and the workspace that replaces the dialog can put a control under it — 確認並存成
  // Markdown lands there once the split panel stops carrying card padding — so the hover
  // fill is what gets measured. Park the pointer off the composition first.
  await page.mouse.move(0, 0);
}

async function stylesheetOrder(page) {
  return page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => link.getAttribute('href').replace(/^\.\//, '').split('?')[0]));
}

test('the cascade order matches the list the tooling reasons from', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  // cascade-order.json is the startup baseline, so this loads the app plainly: a
  // connected folder re-renders the source panel and moves the ensureStyleLast tail.
  await page.goto('/');
  await expect(page.locator('.sidebar .nav')).toBeVisible();

  // `ensureThemeOrder()` re-appends seven stylesheets at startup, so this is not the
  // order in index.html. scripts/dead-declarations.mjs decides which of two competing
  // declarations wins from the committed list, so the list has to stay true.
  const manifest = JSON.parse(readFileSync('scripts/cascade-order.json', 'utf8'));
  const live = await stylesheetOrder(page);

  // The tail is re-appended by ensureStyleLast() on render, so which of those files
  // lands last is a race rather than a fact — the tooling ignores their relative order
  // for that reason, and asserting it here would only produce flakes. What must hold
  // is the fixed order everything else resolves in, and that no stylesheet appeared or
  // went missing.
  const tail = new Set(manifest.indeterminateTail);
  const fixed = list => list.filter(href => !tail.has(href));
  expect(fixed(live)).toEqual(fixed(manifest.order));
  expect([...live].sort()).toEqual([...manifest.order].sort());
});

// dead-selectors.mjs treated a class as produced when it appeared anywhere in the source,
// so `publish-platform-state-line` kept a `.publish-platform-state` rule alive that nothing
// could match. This runs the script on a small tree that holds that case next to the ones
// it must keep: an exact name, a prefix completed at run time, and src/legacy/, which is
// never loaded.
test('dead-selectors judges whole names, not pieces of longer ones', () => {
  const root = test.info().outputPath('dead-selectors');
  mkdirSync(join(root, 'src', 'legacy'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<link rel="stylesheet" href="./style.css">\n<div id="panel" class="state-line"></div>\n');
  writeFileSync(join(root, 'app-loader.js'), "panel.className = 'is-' + mode;\n");
  writeFileSync(join(root, 'src', 'flow.js'), 'row.classList.add(`status-${key}`);\n');
  writeFileSync(join(root, 'src', 'legacy', 'old.js'), "row.className = 'legacy-only';\n");
  writeFileSync(join(root, 'style.css'), [
    '.state-line{gap:4px}',
    '.state strong{font-size:14px}',
    '.is-open{display:block}',
    '.status-done{color:inherit}',
    '#panel{margin:0}',
    '.legacy-only{margin:0}',
    '.state-line,.state{padding:0}'
  ].join('\n') + '\n');

  const run = spawnSync(process.execPath, ['scripts/dead-selectors.mjs', '--check', '--root', root], { encoding: 'utf8' });
  expect(run.status).toBe(1);
  const reported = run.stderr.split('\n').filter(line => line.startsWith('  style.css:')).map(line => line.replace(/^\s*style\.css:\d+\s+/, ''));
  expect(reported).toEqual(['.state strong', '.legacy-only', '.state']);
  expect(run.stderr).toContain('Names: legacy-only state\n');
});

test('only the ensureStyleLast tail changes order while the app is used', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  const before = await stylesheetOrder(page);
  await page.locator('#confirmBtn').click();
  await expect(page.locator('.nav-item[data-view="publishing"]')).toBeVisible();
  await page.waitForTimeout(300);
  const after = await stylesheetOrder(page);

  // Confirming a split makes two modules re-append their own stylesheet, which moves
  // chapter-management.css out of last place. That much is known and tolerated. What
  // must not drift is everything before them, because the tooling orders from it.
  const tail = new Set([
    'styles/domains/project-source-mode.css',
    'styles/domains/source-article-ux.css',
    'styles/domains/chapter-management.css'
  ]);
  expect(before.filter(file => !tail.has(file))).toEqual(after.filter(file => !tail.has(file)));
  expect(new Set(before.slice(-3))).toEqual(tail);
  expect(new Set(after.slice(-3))).toEqual(tail);
});

test('shared controls keep their resolved appearance', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  // Navigation: a flat rail on the page ground, the first and quietest step of a page that
  // brightens towards the work. The active item owns the one fill — the rounded paper fill the
  // chapter rail uses, lighter than hover — with no edge bar; nothing else in the sidebar may
  // claim it, which is what made the collapse toggle read as a destination.
  await expectStyle(page, '.sidebar', { backgroundColor: 'rgb(236, 233, 224)' });
  await expectStyle(page, '.sidebar .nav-item.active', {
    backgroundColor: 'rgb(251, 250, 246)',
    color: 'rgb(34, 31, 26)',
    boxShadow: 'none',
    minHeight: '36px',
    fontSize: '14px'
  });
  await expectStyle(page, '.sidebar .nav-item:not(.active)', {
    backgroundColor: 'rgba(0, 0, 0, 0)'
  });
  await expectStyle(page, '.sidebar-toggle', {
    backgroundColor: 'rgba(0, 0, 0, 0)'
  });
  // The mark keeps its light letter on the dark accent; it used to inherit the menu's ink. A
  // hovered toggle takes a fill only: the white outline it had on the dark menu read as a grey ring.
  await expectStyle(page, '.sidebar .brand-mark', { color: 'rgb(251, 250, 246)', backgroundColor: 'rgb(75, 69, 87)' });
  await page.locator('.sidebar-toggle').hover();
  await expectStyle(page, '.sidebar-toggle', { outlineStyle: 'none', backgroundColor: 'rgb(244, 241, 233)' });
  await page.mouse.move(0, 0);
  await expectStyle(page, '.sidebar', { width: '208px' });

  // A head is its title alone: no English eyebrow above a page, a section or a list, and a page
  // title sized to leave the section heads below it room to read as sections.
  await expectStyle(page, '#workspaceView > .topbar h1', { fontSize: '22px' });
  await expect(page.locator('.eyebrow')).toHaveCount(0);

  // The single solid action of the split review stage.
  await expectStyle(page, '#confirmBtn', {
    backgroundColor: 'rgb(75, 69, 87)',
    color: 'rgb(251, 250, 246)',
    minHeight: '46px'
  });

  // Chapter progress figures sit on the design token that clears 4.5:1, not the hardcoded
  // value that measured 4.0:1. Same contract as the statistics strip they replaced.
  await expectStyle(page, '.chapter-progress-figure', {
    color: 'rgb(106, 99, 87)',
    fontSize: '11.5px'
  });

  // Muted text on a tinted segment needs the stronger token to clear the same bar.
  await expectStyle(page, '.sf-preview-mode-segment button:not(.active)', {
    color: 'rgb(63, 57, 48)'
  });
});

test('connection state carries a non-colour cue', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  // The disconnected dot is half of what this test compares, so no folder stand-in here.
  await page.goto('/');
  await expect(page.locator('#sidebarConnectionStatus')).toBeVisible();

  // Disconnected draws a hollow ring through an inset shadow; connected fills the
  // disc. Hue alone must never be the difference.
  const disconnected = await computed(page, '#sidebarFolderConnection .sidebar-status-dot',
    ['backgroundColor', 'boxShadow']);
  expect(disconnected.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(disconnected.boxShadow).toContain('inset');

  await page.evaluate(() => {
    document.getElementById('sidebarFolderConnection')?.classList.add('connected');
  });
  const connected = await computed(page, '#sidebarFolderConnection .sidebar-status-dot',
    ['backgroundColor', 'boxShadow']);
  expect(connected.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(connected.boxShadow).not.toContain('inset');
});

test('overlays resolve to their own surface rather than inheriting a page rule', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  // Command search: a real modal with no pixel coverage at all.
  await page.locator('#sidebarSearchBtn').click();
  await expect(page.locator('#globalSearchDialog')).toBeVisible();
  await expectStyle(page, '#globalSearchDialog', {
    position: 'fixed',
    backgroundColor: 'rgb(251, 250, 246)'
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#globalSearchDialog')).toBeHidden();

  await page.locator('#confirmBtn').click();
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publish-list-item').first()).toBeVisible();

  // The publishing row's action vocabulary: management is tinted, preview stays
  // white and outlined, and both share one control height.
  await expectStyle(page, '.publish-list-actions .publish-manage-btn', {
    backgroundColor: 'rgb(232, 229, 235)',
    minHeight: '40px'
  });
  await expectStyle(page, '.publish-list-actions .default-preview-btn', {
    backgroundColor: 'rgb(251, 250, 246)',
    minHeight: '40px'
  });

  // The row overflow menu is an absolutely positioned overlay that no baseline
  // covers, and its only item is destructive.
  await page.locator('.publish-more-btn').first().click();
  await expect(page.locator('.publish-row-overflow-menu').first()).toBeVisible();
  await expectStyle(page, '.publish-row-overflow-menu', {
    position: 'absolute',
    backgroundColor: 'rgb(251, 250, 246)'
  });
  await expectStyle(page, '.publish-row-overflow-menu button', {
    color: 'rgb(168, 68, 58)',
    minHeight: '36px'
  });
});

test('a disabled destructive action renders disabled', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/');
  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.locator('#settingsView')).toBeVisible();

  // Danger controls are selected by id or a single class, which outranks the shared
  // `.button:disabled` treatment. With nothing stored, "清除" must be disabled and
  // must not still render in danger red.
  await expect(page.locator('#clearPickerKeyBtn')).toBeDisabled();
  await expectStyle(page, '#clearPickerKeyBtn', {
    color: 'rgb(150, 143, 128)',
    backgroundColor: 'rgb(251, 250, 246)'
  });

  // One action, one label, one weight: both folder controls stay outlined.
  await expect(page.locator('#settingsFolderBtn')).toHaveText('連接資料夾');
  await expectStyle(page, '#settingsFolderBtn', {
    backgroundColor: 'rgb(251, 250, 246)'
  });
});

test('breakpoint visibility is owned by stylesheets, not the hidden attribute', async ({ page }) => {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/');
  await expect(page.locator('.sidebar .nav')).toBeVisible();

  // Desktop reaches Settings from the sidebar footer; the phone promotes it into the
  // bottom bar. Neither width may use `hidden` to express that, because `hidden` is a
  // global rule and a media query must not have to fight it.
  await page.setViewportSize(DESKTOP);
  const desktopNav = await computed(page, '#settingsNav', ['display']);
  expect(desktopNav.__rendered, 'desktop shows the gear, not a nav item').toBe(false);
  expect(await page.locator('#settingsNav').getAttribute('hidden')).toBeNull();
  expect((await computed(page, '#sidebarSettingsBtn', ['display'])).__rendered).toBe(true);

  await page.setViewportSize(PHONE);
  await expect(page.locator('#settingsNav')).toBeVisible();
  expect(await page.locator('#settingsNav').getAttribute('hidden')).toBeNull();
  expect((await computed(page, '#sidebarSettingsBtn', ['display'])).__rendered).toBe(false);

  const visibleNavItems = await page.locator('.sidebar .nav .nav-item')
    .evaluateAll(items => items.filter(item => item.getBoundingClientRect().width > 0).length);
  expect(visibleNavItems, 'the phone bottom bar stays a five-item row').toBe(5);
});

test('the chapter rail trades row height for density only on desktop', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  await expectStyle(page, '#chapterList .chapter-item', { minHeight: '38px' });

  // Narrow and touch layouts keep the 44px touch target.
  await page.setViewportSize(PHONE);
  await expect(page.locator('#chapterList .chapter-item').first()).toBeVisible();
  await expectStyle(page, '#chapterList .chapter-item', { minHeight: '44px' });
});

test('the hidden attribute always wins over a component display rule', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/');

  // `.field-label{display:block}` used to outrank the user-agent rule, so hiding a
  // label left it on screen beside its hidden input.
  const orphan = await page.evaluate(() => {
    const label = document.querySelector('label[for="projectTitle"]');
    const input = document.getElementById('projectTitle');
    const box = el => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { rendered: rect.width > 0 && rect.height > 0, display: getComputedStyle(el).display };
    };
    return { label: box(label), input: box(input) };
  });
  expect(orphan.label.rendered, 'a label may not outlive its hidden control').toBe(false);
  expect(orphan.input.rendered).toBe(false);

  // The rule has to hold for any element, not just this one.
  const forced = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'field-label';
    probe.hidden = true;
    document.body.appendChild(probe);
    const display = getComputedStyle(probe).display;
    probe.remove();
    return display;
  });
  expect(forced).toBe('none');
});

// Longform and visual read the same SOURCE rail, and the same work switcher opens in it.
// Both claims were untrue at once, from one deleted `*/`: the rules that made the switcher
// an overlay sat inside a comment that a commit left unterminated, so the menu rendered in
// flow — shoving the visual rail's fields down the page, and in longform opening as plain
// text far enough down the rail that it read as the button doing nothing. Neither pixel
// baselines nor the DOM assertions caught it, because the markup was correct throughout and
// the menus are closed in every baseline. These are resolved values, which is the level the
// failure actually lived at.
async function visualWorkspace(page) {
  await page.evaluate(() => StoryFlowProjects.createProject(
    { title: '契約圖文', contentMode: 'visual' }, { quiet: true }
  ));
  await expect(page.locator('#visualWorkspace')).toBeVisible();
  await page.mouse.move(0, 0);
}

function railShape(page, selector) {
  return page.locator(selector).evaluate(el => {
    const style = getComputedStyle(el);
    return {
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderRightColor: style.borderRightColor,
      borderTopLeftRadius: style.borderTopLeftRadius,
      padding: style.padding,
      width: Math.round(el.getBoundingClientRect().width)
    };
  });
}

// What the disclosure has to be: a layer over the rail, under the button that opens it,
// carrying its own surface — and leaving the rail's own fields exactly where they were.
async function switcherShape(page, { button, menu, fieldBelow }) {
  const fieldTopBefore = await page.locator(fieldBelow).evaluate(el => Math.round(el.getBoundingClientRect().top));
  const fieldWidthBefore = await page.locator(fieldBelow).evaluate(el => Math.round(el.getBoundingClientRect().width));
  await page.locator(button).click();
  await expect(page.locator(menu)).toBeVisible();
  await expect(page.locator(`${menu} .workspace-project-quick-switch-new`)).toHaveText('＋新增作品');
  const shape = await page.locator(menu).evaluate((el, ids) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const trigger = document.querySelector(ids.button).getBoundingClientRect();
    return {
      position: style.position,
      ownSurface: style.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(style.borderTopWidth) > 0,
      belowTrigger: Math.round(rect.top - trigger.bottom),
      alignedToTrigger: Math.round(rect.right - trigger.right),
      overlaps: rect.top < document.querySelector(ids.fieldBelow).getBoundingClientRect().top
    };
  }, { button, fieldBelow });
  const fieldTopAfter = await page.locator(fieldBelow).evaluate(el => Math.round(el.getBoundingClientRect().top));
  const fieldWidthAfter = await page.locator(fieldBelow).evaluate(el => Math.round(el.getBoundingClientRect().width));
  // Opening the menu lets the longform rail stop clipping, which used to drop its scrollbar
  // gutter and widen every field in it by a scrollbar's width.
  return { ...shape, movedTheRail: fieldTopAfter - fieldTopBefore, widenedTheRail: fieldWidthAfter - fieldWidthBefore };
}

test('both content modes draw one SOURCE rail and open one work switcher over it', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  const longformRail = await railShape(page, '.workspace-grid.workspace-hierarchy > .source-panel');
  const longformSwitcher = await switcherShape(page, {
    button: '#quickSwitchProjectBtn',
    menu: '#workspaceProjectQuickSwitch',
    fieldBelow: '#projectTitle'
  });

  await visualWorkspace(page);

  const visualRail = await railShape(page, '.visual-entry-list-panel');
  const visualSwitcher = await switcherShape(page, {
    button: '#visualProjectSwitchBtn',
    menu: '#visualProjectMenu',
    fieldBelow: '#visualProjectTitle'
  });

  // One rail, the same in both modes: unframed, on the ground, with no line of its own — the
  // page turns from ground to paper where it ends (the view's background, checked below).
  expect(longformRail).toEqual(visualRail);
  expect(longformRail).toMatchObject({
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderTopLeftRadius: '0px',
    padding: '0px 28px 0px 0px'
  });

  expect(longformSwitcher).toEqual(visualSwitcher);
  expect(longformSwitcher).toMatchObject({
    position: 'absolute',
    ownSurface: true,
    belowTrigger: 6,
    alignedToTrigger: 0,
    overlaps: true,
    movedTheRail: 0,
    widenedTheRail: 0
  });
});

// The 作品與章節 and 切篇預覽 heads stand side by side, so they read as one line across the
// workbench — or as two lines 11px apart, which is what they were: the source head carries 切換作品
// beside its title and stood taller. The rail's head is now a small label and the split head a
// title, so they share a centre line rather than a top. Both rails also head their list the same way.
test('the workbench heads share one line and both rails head their list alike', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  const heads = await page.evaluate(() => ['.workspace-grid.workspace-hierarchy > .source-panel > .panel-head', '.splitter-panel > .panel-head']
    .map(selector => {
      const head = document.querySelector(selector);
      const title = head.querySelector('h2');
      const box = title.getBoundingClientRect();
      return {
        rule: Math.round(head.getBoundingClientRect().bottom),
        centre: Math.round((box.top + box.bottom) / 2)
      };
    }));
  expect(heads[0].rule).toBe(heads[1].rule);
  expect(Math.abs(heads[0].centre - heads[1].centre)).toBeLessThanOrEqual(2);

  await expect(page.locator('#chapterListHead')).toBeVisible();
  await expect(page.locator('#chapterListCount')).toHaveText('1 章');
  const longformHead = await page.locator('#chapterListHead').evaluate(el => ({
    rule: getComputedStyle(el).borderTopWidth,
    padding: getComputedStyle(el).paddingTop,
    title: getComputedStyle(el.querySelector('h3')).fontSize
  }));

  await visualWorkspace(page);
  const visualHead = await page.locator('.visual-entry-section-head').evaluate(el => ({
    rule: getComputedStyle(el).borderTopWidth,
    padding: getComputedStyle(el).paddingTop,
    title: getComputedStyle(el.querySelector('h3')).fontSize
  }));
  expect(longformHead).toEqual(visualHead);
});

// A toolbar row is one control height. The split head mixed a 40px format select and a 40px
// segmented control with 34px buttons, at three radii and two label sizes, because the select's
// own 34px rule lost to a shared `!important` and the segment's height was its buttons plus
// padding. Every control a row holds now resolves to the same box.
test('a toolbar row resolves to one control height, label size and radius', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  const row = ['#suggestionPlatformSelect', '.splitter-panel .sf-preview-mode-segment', '#splitSettingsToggle',
    '#openReadingViewBtn', '#quickSwitchProjectBtn', '.splitter-panel .preview-boundary-controls'];
  const boxes = await page.evaluate(selectors => selectors.map(selector => {
    const el = document.querySelector(selector);
    return { selector, height: Math.round(el.getBoundingClientRect().height), radius: getComputedStyle(el).borderTopLeftRadius };
  }), row);
  for (const box of boxes) expect(box, box.selector).toEqual({ selector: box.selector, height: 34, radius: '8px' });

  for (const selector of ['#suggestionPlatformSelect', '.splitter-panel .sf-preview-mode-segment button', '#splitSettingsToggle',
    '#openReadingViewBtn', '#quickSwitchProjectBtn', '#shrinkBtn']) {
    await expectStyle(page, selector, { fontSize: '14px' });
  }
  // A toolbar's controls are one family: the segment's fill and no frame, for the select, 設定 and
  // 讀稿檢視 alike. The scene buttons are one control, so neither half draws a frame.
  for (const selector of ['#suggestionPlatformSelect', '#splitSettingsToggle', '#openReadingViewBtn', '#quickSwitchProjectBtn']) {
    await expectStyle(page, selector, { borderTopColor: 'rgba(0, 0, 0, 0)', backgroundColor: 'rgb(244, 241, 233)' });
  }
  // The suggestion's status is a state, not a control: no fill.
  await expectStyle(page, '#suggestionStatus', { backgroundColor: 'rgba(0, 0, 0, 0)' });
  await expectStyle(page, '#shrinkBtn', { borderTopWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)' });
  await expectStyle(page, '.splitter-panel .preview-boundary-controls', { backgroundColor: 'rgb(244, 241, 233)' });

  // Space separates the head, the progress line and the manuscript; no rule is drawn between
  // them, and on the desktop ground the manuscript's paper is its own edge.
  for (const selector of ['.workspace-grid.workspace-hierarchy > .source-panel > .panel-head', '.splitter-panel > .panel-head', '#chapterProgress']) {
    await expectStyle(page, selector, { borderBottomWidth: '0px' });
  }
  await expectStyle(page, '#chapterListHead', { borderTopWidth: '0px' });
  await expectStyle(page, '#preview', { borderTopWidth: '0px', backgroundColor: 'rgb(251, 250, 246)' });

  // Below 820px the page itself is paper: the controls grow to the touch height together, and
  // the manuscript draws its edge again.
  await page.setViewportSize({ width: 820, height: 900 });
  const tablet = await page.evaluate(selectors => selectors.map(selector =>
    Math.round(document.querySelector(selector).getBoundingClientRect().height)), row.slice(0, 4));
  expect(new Set(tablet)).toEqual(new Set([40]));
  await expectStyle(page, '#preview', { borderTopWidth: '1px' });
});

// The chapter rail marks how far each chapter's split has got, sets a chapter's number apart from
// its name, and spends its weight on the current chapter. Each row is one line: the figures live
// in the tooltip, because written under every row they repeated the split panel's progress line.
// The work's name is text edited in place, and the rare actions — 更新作品來源, 新增文章, a
// row's ⋯ — rest quietly.
test('the chapter rail marks each chapter\'s progress and keeps rare actions quiet', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  const row = page.locator('#chapterList .chapter-row').first();
  await expect(row.locator('.chapter-no')).toHaveText('08');
  await expect(row.locator('.chapter-name')).toHaveText('印紋');
  await expect(row.locator('.chapter-main-button')).toHaveAttribute('title', '未開始');
  await expect(row.locator('.chapter-mark')).toHaveText('');
  // One line: the row is no taller than its 38px desktop floor needs.
  expect(await row.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(46);
  await expectStyle(page, '#chapterList .chapter-item.active .chapter-name', { fontWeight: '700' });
  await expectStyle(page, '#chapterList .chapter-item small', { fontWeight: '500' });
  // The name and the length share a baseline; the length used to sit a few pixels above it.
  const baselines = await row.evaluate(node => {
    const name = node.querySelector('.chapter-name').getBoundingClientRect();
    const chars = node.querySelector('small').getBoundingClientRect();
    return Math.abs(name.bottom - chars.bottom) <= 2;
  });
  expect(baselines).toBe(true);

  // Confirming the whole chapter marks it finished in the rail and in the list head.
  await page.locator('#confirmBtn').click();
  await expect(row.locator('.chapter-main-button')).toHaveAttribute('title', '已切完 · 1 篇');
  await expect(row.locator('.chapter-mark')).toHaveText('✓');
  await expect(page.locator('#chapterListCount')).toHaveText('1 章 · 已切完 1 章');

  await expectStyle(page, '#projectTitle', { borderTopColor: 'rgba(0, 0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)', fontSize: '19px' });
  // A row is drawn like the menu's items: no rule under it, a rounded fill when it is current.
  await expectStyle(page, '#chapterList .chapter-row.active', { borderBottomWidth: '0px', borderLeftWidth: '0px', borderTopLeftRadius: '8px', backgroundColor: 'rgb(251, 250, 246)' });
  await expect(page.locator('#projectTitle')).toHaveAccessibleName('作品名稱');
  await expect(page.locator('#projectTitle')).toHaveValue('契約測試');
  await expectStyle(page, '#addChapterBtn', { borderTopColor: 'rgba(0, 0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)', height: '34px' });

  // Rows close up: the current row's fill meets the hairline above and below it.
  await expectStyle(page, '#chapterList', { rowGap: '0px' });

  // A row's ⋯ waits for the row where a pointer can find it, and the current row shows it.
  await page.locator('#addChapterBtn').hover();
  await expectStyle(page, '#chapterList .chapter-row.active .chapter-more-button', { opacity: '1' });
});

// Left to right the page unfolds: the menu and the rail on the ground, the work on one sheet of
// paper that meets the window's top, right and bottom edges. The paper used to stop 35px short
// of the right edge and below the page title, so it read as one more box among the others.
test('each view is one sheet of paper that meets the window edges, and the workbench turns to it where the rail ends', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  const sheet = await page.evaluate(() => {
    const view = document.getElementById('workspaceView').getBoundingClientRect();
    const rail = document.querySelector('.workspace-grid.workspace-hierarchy > .source-panel').getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    const style = getComputedStyle(document.getElementById('workspaceView'));
    // The gradient's first stop is where ground turns to paper, measured from the view's left.
    const stop = Number(/\) ([\d.]+)px/.exec(style.backgroundImage)?.[1]);
    return {
      top: Math.round(view.top), right: Math.round(view.right), left: Math.round(view.left),
      sidebarRight: Math.round(sidebar.right), innerWidth,
      turn: Math.round(view.left + stop), railRight: Math.round(rail.right)
    };
  });
  expect(sheet.top).toBe(0);
  expect(sheet.right).toBe(sheet.innerWidth);
  expect(sheet.left).toBe(sheet.sidebarRight);
  expect(sheet.turn).toBe(sheet.railRight);
  // The manuscript is text on that paper, not a card on it.
  await expectStyle(page, '#preview', { borderTopWidth: '0px', paddingLeft: '0px' });

  for (const view of ['projects', 'publishing']) {
    await page.locator(`.nav-item[data-view="${view}"]`).click();
    await expectStyle(page, `#${view}View`, { backgroundColor: 'rgb(251, 250, 246)', marginTop: '-28px' });
  }
  // The publishing queue is rows on the page, not a frame on it: its unframed rule now outranks
  // the shared card rule that used to draw the frame anyway.
  await expectStyle(page, '.publishing-dashboard-panel', { borderTopWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)' });
});

// A full-width toolbar over prose held to its reading measure left a blank strip down the right
// of the sheet. The split preview is one page instead: toolbar and prose share a width, and the
// page sits in the middle of what the paper has, so the rest is an even margin. The visual
// editor's fields are the same page.
test('in both content modes the work is one page in the middle of the sheet', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  const layout = await page.evaluate(() => {
    const column = document.querySelector('.workspace-main-column');
    const box = column.getBoundingClientRect();
    const inner = { left: box.left + parseFloat(getComputedStyle(column).paddingLeft), right: box.right - parseFloat(getComputedStyle(column).paddingRight) };
    const pageBox = document.querySelector('.workspace-main-column > .splitter-panel').getBoundingClientRect();
    const actions = document.getElementById('smartSplitHeaderActions').getBoundingClientRect();
    const prose = document.querySelector('#preview .sf-preview-rendered-root').getBoundingClientRect();
    return {
      width: Math.round(pageBox.width),
      margins: [Math.round(pageBox.left - inner.left), Math.round(inner.right - pageBox.right)],
      toolbarToPage: Math.round(pageBox.right - actions.right),
      proseLeft: Math.round(prose.left - pageBox.left)
    };
  });
  // 36 characters of 16px prose is 576px, under the toolbar's own 600px.
  expect(layout.width).toBe(600);
  expect(Math.abs(layout.margins[0] - layout.margins[1])).toBeLessThanOrEqual(1);
  expect(layout.margins[0]).toBeGreaterThan(0);
  expect(layout.toolbarToPage).toBe(0);
  expect(layout.proseLeft).toBe(0);

  await visualWorkspace(page);
  const visual = await page.evaluate(() => {
    const panel = document.querySelector('.visual-editor-panel');
    const box = panel.getBoundingClientRect();
    const left = box.left + parseFloat(getComputedStyle(panel).paddingLeft);
    const pageBox = [...panel.children].find(child => !child.hidden).getBoundingClientRect();
    return { width: Math.round(pageBox.width), margins: [Math.round(pageBox.left - left), Math.round(box.right - pageBox.right)] };
  });
  expect(visual.width).toBe(layout.width);
  expect(Math.abs(visual.margins[0] - visual.margins[1])).toBeLessThanOrEqual(1);
  expect(visual.margins[0]).toBeGreaterThan(0);
});

// The rail's edge can be dragged. The width belongs to this browser (localStorage), is shared by
// both workspaces, never leaves the work column under 600px, and a double click restores it.
test('the rail edge can be dragged, is remembered, and goes back to its default', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);

  const measure = () => page.evaluate(() => {
    const view = document.getElementById('workspaceView');
    const grid = [...document.querySelectorAll('.workspace-grid.workspace-hierarchy, .visual-workspace-layout')]
      .find(el => el.getBoundingClientRect().width);
    const rail = grid.querySelector(':scope > .source-panel').getBoundingClientRect();
    const work = grid.querySelector(':scope > .workspace-main-column, :scope > .visual-editor-panel').getBoundingClientRect();
    const handle = grid.querySelector(':scope > .sf-rail-resizer');
    const stop = Number(/\) ([\d.]+)px/.exec(getComputedStyle(view).backgroundImage)?.[1]);
    return {
      rail: Math.round(rail.width), work: Math.round(work.width),
      turnAtRail: Math.round(view.getBoundingClientRect().left + stop) === Math.round(rail.right),
      handleAtRail: Math.abs(handle.getBoundingClientRect().left + 6 - rail.right) < 1,
      valuenow: handle.getAttribute('aria-valuenow'),
      stored: localStorage.getItem('storyflow.ui.railWidth')
    };
  });

  const before = await measure();
  expect(before).toMatchObject({ rail: 320, turnAtRail: true, handleAtRail: true, stored: null });

  const handle = page.locator('.workspace-grid .sf-rail-resizer');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 6, 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 6 + 80, 420, { steps: 4 });
  await page.mouse.up();
  await expect.poll(measure).toMatchObject({ rail: 400, turnAtRail: true, handleAtRail: true, valuenow: '400', stored: '400' });

  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(measure).toMatchObject({ rail: 416, stored: '416' });

  // A width far past what the window has stops where the work column would drop under 600px.
  await page.evaluate(() => StoryFlowRailWidth.set(640));
  const capped = await measure();
  expect(capped.work).toBeGreaterThanOrEqual(600);
  expect(capped.work).toBeLessThanOrEqual(601);

  // Both workspaces draw the one width, and a reload keeps it.
  await page.evaluate(() => StoryFlowRailWidth.set(380));
  await page.reload();
  await page.locator('.nav-item[data-view="workspace"]').click();
  await visualWorkspace(page);
  await expect.poll(measure).toMatchObject({ rail: 380, turnAtRail: true, handleAtRail: true, stored: '380' });

  await page.locator('#visualWorkspace .sf-rail-resizer').dblclick();
  await expect.poll(measure).toMatchObject({ rail: 320, stored: null });

  await page.setViewportSize(PHONE);
  await expect(page.locator('#visualWorkspace .sf-rail-resizer')).toBeHidden();
});

// A dialog head is part of its card. It used to be a white band over warm paper, and a
// reserved scrollbar gutter stopped its rule 15px short of the card's edge on every dialog
// whose content did not scroll.
test('a dialog head is the card\'s own paper and its rule reaches the card edge', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await standInForConnectedFolder(page);
  await page.goto('/?visual-regression=1');
  await page.locator('.nav-item[data-view="workspace"]').click();
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await expect(page.locator('#sourceDialog')).toBeVisible();

  const head = await page.locator('#sourceDialog .sticky-dialog-head').evaluate(el => {
    const card = el.closest('.dialog-card');
    return {
      shortOfEdge: Math.round(card.getBoundingClientRect().right - el.getBoundingClientRect().right),
      // The card may leave its paper to the dialog under it; compare with whichever paints.
      sameSurface: getComputedStyle(el).backgroundColor === [card, card.closest('dialog')]
        .map(node => getComputedStyle(node).backgroundColor)
        .find(color => color !== 'rgba(0, 0, 0, 0)')
    };
  });
  expect(head).toEqual({ shortOfEdge: 0, sameSurface: true });
});

// Collapsed, a publishing article is a row: the shared layer used to give it a 12px radius
// and colour its reserved marker gutter, so the row drew half a box — a left edge curving
// into the rule under it. Expanded, it is the one frame between the queue and the manuscript,
// and that frame used to lose its bottom edge to the last-row rule.
test('a publishing article is a row until it opens, then one closed frame', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  await page.evaluate(() => { window.StoryFlowIntegrations.savePart = async () => 'x.md'; });
  await page.locator('#confirmBtn').click();
  await page.locator('.nav-item[data-view="publishing"]').click();
  const row = page.locator('.publish-list-item').first();
  await expect(row).toBeVisible();
  await page.mouse.move(0, 0);

  await expectStyle(page, '.publish-list-item:not(.expanded)', {
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderLeftWidth: '2px',
    borderLeftColor: 'rgba(0, 0, 0, 0)',
    borderTopLeftRadius: '0px',
    borderBottomLeftRadius: '0px'
  });

  await row.locator('.publish-manage-btn').click();
  await expect(row).toHaveClass(/expanded/);
  await expectStyle(page, '.publish-list-item.expanded', {
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderBottomColor: 'rgb(222, 217, 204)',
    borderTopLeftRadius: '14px',
    boxShadow: 'none'
  });
  // Tint is how the expander says it is open; the 3px inset bar it also drew is gone.
  await expectStyle(page, '.publish-list-item.expanded .publish-manage-btn', { boxShadow: 'none' });
});

// A work is a row in the works list. The stylesheets say so in works-library.css and said
// the opposite in the two shared card rules, which name components by class and load later:
// same specificity, also !important, so the row contract never rendered and every work drew
// a 16px card. The list's own rule across the top then met a rounded corner immediately
// under it, which reads as the card pushing through the line. Neither the baseline (one work,
// under tolerance) nor any DOM assertion caught it, because the markup was right the whole
// time — only the resolved values were wrong, which is this file's subject.
test('a work resolves to a row in a list, not a card', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  // Three works, so there is a row that is neither the current one nor the last: the last
  // deliberately has no separator, because the list's own edge already ends it.
  await page.evaluate(() => {
    StoryFlowProjects.createProject({ title: '契約第二作品', contentMode: 'longform' }, { quiet: true });
    StoryFlowProjects.createProject({ title: '契約第三作品', contentMode: 'longform' }, { quiet: true });
  });
  await page.evaluate(() => StoryFlowProjects.switchProject(
    StoryFlowProjects.list().find(project => project.title === '契約測試').id, { quiet: true }
  ));
  await page.locator('.nav-item[data-view="projects"]').click();
  // The works list is re-rendered by handlers that run on their own turn of the event loop,
  // so "the first card exists" is not "the list is the one this test is about". Wait for the
  // three works, and for the current one to be marked, before reading anything off them.
  await expect(page.locator('.project-library-card')).toHaveCount(3);
  await expect(page.locator('.project-library-card.active')).toHaveCount(1);
  await page.mouse.move(0, 0);

  // No frame of its own, and no radius: the list draws the separation, the row does not.
  await expectStyle(page, '.project-library-card:not(.active):not(:last-child)', {
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderBottomWidth: '1px',
    borderTopLeftRadius: '0px',
    backgroundColor: 'rgba(0, 0, 0, 0)'
  });

  // The marker gutter is reserved on every row, so marking one current colours a border that
  // is already there instead of moving the others sideways.
  await expectStyle(page, '.project-library-card:not(.active):not(:last-child)', { borderLeftWidth: '2px' });
  await expectStyle(page, '.project-library-card.active', {
    borderLeftWidth: '2px',
    borderLeftColor: 'rgb(75, 69, 87)',
    backgroundColor: 'rgb(232, 229, 235)',
    borderTopLeftRadius: '0px'
  });

  // The list states its own top edge; a row starting under it must not curve away from it.
  // Polled, not read once: a single geometry reading can land on a re-render, and this one
  // failed on CI exactly that way while passing on the retry.
  await expect.poll(() => page.locator('.projects-library').evaluate(list => {
    const first = list.querySelector('.project-library-card');
    if (!first) return null;
    return {
      gap: Math.round(first.getBoundingClientRect().top - list.getBoundingClientRect().top),
      rowRadius: getComputedStyle(first).borderTopLeftRadius,
      listRule: getComputedStyle(list).borderTopWidth
    };
  }), { message: 'the first row meets the list rule without a radius between them' })
    .toEqual({ gap: 1, rowRadius: '0px', listRule: '1px' });
});

test('works and publishing draw the same hierarchy', async ({ page }) => {
  // Both pages show 作品 › 章節 (› 篇), and each used to draw it its own way: Works indented a
  // chapter 21px and separated rows with hairlines, Publishing indented nothing at all. What
  // a row *contains* is each page's business; how deep it sits, what separates it from its
  // sibling, and where the current marker goes are not, and that is what this pins.
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  await page.evaluate(() => { window.StoryFlowIntegrations.savePart = async () => 'x.md'; });
  await page.locator('#confirmBtn').click();

  // A second chapter, cloned from the first so the fixture carries whatever shape the
  // publishing renderer expects rather than a hand-built guess at it.
  await page.evaluate(() => {
    const first = state.chapters[0];
    const clone = JSON.parse(JSON.stringify(first.parts[0]));
    clone.id = 'contract-part-2';
    clone.name = `${clone.name || ''}（二）`;
    const second = JSON.parse(JSON.stringify(clone));
    second.id = 'contract-part-3';
    second.name = `${first.parts[0].name || ''}（三）`;
    state.chapters.push({
      ...JSON.parse(JSON.stringify(first)), id: 'contract-chapter-2', title: '09、第二章', parts: [clone, second]
    });
    window.renderAll?.();
  });

  const hierarchy = async (nest, row) => page.evaluate(([nestSelector, rowSelector]) => {
    const nested = document.querySelector(nestSelector);
    const first = document.querySelector(rowSelector);
    if (!nested || !first) return null;
    const nestedStyle = getComputedStyle(nested);
    const rowStyle = getComputedStyle(first);
    return {
      indent: nestedStyle.paddingLeft,
      separator: rowStyle.borderBottomColor,
      separatorWidth: rowStyle.borderBottomWidth,
      markerGutter: rowStyle.borderLeftWidth,
      // The gutter is reserved, not drawn, until a row is current.
      markerGutterColor: rowStyle.borderLeftColor,
      corner: rowStyle.borderTopLeftRadius
    };
  }, [nest, row]);

  await page.locator('.nav-item[data-view="projects"]').click();
  await page.getByRole('button', { name: '管理章節', exact: true }).click();
  await expect(page.locator('.project-chapter-manager-row').first()).toBeVisible();
  // Not the last row: the last one deliberately has no separator, because the level's own
  // edge already ends it.
  const works = await hierarchy('.project-chapter-manager-list', '.project-chapter-manager-row:not(:last-child)');
  const worksDisclosure = await page.getByRole('button', { name: '收合章節', exact: true })
    .getAttribute('aria-expanded');

  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publishing-chapter-group').first()).toBeVisible();
  const publishing = await hierarchy('.publishing-chapter-group-rows', '.publishing-chapter-group-rows > .publish-list-item:not(:last-child)');
  const publishingDisclosure = await page.locator('.publishing-project-collapse-btn').first()
    .getAttribute('aria-expanded');

  expect(works, 'works hierarchy is missing').not.toBeNull();
  expect(publishing, 'publishing hierarchy is missing').not.toBeNull();
  expect(works).toEqual(publishing);
  // One step, stated once, so a level cannot drift to "about the same depth".
  expect(works.indent).toBe('16px');
  expect(works.markerGutter).toBe('2px');
  expect(works.markerGutterColor).toBe('rgba(0, 0, 0, 0)');
  expect(works.corner).toBe('0px');

  // Both expanders say what they are; only whether they also carry a label differs, because
  // a work row's expander is a named action and a chapter group's is not.
  expect(worksDisclosure).toBe('true');
  expect(publishingDisclosure).not.toBeNull();
});

// Round-two review of the same page family: what is left once the frames are right is whether
// the pieces agree with each other. Each of these disagreed until it was measured.
test('publishing groups by space, menus share one glyph, and the preview foot lines up', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  await page.evaluate(() => { window.StoryFlowIntegrations.savePart = async () => 'x.md'; });
  await page.locator('#confirmBtn').click();
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publish-list-item').first()).toBeVisible();
  await page.mouse.move(0, 0);

  // Filter groups are parted by space; a hairline on a group that wrapped to a new line stood
  // at the left edge with nothing before it.
  for (const group of ['#publishingContentTypeFilters', '#publishingFilters']) {
    await expectStyle(page, group, { borderLeftWidth: '0px', borderRightWidth: '0px' });
  }
  await expectStyle(page, '.publishing-filter-stack', { columnGap: '20px' });

  // Every row menu sets 刪除's glyph in the same box.
  await page.locator('.publish-list-item .publish-more-btn').first().click();
  const publishGlyph = { width: '18px', fontSize: '17px', label: '12.5px' };
  await expect.poll(() => page.evaluate(() => {
    const glyph = document.querySelector('.publish-row-overflow-menu:not([hidden]) button > span:first-child');
    if (!glyph) return null;
    return { width: getComputedStyle(glyph).width, fontSize: getComputedStyle(glyph).fontSize, label: getComputedStyle(glyph.parentElement).fontSize };
  })).toEqual(publishGlyph);
  await page.keyboard.press('Escape');
  await page.locator('.nav-item[data-view="workspace"]').click();
  await page.locator('#chapterList .chapter-more-button').first().click();
  // The rail decorates its rows on its own turn after the view changes; read the menu once it
  // has settled rather than the first frame after the click.
  await expect.poll(() => page.evaluate(() => {
    const glyph = document.querySelector('.chapter-row-action-menu:not([hidden]) .chapter-row-delete-menu-item > span:first-child');
    if (!glyph) return null;
    return { width: getComputedStyle(glyph).width, fontSize: getComputedStyle(glyph).fontSize, label: getComputedStyle(glyph.parentElement).fontSize };
  })).toEqual(publishGlyph);
  await page.keyboard.press('Escape');

  // The preview's actions start where the manuscript box does: the shared layer used to pad
  // them 22px in as though they were still a dialog footer.
  await page.locator('.nav-item[data-view="publishing"]').click();
  const row = page.locator('.publish-list-item').first();
  await row.locator('.publish-manage-btn').click();
  await expect(row.locator('.platform-preview-actions')).toBeVisible();
  const foot = await row.evaluate(node => {
    const box = node.querySelector('.platform-preview-content, .platform-preview-body pre, .platform-preview-body .sf-preview-surface');
    const actions = node.querySelector('.platform-preview-actions');
    return {
      paddingLeft: getComputedStyle(actions).paddingLeft,
      paddingRight: getComputedStyle(actions).paddingRight,
      leftEdge: Math.round(actions.getBoundingClientRect().left - box.getBoundingClientRect().left),
      rightEdge: Math.round(actions.getBoundingClientRect().right - box.getBoundingClientRect().right)
    };
  });
  expect(foot).toEqual({ paddingLeft: '0px', paddingRight: '0px', leftEdge: 0, rightEdge: 0 });
});

test('on a phone the works row and the manual form keep their primary actions whole', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await longformWorkspace(page);
  await page.locator('.nav-item[data-view="projects"]').click();
  const card = page.locator('.project-library-card').first();
  await expect(card).toBeVisible();
  // 開啟 | 管理發布 | ⋯, then the chapter disclosure across the whole next line — it used to sit
  // alone in the right half of that line.
  const layout = await card.locator('.project-library-actions').evaluate(actions => {
    const box = selector => actions.querySelector(selector).getBoundingClientRect();
    const open = box('.project-open-btn');
    const chapters = box('.project-manage-chapters-btn');
    const more = box('.project-library-more-btn');
    return {
      disclosureBelow: chapters.top >= open.bottom,
      disclosureSpans: Math.round(chapters.left) === Math.round(open.left) && Math.round(chapters.right) === Math.round(more.right)
    };
  });
  expect(layout).toEqual({ disclosureBelow: true, disclosureSpans: true });

  await page.locator('.nav-item[data-view="workspace"]').click();
  await page.locator('#addChapterBtn').click();
  const actions = page.locator('#manualSourceDialog .source-flow-actions');
  await expect(actions).toBeVisible();
  const primary = await actions.evaluate(bar => {
    const button = bar.querySelector('.button.primary');
    const style = getComputedStyle(bar);
    const inner = bar.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const buttons = [...bar.querySelectorAll('.button')].filter(node => node.offsetParent !== null);
    return {
      fullWidth: Math.abs(button.getBoundingClientRect().width - inner) <= 1,
      last: buttons[buttons.length - 1] === button || Math.max(...buttons.map(node => node.getBoundingClientRect().top)) === button.getBoundingClientRect().top
    };
  });
  expect(primary).toEqual({ fullWidth: true, last: true });
});

// Toasts sat in the bottom-right corner, which is where each page keeps its main action, and
// covered 確認並存成 Markdown two or three deep after adding an article. On a desktop they
// now sit at the top of the content column; phones keep them above the bottom navigation.
test('toasts stay clear of the page actions', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  await page.evaluate(() => window.notify?.('契約提示'));
  const toast = page.locator('.storyflow-toast', { hasText: '契約提示' });
  await expect(toast).toBeVisible();
  const desktop = await toast.evaluate(node => {
    const box = node.getBoundingClientRect();
    const confirm = document.getElementById('confirmBtn').getBoundingClientRect();
    const title = document.querySelector('#workspaceView h1').getBoundingClientRect();
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    // Earlier toasts from creating the work may still be stacked above this one.
    const stack = node.closest('.storyflow-toast-stack').getBoundingClientRect();
    return { nearTop: stack.top < 40, overConfirm: overlaps(box, confirm), overTitle: overlaps(box, title) };
  });
  expect(desktop).toEqual({ nearTop: true, overConfirm: false, overTitle: false });

  await page.setViewportSize(PHONE);
  await page.evaluate(() => window.notify?.('手機提示'));
  const phoneToast = page.locator('.storyflow-toast', { hasText: '手機提示' });
  await expect(phoneToast).toBeVisible();
  const phone = await phoneToast.evaluate(node => {
    const box = node.getBoundingClientRect();
    const nav = document.querySelector('.sidebar .nav').getBoundingClientRect();
    return { aboveNav: box.bottom <= nav.top + 1, lowerHalf: box.top > innerHeight / 2 };
  });
  expect(phone).toEqual({ aboveNav: true, lowerHalf: true });
});

// The compact dialogs kept their head's rule inside the card's padding while every other
// dialog ran it to the edges. And the split preferences once opened with a second 切篇偏好 under
// the disclosure that already said it; inside 設定 the section heading names them exactly once.
test('compact dialog heads run to the edge, and split preferences are named once', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await longformWorkspace(page);
  const previewTop = () => page.locator('#preview').evaluate(node => Math.round(node.getBoundingClientRect().top));
  const closedTop = await previewTop();
  await page.locator('#splitSettingsToggle').click();
  const sheet = page.getByRole('dialog', { name: '設定' });
  await expect(sheet.getByRole('group', { name: '切篇偏好' })).toBeVisible();
  await expect(sheet.getByRole('group', { name: '閱讀設定' })).toBeVisible();
  await expect(sheet.getByText('切篇偏好', { exact: true })).toHaveCount(1);
  await expect(page.locator('#smartSplitMiniSettings .smart-split-settings-label')).toHaveCount(0);
  // Opening it is a layer over the preview: nothing below the head moves.
  expect(await previewTop()).toBe(closedTop);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await visualWorkspace(page);
  await page.locator('#visualNewEntryBtn').click();
  const head = page.locator('.visual-entry-dialog .dialog-card > .panel-head').first();
  await expect(head).toBeVisible();
  const edges = await head.evaluate(node => {
    const card = node.closest('.dialog-card').getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return { left: Math.round(box.left - card.left), right: Math.round(card.right - box.right), rule: getComputedStyle(node).borderBottomWidth };
  });
  expect(edges).toEqual({ left: 0, right: 0, rule: '1px' });
});
