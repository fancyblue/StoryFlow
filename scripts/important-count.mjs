#!/usr/bin/env node
// Keeps the number of `!important` declarations from growing.
//
// Most of the `!important` in these stylesheets exists to win a fight with another rule.
// Adding one more to win the next fight is how there came to be almost two thousand; the
// rule in AGENTS.md is to change the rule that wins instead. This holds that line: the
// count of `!important` declarations in the loaded stylesheets may only go down.
//
//   node scripts/important-count.mjs            # report the count
//   node scripts/important-count.mjs --check    # fail when it differs from RECORDED (npm run test:css)
//
// When it went down, lower RECORDED to the new count in the same commit, so the next one
// cannot quietly take the room back. `npm run css:important -- <stylesheet>` shows which
// `!important` in a stylesheet can go without changing anything (tests/README.md).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RECORDED = 1756;

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = rootIndex >= 0 ? resolve(args[rootIndex + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recorded = args.includes('--recorded') ? Number(args[args.indexOf('--recorded') + 1]) : RECORDED;

function loadedStylesheets() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  return [...html.matchAll(/href="\.\/([^"?#]+\.css)/g)].map(m => m[1]);
}

// A declaration is counted once however its `!important` is spaced; comments are not code.
function count(text) {
  return (text.replace(/\/\*[\s\S]*?\*\//g, '').match(/!\s*important/gi) || []).length;
}

const perFile = loadedStylesheets().map(file => [file, count(readFileSync(join(root, file), 'utf8'))]);
const total = perFile.reduce((sum, [, n]) => sum + n, 0);

if (!args.includes('--check')) {
  perFile.filter(([, n]) => n).sort((a, b) => b[1] - a[1]).forEach(([file, n]) => console.log(`${String(n).padStart(5)}  ${file}`));
  console.log(`!important: ${total} declarations in ${perFile.length} loaded stylesheets (recorded ${recorded}).`);
  process.exit(0);
}

if (total > recorded) {
  console.error(`!important: ${total} declarations, up from the recorded ${recorded}.`);
  console.error('Change the rule that wins instead of adding one that beats it (AGENTS.md, "Testing policy").');
  process.exit(1);
}
if (total < recorded) {
  console.error(`!important: ${total} declarations, down from the recorded ${recorded}.`);
  console.error(`Lower RECORDED in scripts/important-count.mjs to ${total} in the same commit.`);
  process.exit(1);
}
console.log(`!important: ${total} declarations, as recorded.`);
