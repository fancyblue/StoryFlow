// Report — and optionally remove — CSS declarations that cannot affect anything.
//
// The stylesheets settle conflicts by load order and `!important` rather than by
// deciding which layer owns a property. When the same selector sets the same property
// in several places, only one declaration can win; the rest are dead weight that still
// has to be read and reasoned about, and much of the `!important` here exists to win
// fights against declarations that were already losing.
//
// A declaration is reported dead only when that is provable:
//   * its selector text matches another rule's exactly, so specificity is identical
//     and load order plus importance fully decide the winner;
//   * both rules sit under the same conditions: none, or the same chain of `@media` and
//     `@supports` preludes. A conditional rule and an unconditional one do not compete —
//     removing the unconditional one would change what happens outside the condition —
//     but two rules under one condition compete exactly as two unconditional ones do.
//     Anything under another at-rule (`@keyframes` replaces whole blocks rather than
//     declarations) is left alone;
//   * neither stylesheet's position is indeterminate. The cascade order is not the
//     document order — `ensureThemeOrder()` re-appends seven stylesheets to <head> at
//     startup — but that startup order is fixed, so it is captured in
//     scripts/cascade-order.json and used here. What is genuinely undecidable is the
//     tail: `ensureStyleLast()` in two modules re-appends its own stylesheet whenever
//     its view renders, so those files and anything after them swap places during
//     ordinary use. Measured: confirming a split moves chapter-management.css from
//     last to third-last. Cross-file pairs involving that tail are left alone.
//
// A rule with no declarations at all is reported as well; it is the limit case.
//
// Everything else is left alone. This finds the subset that can be removed without
// changing a single resolved value; it does not attempt the larger question of which
// layer should own a property.
//
//   node scripts/dead-declarations.mjs           # summary
//   node scripts/dead-declarations.mjs --list    # every dead declaration
//   node scripts/dead-declarations.mjs --json    # machine-readable
//   node scripts/dead-declarations.mjs --apply   # remove them
//   node scripts/dead-declarations.mjs --check   # fail when there is one (npm run test:css)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tidyJunction } from './css-edit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The order the browser actually resolves in, captured from a loaded page and
// asserted by tests/browser/cascade-contract.spec.js.
function stylesheetsInLoadOrder() {
  const data = JSON.parse(readFileSync(join(root, 'scripts/cascade-order.json'), 'utf8'));
  return data.order;
}

// `ensureStyleLast()` re-appends its own stylesheet every time its view renders, so
// each of those files — and everything positioned after them — can change places
// while the app is used. Their relative order is not a fact this script can rely on.
function indeterminateStylesheets(order) {
  const idToHref = new Map();
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<link[^>]*\bid="([^"]+)"[^>]*href="\.\/([^"?#]+)/g)) {
    idToHref.set(match[1], match[2]);
  }
  const movers = [];
  for (const file of ['src/source/project-source-sync.js', 'src/source/source-article-ux.js']) {
    let text = '';
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch (_) {
      continue;
    }
    if (!/function ensureStyleLast/.test(text)) continue;
    for (const match of text.matchAll(/getElementById\('([^']+)'\)/g)) {
      const href = idToHref.get(match[1]);
      if (href) movers.push(href);
    }
  }
  const earliest = movers
    .map(href => order.indexOf(href))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];
  return new Set(earliest === undefined ? [] : order.slice(earliest));
}

