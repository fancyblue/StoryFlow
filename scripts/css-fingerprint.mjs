#!/usr/bin/env node
// Shows that a stylesheet change leaves what the app looks like unchanged.
//
//   npm run css:fingerprint -- capture <file>   record the current tree
//   npm run css:fingerprint -- compare <file>   record again and compare with <file>
//
// Capture before the change, compare after it: compare exits 1 and names the elements
// whose computed style or box differs. Use it for moving, splitting or reordering
// stylesheets, where the intended difference is none; it says nothing about a change that
// is meant to look different. It records every element under <body> in the works,
// workspace (longform and visual), publishing (list, lightbox with a platform's editors
// open, visual lightbox), settings and type-chooser states, at 1440, 800 and 390 px
// (tests/css-fingerprint/fingerprint.spec.js). Set STORYFLOW_CHROMIUM to run it with a
// browser other than the pinned Playwright's.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [mode, target] = process.argv.slice(2);
if (!['capture', 'compare'].includes(mode) || !target) {
  console.error('Usage: npm run css:fingerprint -- capture <file> | compare <file>');
  process.exit(2);
}

function record(out) {
  const run = spawnSync('npx', ['playwright', 'test', '-c', 'tests/css-fingerprint/playwright.config.mjs'], {
    stdio: 'inherit', env: { ...process.env, CSS_FINGERPRINT_OUT: out }
  });
  if (run.status !== 0) process.exit(run.status || 1);
}

if (mode === 'capture') {
  record(resolve(target));
  console.log(`CSS fingerprint written to ${target}`);
  process.exit(0);
}

const scratch = mkdtempSync(join(tmpdir(), 'storyflow-css-'));
const current = join(scratch, 'current.json');
record(current);
const before = JSON.parse(readFileSync(resolve(target), 'utf8'));
const after = JSON.parse(readFileSync(current, 'utf8'));
rmSync(scratch, { recursive: true, force: true });

let compared = 0;
const differing = [];
for (const state of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const x = before[state] || {};
  const y = after[state] || {};
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
    compared += 1;
    if (x[key] !== y[key]) differing.push(`${state}  ${key}${!(key in x) ? '  (new)' : !(key in y) ? '  (gone)' : ''}`);
  }
}
differing.slice(0, 40).forEach(line => console.log(line));
if (differing.length > 40) console.log(`… and ${differing.length - 40} more`);
console.log(`CSS fingerprint: ${Object.keys(before).length} states, ${compared} elements, ${differing.length} differing.`);
process.exit(differing.length ? 1 : 0);
