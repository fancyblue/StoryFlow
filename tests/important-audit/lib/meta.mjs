// Every style rule of every loaded stylesheet, with its declarations, keyed so the browser
// side can find the same rule in CSSOM: each rule is served with one extra, otherwise unused
// custom property `--sfr-<file>-<rule>` (see instrument() in engine.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCss } from './parse-css.mjs';

export function loadedStylesheets(root) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  return [...html.matchAll(/href="\.\/([^"?#]+\.css)/g)].map(m => m[1]);
}

const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

export function buildMeta(root) {
  const files = loadedStylesheets(root);
  const meta = [];
  const instrumented = {};
  files.forEach((file, fi) => {
    const text = readFileSync(join(root, file), 'utf8');
    const rules = parseCss(text);
    let out = '';
    let pos = 0;
    rules.forEach((r, ri) => {
      const id = `${fi}-${ri}`;
      const marker = `--sfr-${id}:1;`;
      out += text.slice(pos, r.open + 1) + marker;
      pos = r.open + 1;
      const body = marker + text.slice(r.open + 1, r.close);
      const shift = marker.length - (r.open + 1);
      meta.push({
        id, file, line: lineAt(text, r.open), selector: r.selector, context: r.context, body,
        decls: r.decls.map((d, di) => ({
          k: `${id}-${di}`, prop: d.prop, value: d.value, important: d.important, line: lineAt(text, d.start + Math.max(0, text.slice(d.start, d.end).search(/[^\s;]/))),
          ...(d.important ? { impS: d.impStart + shift, impE: d.impEnd + shift, srcS: d.impStart, srcE: d.impEnd } : {})
        }))
      });
    });
    out += text.slice(pos);
    instrumented[file] = out;
  });
  return { files, meta, instrumented };
}
