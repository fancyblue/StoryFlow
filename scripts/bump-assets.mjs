// Cache-query maintenance for the build-free asset manifest.
//
// GitHub Pages serves this repository directly, so a changed stylesheet or module
// only reaches a returning browser when its `?v=` query changes too. That step is
// manual, easy to forget, and invisible until the live site keeps serving an old
// file. This script does it from what git says actually changed.
//
//   node scripts/bump-assets.mjs                 # bump every asset changed vs origin/main
//   node scripts/bump-assets.mjs --base main     # compare against another ref
//   node scripts/bump-assets.mjs path/a.css …    # bump the named assets instead
//   node scripts/bump-assets.mjs --check         # report stale assets, change nothing
//
// --check exits non-zero when a changed asset still carries its old query, which is
// the shape CI can use.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOSTS = ['index.html', 'app-loader.js'];

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const baseIndex = argv.indexOf('--base');
const base = baseIndex >= 0 ? argv[baseIndex + 1] : 'origin/main';
const explicit = argv.filter((value, index) =>
  !value.startsWith('--') && index !== baseIndex + 1);

function hostText(name) {
  return readFileSync(join(root, name), 'utf8');
}

// Every local asset the two hosts reference, with the query each one carries.
function referencedAssets() {
  const found = new Map();
  for (const host of HOSTS) {
    const text = hostText(host);
    const patterns = host.endsWith('.html')
      ? [/(?:src|href)="\.\/([^"?#]+)(\?v=[^"]*)?"/g]
      : [/\bsrc:\s*['"]\.\/([^'"?#]+)(\?v=[^'"]*)?['"]/g];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (!found.has(match[1])) found.set(match[1], match[2] || '');
      }
    }
  }
  return found;
}

function changedSinceBase() {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd: root, encoding: 'utf8'
    });
    const staged = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd: root, encoding: 'utf8'
    });
    return new Set([...out.split('\n'), ...staged.split('\n')].filter(Boolean));
  } catch (error) {
    throw new Error(`Cannot compare against ${base}: ${error.message}`);
  }
}

function nextVersion() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  // Keep a suffix so several bumps on one day stay distinguishable.
  const existing = HOSTS.map(hostText).join('\n');
  let serial = 1;
  while (existing.includes(`?v=${stamp}-a${serial}`)) serial += 1;
  return `${stamp}-a${serial}`;
}

// The query a host carried at the base ref, so --check can tell "changed and already
// bumped" from "changed and still stale".
function baseAssets() {
  const found = new Map();
  for (const host of HOSTS) {
    let text = '';
    try {
      text = execFileSync('git', ['show', `${base}:${host}`], { cwd: root, encoding: 'utf8' });
    } catch (_) {
      continue;
    }
    const pattern = host.endsWith('.html')
      ? /(?:src|href)="\.\/([^"?#]+)(\?v=[^"]*)?"/g
      : /\bsrc:\s*['"]\.\/([^'"?#]+)(\?v=[^'"]*)?['"]/g;
    for (const match of text.matchAll(pattern)) {
      if (!found.has(match[1])) found.set(match[1], match[2] || '');
    }
  }
  return found;
}

const assets = referencedAssets();
const changed = explicit.length ? null : changedSinceBase();
const targets = explicit.length
  ? explicit.filter(path => assets.has(path))
  : [...assets.keys()].filter(path => changed.has(path));

const unknown = explicit.filter(path => !assets.has(path));
if (unknown.length) {
  throw new Error(`Not referenced by index.html or app-loader.js:\n${unknown.join('\n')}`);
}

if (check) {
  const previous = baseAssets();
  // Stale means the file changed while its cache query stayed exactly as the base
  // ref left it. An asset new since the base has no previous query to compare, so it
  // only needs to carry one at all.
  const stale = targets.filter(path => {
    const now = assets.get(path) || '';
    if (!previous.has(path)) return now === '';
    return now === previous.get(path);
  });
  if (!stale.length) {
    console.log(`Cache queries are current for ${targets.length} changed asset(s).`);
    process.exit(0);
  }
  console.error(`These assets changed but still carry their previous cache query:\n${stale
    .map(path => `  ${path}${assets.get(path)}`)
    .join('\n')}\nRun: node scripts/bump-assets.mjs`);
  process.exit(1);
}

if (!targets.length) {
  console.log('No referenced asset changed; nothing to bump.');
  process.exit(0);
}

const version = nextVersion();
for (const host of HOSTS) {
  const before = hostText(host);
  let after = before;
  for (const path of targets) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    after = after.replace(
      new RegExp(`(\\./${escaped})(\\?v=[^"'\\s]*)?`, 'g'),
      (_, asset) => `${asset}?v=${version}`
    );
  }
  if (after !== before) writeFileSync(join(root, host), after);
}

console.log(`Bumped ${targets.length} asset(s) to ?v=${version}:\n${targets.map(path => `  ${path}`).join('\n')}`);
