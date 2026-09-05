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
  expect(actual, selector).toMatchObject(expected);
}

async function longformWorkspace(page) {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await page.goto('/?visual-regression=1');
  await page.locator('#createProjectManually').click();
  await page.getByRole('dialog', { name: '選擇作品類型' }).locator('#chooseLongformType').click();
  await page.locator('#sourceManualBtn').click();
  await page.locator('#manualProjectTitle').fill('契約測試');
  await page.locator('#manualSourceTitle').fill('08、印紋');
  await page.locator('#manualSourceText').fill('第一段。\n\n第二段。\n\n第三段。');
  await page.locator('#previewManualSourceBtn').click();
  await page.locator('#confirmSourcePreviewBtn').click();
  await expect(page.locator('#suggestionCard')).toBeVisible();
}

async function stylesheetOrder(page) {
  return page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => link.getAttribute('href').replace(/^\.\//, '').split('?')[0]));
}

test('the cascade order matches the list the tooling reasons from', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await page.goto('/');
  await expect(page.locator('.sidebar .nav')).toBeVisible();

  // `ensureThemeOrder()` re-appends seven stylesheets at startup, so this is not the
  // order in index.html. scripts/dead-declarations.mjs decides which of two competing
  // declarations wins from the committed list, so the list has to stay true.
  const committed = JSON.parse(readFileSync('scripts/cascade-order.json', 'utf8')).order;
  expect(await stylesheetOrder(page)).toEqual(committed);
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
    backgroundColor: 'rgb(45, 93, 133)',
    color: 'rgb(255, 255, 255)',
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
    backgroundColor: 'rgb(57, 117, 167)',
    color: 'rgb(255, 255, 255)',
    minHeight: '46px'
  });

  // Statistics labels sit on the design token that clears 4.5:1, not the hardcoded
  // value that measured 4.0:1.
  await expectStyle(page, '.stat-card > span', {
    color: 'rgb(88, 116, 139)',
    fontSize: '11.5px'
  });

  // Muted text on a tinted segment needs the stronger token to clear the same bar.
  await expectStyle(page, '.sf-preview-mode-segment button:not(.active)', {
    color: 'rgb(78, 101, 119)'
  });
});

test('connection state carries a non-colour cue', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
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
  await page.locator('#globalSearchBtn').click();
  await expect(page.locator('#globalSearchDialog')).toBeVisible();
  await expectStyle(page, '#globalSearchDialog', {
    position: 'fixed',
    backgroundColor: 'rgb(255, 255, 255)'
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#globalSearchDialog')).toBeHidden();

  await page.locator('#confirmBtn').click();
  await page.locator('.nav-item[data-view="publishing"]').click();
  await expect(page.locator('.publish-list-item').first()).toBeVisible();

  // The publishing row's action vocabulary: management is tinted, preview stays
  // white and outlined, and both share one control height.
  await expectStyle(page, '.publish-list-actions .publish-manage-btn', {
    backgroundColor: 'rgb(234, 243, 249)',
    minHeight: '40px'
  });
  await expectStyle(page, '.publish-list-actions .default-preview-btn', {
    backgroundColor: 'rgb(255, 255, 255)',
    minHeight: '40px'
  });

  // The row overflow menu is an absolutely positioned overlay that no baseline
  // covers, and its only item is destructive.
  await page.locator('.publish-more-btn').first().click();
  await expect(page.locator('.publish-row-overflow-menu').first()).toBeVisible();
  await expectStyle(page, '.publish-row-overflow-menu', {
    position: 'absolute',
    backgroundColor: 'rgb(255, 255, 255)'
  });
  await expectStyle(page, '.publish-row-overflow-menu button', {
    color: 'rgb(180, 79, 89)',
    minHeight: '36px'
  });
});

test('a disabled destructive action renders disabled', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
  await page.goto('/');
  await page.locator('#sidebarSettingsBtn').click();
  await expect(page.locator('#settingsView')).toBeVisible();

  // Danger controls are selected by id or a single class, which outranks the shared
  // `.button:disabled` treatment. With nothing stored, "清除" must be disabled and
  // must not still render in danger red.
  await expect(page.locator('#clearPickerKeyBtn')).toBeDisabled();
  await expectStyle(page, '#clearPickerKeyBtn', {
    color: 'rgb(138, 160, 175)',
    backgroundColor: 'rgb(245, 248, 250)'
  });

  // One action, one label, one weight: both folder controls stay outlined.
  await expect(page.locator('#settingsFolderBtn')).toHaveText('連接資料夾');
  await expectStyle(page, '#settingsFolderBtn', {
    backgroundColor: 'rgb(255, 255, 255)'
  });
});

test('breakpoint visibility is owned by stylesheets, not the hidden attribute', async ({ page }) => {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, route => route.abort());
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