// Parse against the original text so every declaration keeps offsets that can be
// spliced back out. Comments, strings and parentheses are skipped rather than
// stripped, because stripping them would invalidate those offsets.
function parse(text) {
  const rules = [];
  let index = 0;
  const atRules = [];
  let selectorStart = 0;

  const skipTrivia = () => {
    if (text.startsWith('/*', index)) {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
      return true;
    }
    const char = text[index];
    if (char === '"' || char === "'") {
      index += 1;
      while (index < text.length && text[index] !== char) {
        index += text[index] === '\\' ? 2 : 1;
      }
      index += 1;
      return true;
    }
    return false;
  };

  while (index < text.length) {
    if (skipTrivia()) continue;
    const char = text[index];

    if (char === '}') {
      atRules.pop();
      index += 1;
      selectorStart = index;
      continue;
    }

    if (char !== '{') {
      index += 1;
      continue;
    }

    const selector = text.slice(selectorStart, index).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    index += 1;

    if (selector.startsWith('@')) {
      atRules.push(selector);
      selectorStart = index;
      continue;
    }

    // Collect declarations with their offsets in the original text.
    const declarations = [];
    let declStart = index;
    let parens = 0;
    while (index < text.length) {
      if (skipTrivia()) continue;
      const inner = text[index];
      if (inner === '(') parens += 1;
      else if (inner === ')') parens = Math.max(0, parens - 1);
      else if ((inner === ';' && parens === 0) || inner === '}') {
        const raw = text.slice(declStart, index);
        const trimmed = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (trimmed.includes(':')) {
          declarations.push({
            start: declStart,
            end: inner === ';' ? index + 1 : index,
            text: trimmed,
            property: trimmed.slice(0, trimmed.indexOf(':')).trim()
          });
        }
        if (inner === '}') break;
        index += 1;
        declStart = index;
        continue;
      }
      index += 1;
    }

    // Where the rule's own text starts, past any whitespace and comments before it.
    let start = selectorStart;
    for (;;) {
      while (start < text.length && /\s/.test(text[start])) start += 1;
      if (!text.startsWith('/*', start)) break;
      const end = text.indexOf('*/', start + 2);
      start = end === -1 ? text.length : end + 2;
    }
    rules.push({
      selector,
      declarations,
      start,
      close: index,
      // Whitespace inside a prelude carries no meaning: `@media(max-width:820px)` and
      // `@media (max-width: 820px)` are one condition.
      context: atRules.map(prelude => prelude.replace(/\s+/g, '').toLowerCase()).join(' | '),
      comparable: atRules.every(prelude => /^@(media|supports)\b/i.test(prelude))
    });
    index += 1;
    selectorStart = index;
  }

  return rules;
}

const order = stylesheetsInLoadOrder();
const sources = new Map();
const declarations = [];
const emptyRules = [];

order.forEach((file, fileIndex) => {
  let text = '';
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch (_) {
    return;
  }
  sources.set(file, text);
  parse(text).forEach((rule, ruleIndex) => {
    // An empty rule is the limit case: nothing in it can win anything.
    if (rule.comparable && rule.selector && !rule.declarations.length) {
      emptyRules.push({ file, selector: rule.selector, context: rule.context });
    }
    if (!rule.comparable || !rule.selector) return;
    rule.declarations.forEach(decl => {
      if (!decl.property || decl.property.startsWith('--')) return;
      declarations.push({
        file,
        fileIndex,
        ruleIndex,
        selector: rule.selector,
        context: rule.context,
        property: decl.property,
        text: decl.text,
        start: decl.start,
        end: decl.end,
        important: /!important\s*$/.test(decl.text)
      });
    });
  });
});

