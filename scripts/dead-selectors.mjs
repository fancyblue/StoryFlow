// Report — and optionally remove — CSS selectors that can never match anything.
//
// A selector that names a class or id no part of the app ever produces is dead: it cannot
// match, so its rule costs a reader time and changes nothing. They accumulate when markup is
// renamed or removed and its styles are left behind, and in this cascade they are worse than
// clutter — a dead `.connection-chip` rule looks like one more layer a change has to beat.
//
// A selector is reported dead only when that is provable from the source text:
//   * it names a class or id, outside any functional pseudo-class, that appears nowhere in
//     index.html, app-loader.js or the loaded modules under src/ (src/legacy/ is not loaded);
//   * the name is not built at run time either. A class assembled from a prefix —
//     `'is-' + state`, `status-${key}` — keeps every class sharing that prefix alive.
// Names inside `:not()`, `:is()`, `:where()` and `:has()` are ignored rather than judged:
// `:not(.gone)` matches everything and `:is(.gone, .here)` still matches `.here`, so
// reading them would take care this script does not need to spend. A dead selector in a
// list is removed on its own; a rule whose every selector is dead goes whole.
//
//   node scripts/dead-selectors.mjs           # summary
//   node scripts/dead-selectors.mjs --list    # every dead selector
//   node scripts/dead-selectors.mjs --apply   # remove them
//   node scripts/dead-selectors.mjs --check   # fail when there is one (npm run test:css)

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tidyJunction } from './css-edit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const stylesheets = [...index.matchAll(/href="\.\/([^"?#]+\.css)/g)].map(match => match[1]);

function collectJavaScript(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'legacy' ? [] : collectJavaScript(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

const sources = [
  index,
  readFileSync(join(root, 'app-loader.js'), 'utf8'),
  ...collectJavaScript(join(root, 'src')).map(path => readFileSync(path, 'utf8'))
].join('\n');

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alive = new Map();
function isAlive(name) {
  if (alive.has(name)) return alive.get(name);
  let found = sources.includes(name);
  // A prefix that code completes at run time: 'is-' + state, `status-${key}`.
  const parts = name.split('-');
  for (let cut = parts.length - 1; cut >= 1 && !found; cut -= 1) {
    const prefix = escapeRegExp(`${parts.slice(0, cut).join('-')}-`);
    found = new RegExp(`['"\`]${prefix}['"\`]\\s*\\+|\`[^\`]*${prefix}\\$\\{`).test(sources);
  }
  alive.set(name, found);
  return found;
}

// The class and id names a selector requires, leaving out anything inside a functional
// pseudo-class, attribute selectors and strings.
function requiredNames(selector) {
  let text = '';
  let depth = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) text += char;
  }
  text = text.replace(/\[[^\]]*\]/g, ' ');
  return [...text.matchAll(/[.#](-?[_a-zA-Z][\w-]*)/g)].map(match => match[1]);
}

// Split a selector list on its top-level commas, keeping each part's offset.
function splitSelectors(text, offset) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (index === text.length || (char === ',' && depth === 0)) {
      parts.push({ text: text.slice(start, index), start: offset + start, end: offset + index });
      start = index + 1;
    }
  }
  return parts;
}

// Style rules with the offsets of their prelude and block, skipping comments and strings.
function parse(text) {
  const rules = [];
  const stack = [];
  let index = 0;
  let preludeStart = 0;
  while (index < text.length) {
    if (text.startsWith('/*', index)) {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
      if (text.slice(preludeStart, index).trim().startsWith('/*')) preludeStart = index;
      continue;
    }
    const char = text[index];
    if (char === '"' || char === "'") {
      index += 1;
      while (index < text.length && text[index] !== char) index += text[index] === '\\' ? 2 : 1;
      index += 1;
      continue;
    }
    if (char === ';' && !stack.at(-1)?.style) {
      preludeStart = index + 1;
    } else if (char === '{') {
      const prelude = text.slice(preludeStart, index);
      const at = prelude.trim().startsWith('@');
      const keyframes = stack.some(frame => frame.keyframes);
      const frame = {
        style: !at && !keyframes,
        keyframes: /^@(-\w+-)?keyframes\b/.test(prelude.trim()),
        preludeStart,
        open: index
      };
      stack.push(frame);
      preludeStart = index + 1;
    } else if (char === '}') {
      const frame = stack.pop();
      if (frame?.style) rules.push({ ...frame, close: index });
      preludeStart = index + 1;
    }
    index += 1;
  }
  return rules;
}

