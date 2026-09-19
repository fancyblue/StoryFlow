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

import { readFileSync } from 'node:fs';
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

  // Navigation: the active item owns the strong fill; nothing else in the sidebar
  // may claim it, which is what made the collapse toggle read as a destination.
  await expectStyle(page, '.sidebar .nav-item.active', {
    backgroundColor: 'rgb(58, 53, 68)',
    color: 'rgb(251, 250, 246)',
    minHeight: '48px'
  });
  await expectStyle(page, '.sidebar .nav-item:not(.active)', {
    backgroundColor: 'rgba(0, 0, 0, 0)'
  });
  await expectStyle(page, '.sidebar-toggle', {
    backgroundColor: 'rgba(255, 255, 255, 0.06)'
  });

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
  return { ...shape, movedTheRail: fieldTopAfter - fieldTopBefore };
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

  // One rail, drawn by one hairline between the columns rather than a frame around each.
  expect(longformRail).toEqual(visualRail);
  expect(longformRail).toMatchObject({
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderTopWidth: '0px',
    borderRightWidth: '1px',
    borderRightColor: 'rgb(222, 217, 204)',
    borderTopLeftRadius: '0px',
    padding: '0px 18px 0px 0px'
  });

  expect(longformSwitcher).toEqual(visualSwitcher);
  expect(longformSwitcher).toMatchObject({
    position: 'absolute',
    ownSurface: true,
    belowTrigger: 6,
    alignedToTrigger: 0,
    overlaps: true,
    movedTheRail: 0
  });
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
      markerGutter: rowStyle.borderLeftWidth
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

  // Both expanders say what they are; only whether they also carry a label differs, because
  // a work row's expander is a named action and a chapter group's is not.
  expect(worksDisclosure).toBe('true');
  expect(publishingDisclosure).not.toBeNull();
});
