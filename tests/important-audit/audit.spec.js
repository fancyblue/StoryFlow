// Measures which `!important` declarations can go without changing anything. Run through
// scripts/css-important.mjs, which writes the candidates and reads the results; on its own
// (outside that script) every test is skipped.
import { test } from '@playwright/test';
import { prepare } from '../browser/support/workbench.js';
import { run, context, instrument, measure, measureForced } from './lib/engine.mjs';
import { scenes, FLOW_WIDTHS, FORCED_WIDTHS } from './lib/scenes.mjs';

const RUN = run();
const QUICK = Boolean(process.env.IMPORTANT_AUDIT_QUICK);

async function open(browser, scene, width) {
  const browserContext = await browser.newContext({ ...(scene.context || {}), viewport: { width, height: scene.height || 900 } });
  const page = await browserContext.newPage();
  await prepare(page, scene.prepare || {});
  await instrument(page);
  await page.clock.setFixedTime(new Date('2026-01-05T09:30:00+08:00'));
  await page.goto('/?visual-regression=1');
  await page.waitForTimeout(400);
  await scene.setup?.(page);
  return { browserContext, page };
}

async function walk(page, scene, width, each) {
  for (const step of scene.steps) {
    try { await step.go(page); } catch (error) {
      console.log(`  skipped ${scene.name}:${step.name}@${width}: ${error.message.split('\n')[0]}`);
      continue;
    }
    await page.waitForTimeout(350);
    await each(`${scene.name}:${step.name}@${width}`);
  }
}

for (const scene of scenes) {
  test(`measure ${scene.name}`, async ({ browser }) => {
    test.skip(!RUN, 'Run through scripts/css-important.mjs');
    const ctx = context(RUN, `measure-${scene.name}`);
    const widths = QUICK && scene.widths.length > FLOW_WIDTHS.length ? FLOW_WIDTHS : scene.widths;
    for (const width of widths) {
      const { browserContext, page } = await open(browser, scene, width);
      await walk(page, scene, width, label => measure(page, label, ctx));
      await browserContext.close();
    }
  });

  if (!scene.forced) continue;
  test(`forced ${scene.name}`, async ({ browser }) => {
    test.skip(!RUN, 'Run through scripts/css-important.mjs');
    const ctx = context(RUN, `forced-${scene.name}`);
    for (const width of FORCED_WIDTHS.filter(w => scene.widths.includes(w))) {
      const { browserContext, page } = await open(browser, scene, width);
      const cdp = await browserContext.newCDPSession(page);
      await walk(page, scene, width, async label => {
        for (const kind of ['hover', 'focus', 'active']) await measureForced(page, cdp, label, ctx, kind);
      });
      await browserContext.close();
    }
  });
}