const groups = new Map();
for (const decl of declarations) {
  const key = `${decl.context}||${decl.selector}||${decl.property}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(decl);
}

const indeterminate = indeterminateStylesheets(order);

const dead = [];
for (const list of groups.values()) {
  if (list.length < 2) continue;
  // A file whose position moves while the app is used cannot be ordered against
  // another file. Same-file pairs stay decidable either way.
  const files = new Set(list.map(decl => decl.file));
  if (files.size > 1 && [...files].some(file => indeterminate.has(file))) continue;
  const ordered = [...list].sort((a, b) =>
    a.fileIndex - b.fileIndex || a.ruleIndex - b.ruleIndex || a.start - b.start);
  const importantOnes = ordered.filter(decl => decl.important);
  const winner = importantOnes.length
    ? importantOnes[importantOnes.length - 1]
    : ordered[ordered.length - 1];
  for (const decl of ordered) {
    if (decl !== winner) dead.push({ ...decl, winnerFile: winner.file, winnerText: winner.text });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(dead.map(({ start, end, ...rest }) => rest), null, 2));
  process.exit(0);
}

if (process.argv.includes('--apply')) {
  const byFile = new Map();
  for (const decl of dead) {
    if (!byFile.has(decl.file)) byFile.set(decl.file, []);
    byFile.get(decl.file).push(decl);
  }
  for (const rule of emptyRules) if (!byFile.has(rule.file)) byFile.set(rule.file, []);
  let removed = 0;
  let rulesRemoved = 0;
  for (const [file, list] of byFile) {
    let text = sources.get(file);
    // Splice from the end so earlier offsets stay valid.
    for (const decl of [...list].sort((a, b) => b.start - a.start)) {
      let start = decl.start;
      let end = decl.end;
      // Take the whitespace the declaration owned with it, so the file does not fill
      // with blank lines where declarations used to be.
      while (start > 0 && /[ \t]/.test(text[start - 1])) start -= 1;
      if (text[start - 1] === '\n' && /^[ \t]*$/.test(text.slice(start, decl.start))) start -= 1;
      while (end < text.length && /[ \t]/.test(text[end])) end += 1;
      text = tidyJunction(text.slice(0, start) + text.slice(end), start);
      removed += 1;
    }
    // A rule whose every declaration was dead is now an empty block, and it goes with the
    // empty rules that were already there. The comment above one is left for a person: it
    // may introduce the rules after it as well.
    const empties = parse(text).filter(rule => rule.comparable && rule.selector && !rule.declarations.length);
    for (const rule of empties.reverse()) {
      let start = rule.start;
      let end = rule.close + 1;
      while (start > 0 && /[ \t]/.test(text[start - 1])) start -= 1;
      if (text[start - 1] === '\n') start -= 1;
      while (end < text.length && /[ \t]/.test(text[end])) end += 1;
      text = tidyJunction(text.slice(0, start) + text.slice(end), start);
      rulesRemoved += 1;
    }
    // So does an @media or @supports block left with nothing inside.
    for (const match of [...text.matchAll(/@(media|supports)[^{]*\{\s*\}/g)].reverse()) {
      let start = match.index;
      while (start > 0 && /[ \t]/.test(text[start - 1])) start -= 1;
      if (text[start - 1] === '\n') start -= 1;
      text = tidyJunction(text.slice(0, start) + text.slice(match.index + match[0].length), start);
      rulesRemoved += 1;
    }
    writeFileSync(join(root, file), text);
  }
  console.log(`Removed ${removed} dead declaration(s) and ${rulesRemoved} empty rule(s), across ${byFile.size} stylesheet(s).`);
  process.exit(0);
}

const byFile = new Map();
for (const decl of dead) byFile.set(decl.file, (byFile.get(decl.file) || 0) + 1);
const deadImportant = dead.filter(decl => decl.important).length;

if (process.argv.includes('--check')) {
  if (emptyRules.length) {
    console.error(`Empty rules: ${emptyRules.length} rule(s) with no declarations.`);
    for (const rule of emptyRules) console.error(`  ${rule.file} :: ${rule.selector}${rule.context ? ` inside ${rule.context}` : ''}`);
  }
  if (dead.length) {
    console.error(`Dead declarations: ${dead.length} declaration(s) lose to the same selector setting the same property later.`);
    for (const decl of dead) {
      const where = decl.context ? ` inside ${decl.context}` : '';
      console.error(`  ${decl.file} :: ${decl.selector}${where}\n      dead: ${decl.text}\n      wins: ${decl.winnerText}  (${decl.winnerFile})`);
    }
    console.error('Change the rule that wins instead of adding one that loses, or run `node scripts/dead-declarations.mjs --apply`.');
  }
  if (dead.length || emptyRules.length) process.exit(1);
  console.log(`Dead declarations: none among ${declarations.length} declarations under comparable conditions.`);
  process.exit(0);
}

console.log(`Declarations parsed (unconditional or under @media/@supports): ${declarations.length}`);
console.log(`Provably dead: ${dead.length}, of which ${deadImportant} carry !important`);
console.log(`Empty rules: ${emptyRules.length}`);
console.log('\nBy file:');
for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${file}`);
}

if (process.argv.includes('--list')) {
  console.log('\nEvery dead declaration (overridden later at equal specificity):');
  for (const decl of dead) {
    console.log(`  ${decl.file} :: ${decl.selector}${decl.context ? `  [${decl.context}]` : ''}`);
    console.log(`      dead: ${decl.text}`);
    console.log(`      wins: ${decl.winnerText}  (${decl.winnerFile})`);
  }
}
