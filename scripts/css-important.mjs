#!/usr/bin/env node
// Shows which `!important` in a stylesheet can go without changing anything, and why the
// others stay.
//
//   npm run css:important -- styles/domains/publishing.css            # report
//   npm run css:important -- styles/domains/publishing.css --apply    # and remove the safe ones
//   npm run css:important -- <stylesheet> --quick                     # 6 widths instead of 22
//
// It loads the app in Playwright with every stylesheet served as written, takes `!important`
// off the stylesheet's declarations in CSSOM and compares every element's computed style,
// across the states in tests/important-audit/lib/scenes.mjs (works, workspace, publishing
// and its tools, settings, reading, visual works, the source comparison, a phone in
// read-only mode, …) at every breakpoint band, and with :hover, :focus and :active forced.
// A declaration goes only when that changes nothing, it applied somewhere, and every rule
// that could win once it loses `!important` was measured against it (lib/analyze.mjs).
// The survivors are then removed together and measured again until nothing changes.
//
// It reports three groups: removable; kept because removing it changes something (with the
// state, the element and the property); kept because a competing rule was never measured
// against it (with that rule) or because it never applied in a measured state.
// Set STORYFLOW_CHROMIUM to use another Chromium, as for css:fingerprint.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMeta } from '../tests/important-audit/lib/meta.mjs';
import { analyze } from '../tests/important-audit/lib/analyze.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const quick = args.includes('--quick');
const targets = args.filter(a => !a.startsWith('--')).map(a => a.replace(/^\.\//, ''));
const { files, meta } = buildMeta(root);
if (!targets.length || targets.some(t => !files.includes(t))) {
  console.error('Usage: npm run css:important -- <loaded stylesheet>... [--apply] [--quick]');
  for (const t of targets.filter(t => !files.includes(t))) console.error(`  not a loaded stylesheet: ${t}`);
  process.exit(2);
}

const UNMEASURABLE = /::(?!before\b|after\b)[\w-]+|:-webkit-[\w-]+|:-moz-[\w-]+/;
const decls = meta.flatMap(r => r.decls.map(d => ({ ...d, rule: r })));
const declByKey = new Map(decls.map(d => [d.k, d]));
const mine = decls.filter(d => d.important && targets.includes(d.rule.file));
const unmeasurable = mine.filter(d => UNMEASURABLE.test(d.rule.selector)).map(d => d.k);
const candidates = mine.map(d => d.k).filter(k => !unmeasurable.includes(k));
const where = k => { const d = declByKey.get(k); return `${d.rule.file}:${d.line}  ${d.rule.selector.length > 70 ? d.rule.selector.slice(0, 67) + '…' : d.rule.selector} { ${d.prop} }`; };

const dir = mkdtempSync(join(tmpdir(), 'storyflow-important-'));
function measureRound(list, verify) {
  for (const f of readdirSync(dir).filter(f => f.startsWith('kept-'))) rmSync(join(dir, f));
  writeFileSync(join(dir, 'candidates.json'), JSON.stringify(list));
  if (verify) writeFileSync(join(dir, 'verify'), '');
  const run = spawnSync('npx', ['playwright', 'test', '-c', 'tests/important-audit/playwright.config.mjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, IMPORTANT_AUDIT_DIR: dir, ...(quick ? { IMPORTANT_AUDIT_QUICK: '1' } : {}) }
  });
  if (run.status !== 0) { console.error(`Measurement failed; partial results are in ${dir}`); process.exit(run.status || 1); }
  const kept = {};
  for (const f of readdirSync(dir).filter(f => f.startsWith('kept-'))) Object.assign(kept, JSON.parse(readFileSync(join(dir, f), 'utf8')));
  return kept;
}

console.log(`${mine.length} !important in ${targets.join(', ')}; measuring ${candidates.length}.`);
const changes = candidates.length ? measureRound(candidates, false) : {};
const outs = readdirSync(join(dir, 'out')).map(f => JSON.parse(readFileSync(join(dir, 'out', f), 'utf8')));
const longhands = JSON.parse(readFileSync(join(dir, 'longhands.json'), 'utf8'));
const { removable, blocked, noEvidence } = analyze({ root, meta, longhands, outs, candidates: candidates.filter(k => !(k in changes)) });

// Removed together, two survivors can still change something between them.
let final = removable;
for (let round = 1; final.length && round <= 4; round++) {
  console.log(`Verifying ${final.length} together (round ${round}).`);
  const interacting = measureRound(final, true);
  if (!Object.keys(interacting).length) break;
  Object.assign(changes, interacting);
  final = final.filter(k => !(k in interacting));
}

// The rules that compete for the property on the element where a removal showed.
function rivals(k, info) {
  const out = outs.find(o => o.label === info.state || o.label.replace(/[^\w.-]+/g, '_') === info.state.replace(/[^\w.-]+/g, '_'));
  if (!out) return [];
  return decls.filter(d => d.k !== k && (longhands[d.k] || []).includes(info.property) && out.res[d.rule.id]?.m.some(x => String(x).split('::')[0] === String(info.index)))
    .slice(-2).map(d => `${d.rule.file}:${d.line} ${d.rule.selector.slice(0, 50)}`);
}

console.log(`\nRemovable — nothing changes without them (${final.length}):`);
final.forEach(k => console.log(`  ${where(k)}`));
console.log(`\nKept — removing changes something (${Object.keys(changes).length}):`);
for (const [k, info] of Object.entries(changes)) {
  console.log(`  ${where(k)}\n      ${info.property} on ${info.element} in ${info.state}`);
  rivals(k, info).forEach(r => console.log(`      competes with ${r}`));
}
console.log(`\nKept — a rule that could then win was never measured against it (${Object.keys(blocked).length}):`);
for (const [k, c] of Object.entries(blocked)) console.log(`  ${where(k)}\n      could lose to ${where(c)}`);
console.log(`\nKept — applied in no measured state (${noEvidence.length + unmeasurable.length}):`);
[...noEvidence, ...unmeasurable].forEach(k => console.log(`  ${where(k)}`));
writeFileSync(join(dir, 'report.json'), JSON.stringify({ removable: final, changes, blocked, noEvidence, unmeasurable }, null, 1));
console.log(`\nDetails: ${join(dir, 'report.json')}`);

if (apply && final.length) {
  const perFile = new Map();
  for (const k of final) { const d = declByKey.get(k); if (!perFile.has(d.rule.file)) perFile.set(d.rule.file, []); perFile.get(d.rule.file).push(d); }
  for (const [file, list] of perFile) {
    let text = readFileSync(join(root, file), 'utf8');
    for (const d of list.sort((a, b) => b.srcS - a.srcS)) {
      if (!/^!\s*important/i.test(text.slice(d.srcS, d.srcE))) throw new Error(`${file}: the stylesheet changed while measuring`);
      let s = d.srcS; while (s > 0 && /[ \t]/.test(text[s - 1])) s--;
      text = text.slice(0, s) + text.slice(d.srcE).replace(/^[ \t]+(?=[;}\n])/, '');
    }
    writeFileSync(join(root, file), text);
  }
  console.log(`\nRemoved ${final.length} !important. Next: lower RECORDED in scripts/important-count.mjs, npm run bump:assets, npm run test:css and npm run css:fingerprint.`);
}
