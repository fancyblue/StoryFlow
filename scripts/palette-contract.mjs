// Palette contract for the loaded stylesheets.
//
// The visual-regression baselines cannot police colour. Playwright compares screenshots
// with pixelmatch, whose `threshold` defaults to 0.2 of the maximum perceptual distance,
// and the paper-and-ink palette was built to preserve the lightness of what it replaced.
// The result is that repainting every surface in the app changed 97% of the pixels in a
// baseline and the suite still passed. Useful as evidence that the swap was purely
// chromatic — and useless as a guard, because the next accidental colour would pass too.
//
// So colour is checked here instead, statically, where it can be exact: every colour
// literal in every stylesheet index.html loads must be one of the palette values below.
// That is also what keeps the palette a palette. Before this file existed the same
// stylesheets held 408 distinct colours, most of them a few percent of lightness apart
// and indistinguishable on screen, because nothing stopped a new screen from inventing
// its own not-quite-blue.
//
//   node scripts/palette-contract.mjs            # report and exit non-zero on a stray colour
//
// Adding a colour is a deliberate act: put it in PALETTE with the role it serves, and the
// diff will show it.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Defined in styles/layers/theme.css. Kept here as plain values because this check runs
// without a browser and must not depend on the cascade it is checking.
const PALETTE = {
  '#ece9e0': 'paper-0 — app ground',
  '#fbfaf6': 'paper-1 — raised surface',
  '#f4f1e9': 'paper-2 — recessed surface',
  '#2b2822': 'sidebar — the one dark surface',
  '#221f1a': 'ink-1 — body text',
  '#3f3930': 'ink-1-soft — strong labels',
  '#6a6357': 'ink-2 — secondary text',
  '#6f6759': 'ink-3 — units, timestamps, placeholder',
  '#968f80': 'ink-faint — disabled controls and hairlines only',
  '#ded9cc': 'rule-1 — hairline',
  '#c8c1b0': 'rule-2 — emphasis line',
  '#2b2733': 'dai-900',
  '#3a3544': 'dai-800 — accent hover',
  '#4b4557': 'dai-700 — the accent',
  '#5e5769': 'dai-600',
  '#e8e5eb': 'dai-soft — active fill',
  '#a8443a': 'vermilion — destructive',
  '#e6cdc7': 'vermilion line',
  '#eddad5': 'vermilion fill',
  '#f6e9e6': 'vermilion soft',
  '#d08b80': 'vermilion on the dark rail',
  '#e0a49a': 'vermilion on the dark rail, hover',
  '#d4796d': 'connection dot, disconnected',
  '#8a6526': 'ochre — warning',
  '#e3d3b4': 'ochre line',
  '#ecdfc4': 'ochre fill',
  '#f5eddc': 'ochre soft',
  '#c9a45f': 'connection dot, restoring',
  '#59703f': 'moss — published',
  '#d7dec6': 'moss line',
  '#dde3cc': 'moss fill',
  '#eef0e4': 'moss soft',
  '#8fa876': 'connection dot, connected'
};

// Colours that are not palette values by nature.
const ALWAYS_ALLOWED = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'none']);

function loadedStylesheets() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  return [...html.matchAll(/href="\.\/([^"?#]+\.css)/g)].map(m => m[1]);
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)|(?<![-\w])(?:white|black|red|green|blue|gray|grey|silver|maroon|navy|olive|teal|aqua|fuchsia|lime|purple|yellow|orange|pink|brown|beige|ivory|snow|azure|whitesmoke|gainsboro|lightgray|lightgrey|darkgray|darkgrey)(?![-\w])/g;

function normalise(raw) {
  const text = raw.toLowerCase();
  if (text.startsWith('#')) {
    let hex = text.slice(1);
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    if (hex.length === 4) hex = [...hex.slice(0, 3)].map(c => c + c).join('');
    if (hex.length === 8) hex = hex.slice(0, 6);
    return { key: `#${hex}`, alpha: false };
  }
  if (text.startsWith('rgb')) {
    const [r, g, b] = text.match(/[\d.]+/g).map(Number);
    const hex = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    return { key: hex, alpha: text.startsWith('rgba') };
  }
  return { key: text, alpha: false };
}

const problems = [];
const seen = new Set();
for (const file of loadedStylesheets()) {
  let text;
  try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
  // Comments carry examples and history; they render nothing.
  const lines = text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' ')).split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(COLOR)) {
      const { key, alpha } = normalise(match[0]);
      if (ALWAYS_ALLOWED.has(key)) continue;
      // A translucent white or black is a scrim over another surface, not a palette colour:
      // it takes its hue from whatever it covers.
      if (alpha && (key === '#ffffff' || key === '#000000')) continue;
      if (PALETTE[key]) { seen.add(key); continue; }
      problems.push({ file, line: index + 1, found: match[0], key });
    }
  });
}

const unused = Object.keys(PALETTE).filter(key => !seen.has(key));

// A box-shadow with an opaque colour is not elevation, it is a ring, a halo or an edge
// marker — a border drawn by another name. Elevation in this palette is always translucent
// ink. A solid --ink-1 ring is therefore never deliberate, and it is exactly what comes out
// of treating one as a shadow: eight of them shipped that way before this rule existed,
// including a 4px near-black halo around a 9px status dot.
const RING_INK = /box-shadow\s*:\s*(?![^;}]*\brgba?\()[^;}]*#221f1a/i;
for (const file of loadedStylesheets()) {
  let text;
  try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
  text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).split('\n').forEach((line, index) => {
    if (RING_INK.test(line)) {
      problems.push({ file, line: index + 1, found: line.trim().slice(0, 70), key: 'opaque ink ring' });
    }
  });
}

if (problems.length) {
  console.error(`Palette contract: ${problems.length} colour(s) outside the palette.\n`);
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.found}`);
  console.error(`\nEither map it onto an existing palette value, or add it to PALETTE in`);
  console.error(`scripts/palette-contract.mjs with the role it serves.`);
  process.exit(1);
}

console.log(`Palette contract: every colour in ${loadedStylesheets().length} loaded stylesheets is one of ${Object.keys(PALETTE).length} palette values.`);
if (unused.length) {
  // Not a failure — a value can be declared before the screen that needs it lands. It is
  // worth saying out loud, because an unused entry is how a palette starts growing again.
  console.log(`Declared but unused: ${unused.join(', ')}`);
}
