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
//   * neither rule sits inside an at-rule, because a conditional rule and an
//     unconditional one do not compete — removing the unconditional one would change
//     what happens outside the condition;
//   * neither stylesheet's position is indeterminate. The cascade order is not the
//     document order — `ensureThemeOrder()` re-appends seven stylesheets to <head> at
//     startup — but that startup order is fixed, so it is captured in
//     scripts/cascade-order.json and used here. What is genuinely undecidable is the
//     tail: `ensureStyleLast()` in two modules re-appends its own stylesheet whenever
//     its view renders, so those files and anything after them swap places during
//     ordinary use. Measured: confirming a split moves chapter-management.css from
//     last to third-last. Cross-file pairs involving that tail are left alone.
//
// Everything else is left alone. This finds the subset that can be removed without
// changing a single resolved value; it does not attempt the larger question of which
// layer should own a property.
//
//   node scripts/dead-declarations.mjs           # summary
//   node scripts/dead-declarations.mjs --list    # every dead declaration
//   node scripts/dead-declarations.mjs --json    # machine-readable
//   node scripts/dead-declarations.mjs --apply   # remove them

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  let atDepth = 0;
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
      if (atDepth > 0) atDepth -= 1;
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
      atDepth += 1;
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

    rules.push({ selector, declarations, conditional: atDepth > 0 });
    index += 1;
    selectorStart = index;
  }

  return rules;
}

const order = stylesheetsInLoadOrder();
const sources = new Map();
const declarations = [];

order.forEach((file, fileIndex) => {
  let text = '';
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch (_) {
    return;
  }
  sources.set(file, text);
  parse(text).forEach((rule, ruleIndex) => {
    if (rule.conditional || !rule.selector) return;
    rule.declarations.forEach(decl => {
      if (!decl.property || decl.property.startsWith('--')) return;
      declarations.push({
        file,
        fileIndex,
        ruleIndex,
        selector: rule.selector,
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
  const key = `${decl.selector}||${decl.property}`;
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

// Locate a rule's selector text so an emptied block can be removed whole.
function findSelector(text, selector) {
  const compact = selector.replace(/\s+/g, ' ');
  let index = text.indexOf(compact);
  if (index !== -1) return index;
  const first = compact.split(' ')[0];
  index = text.indexOf(first);
  return index === -1 ? 0 : index;
}

if (process.argv.includes('--apply')) {
  const byFile = new Map();
  for (const decl of dead) {
    if (!byFile.has(decl.file)) byFile.set(decl.file, []);
    byFile.get(decl.file).push(decl);
  }
  let removed = 0;
  let emptyRules = 0;
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
      text = text.slice(0, start) + text.slice(end);
      removed += 1;
    }
    // A rule whose every declaration was dead is now an empty block. It had an
    // effect before and has none now, so it goes too — but only when this pass is
    // what emptied it, leaving pre-existing empty rules and their comments alone.
    const emptied = parse(text)
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => rule.declarations.length === 0);
    if (emptied.length) {
      const before = parse(sources.get(file));
      const ranges = [];
      for (const { rule, index } of emptied) {
        if (!before[index] || before[index].selector !== rule.selector) continue;
        if (before[index].declarations.length === 0) continue;
        const open = text.indexOf('{', findSelector(text, rule.selector));
        if (open === -1) continue;
        const close = text.indexOf('}', open);
        if (close === -1 || text.slice(open + 1, close).trim()) continue;
        let start = findSelector(text, rule.selector);
        let end = close + 1;
        while (start > 0 && /[ \t]/.test(text[start - 1])) start -= 1;
        if (text[start - 1] === '\n') start -= 1;
        while (end < text.length && /[ \t]/.test(text[end])) end += 1;
        ranges.push([start, end]);
      }
      for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
        text = text.slice(0, start) + text.slice(end);
        emptyRules += 1;
      }
    }
    writeFileSync(join(root, file), text);
  }
  console.log(`Removed ${removed} dead declaration(s) and ${emptyRules} rule(s) they emptied, across ${byFile.size} stylesheet(s).`);
  process.exit(0);
}

const byFile = new Map();
for (const decl of dead) byFile.set(decl.file, (byFile.get(decl.file) || 0) + 1);
const deadImportant = dead.filter(decl => decl.important).length;

console.log(`Declarations parsed (unconditional rules only): ${declarations.length}`);
console.log(`Provably dead: ${dead.length}, of which ${deadImportant} carry !important`);
console.log('\nBy file:');
for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${file}`);
}

if (process.argv.includes('--list')) {
  console.log('\nEvery dead declaration (overridden later at equal specificity):');
  for (const decl of dead) {
    console.log(`  ${decl.file} :: ${decl.selector}`);
    console.log(`      dead: ${decl.text}`);
    console.log(`      wins: ${decl.winnerText}  (${decl.winnerFile})`);
  }
}