const findings = [];
for (const file of stylesheets) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const rule of parse(text)) {
    const prelude = text.slice(rule.preludeStart, rule.open);
    // Leading comments and whitespace belong to the text before the rule, not the selector.
    const leading = prelude.match(/^(\s|\/\*[\s\S]*?\*\/)*/)[0].length;
    const selectors = splitSelectors(prelude.slice(leading), rule.preludeStart + leading);
    const dead = selectors.filter(part => requiredNames(part.text).some(name => !isAlive(name)));
    if (dead.length) findings.push({ file, rule, selectors, dead, text });
  }
}

const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;
const squash = text => text.replace(/\s+/g, ' ').trim();

if (process.argv.includes('--apply')) {
  const byFile = new Map();
  for (const finding of findings) {
    if (!byFile.has(finding.file)) byFile.set(finding.file, []);
    byFile.get(finding.file).push(finding);
  }
  let selectorsRemoved = 0;
  let rulesRemoved = 0;
  for (const [file, list] of byFile) {
    let text = readFileSync(join(root, file), 'utf8');
    const edits = [];
    for (const { rule, selectors, dead } of list) {
      if (dead.length === selectors.length) {
        let start = selectors[0].start;
        let end = rule.close + 1;
        while (start > 0 && /[ \t]/.test(text[start - 1])) start -= 1;
        if (text[start - 1] === '\n') start -= 1;
        edits.push([start, end, '']);
        rulesRemoved += 1;
        selectorsRemoved += dead.length;
        continue;
      }
      // Rejoin the survivors from their original text, so each keeps its own line break and
      // indentation and the list reads as it did minus the dead entries.
      const survivors = selectors.filter(part => !dead.includes(part));
      const lead = selectors[0].text.match(/^\s*/)[0];
      const trail = selectors.at(-1).text.match(/\s*$/)[0];
      const joined = survivors.map((part, position) => position === 0 ? lead + part.text.trimStart() : part.text).join(',');
      edits.push([selectors[0].start, selectors.at(-1).end, joined.trimEnd() + trail]);
      selectorsRemoved += dead.length;
    }
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
      text = text.slice(0, start) + replacement + text.slice(end);
      if (!replacement) text = tidyJunction(text, start);
    }
    writeFileSync(join(root, file), text);
  }
  console.log(`Removed ${selectorsRemoved} dead selector(s), ${rulesRemoved} rule(s) whole, across ${byFile.size} stylesheet(s).`);
  process.exit(0);
}

const selectorCount = findings.reduce((sum, finding) => sum + finding.dead.length, 0);
const wholeRules = findings.filter(finding => finding.dead.length === finding.selectors.length).length;
const deadNames = [...alive].filter(([, value]) => !value).map(([name]) => name).sort();

if (process.argv.includes('--list')) {
  for (const { file, dead, selectors, text } of findings) {
    const whole = dead.length === selectors.length ? ' (whole rule)' : '';
    for (const part of dead) console.log(`  ${file}:${lineOf(text, part.start)}${whole}  ${squash(part.text)}`);
  }
}

if (process.argv.includes('--check')) {
  if (selectorCount) {
    console.error(`Dead selectors: ${selectorCount} selector(s) name a class or id nothing in the app produces.`);
    for (const { file, dead, text } of findings) {
      for (const part of dead) console.error(`  ${file}:${lineOf(text, part.start)}  ${squash(part.text)}`);
    }
    console.error(`Names: ${deadNames.join(' ')}`);
    console.error('Remove them with `node scripts/dead-selectors.mjs --apply`, or add the markup that uses them.');
    process.exit(1);
  }
  console.log(`Dead selectors: none in ${stylesheets.length} loaded stylesheets.`);
  process.exit(0);
}

console.log(`Dead selectors: ${selectorCount} across ${findings.length} rule(s), ${wholeRules} of them whole.`);
console.log(`Names nothing produces (${deadNames.length}): ${deadNames.join(' ')}`);
