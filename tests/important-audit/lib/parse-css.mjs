// Minimal CSS parser: style rules (with their at-rule context) and their declarations, with
// source offsets of every `!important`.
export function parseCss(text) {
  const rules = [];
  const n = text.length;
  // Skip a comment or string starting at i; returns new index or -1 if not one.
  function skipAtom(i) {
    if (text[i] === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); return e < 0 ? n : e + 2; }
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i]; let j = i + 1;
      while (j < n && text[j] !== q) { if (text[j] === '\\') j++; j++; }
      return j + 1;
    }
    return -1;
  }
  // Find first top-level char in set from i (respect parens, comments, strings).
  function findTop(i, end, set) {
    let depth = 0;
    while (i < end) {
      const s = skipAtom(i); if (s >= 0) { i = s; continue; }
      const c = text[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth === 0 && set.includes(c)) return i;
      i++;
    }
    return -1;
  }
  function matchBrace(i) { // i at '{'
    let depth = 0;
    while (i < n) {
      const s = skipAtom(i); if (s >= 0) { i = s; continue; }
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) return i; }
      i++;
    }
    return n;
  }
  function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
  function parseDecls(start, end) {
    const decls = [];
    let i = start;
    while (i < end) {
      let semi = findTop(i, end, ';{');
      if (semi >= 0 && text[semi] === '{') throw new Error(`nested block at ${semi}`);
      if (semi < 0) semi = end;
      const raw = text.slice(i, semi);
      const colon = raw.indexOf(':');
      if (stripComments(raw).trim() && colon > 0) {
        const prop = stripComments(raw.slice(0, colon)).trim();
        const valueRaw = raw.slice(colon + 1);
        const m = /!\s*important\s*((?:\/\*[\s\S]*?\*\/\s*)*)$/i.exec(valueRaw);
        const decl = { prop, value: stripComments(valueRaw).replace(/!\s*important\s*$/i, '').trim(), important: Boolean(m), start: i, end: semi };
        if (m) { decl.impStart = i + colon + 1 + m.index; decl.impEnd = decl.impStart + m[0].length - m[1].length; }
        decls.push(decl);
      }
      i = semi + 1;
    }
    return decls;
  }
  function parseList(i, end, context) {
    while (i < end) {
      while (i < end) { const s = skipAtom(i); if (s >= 0 && text[i] === '/') { i = s; continue; } if (/\s/.test(text[i])) { i++; continue; } break; }
      if (i >= end) break;
      if (text[i] === '}') { i++; continue; }
      const stop = findTop(i, end, '{;');
      if (stop < 0) break;
      const prelude = stripComments(text.slice(i, stop)).trim().replace(/\s+/g, ' ');
      if (text[stop] === ';') { i = stop + 1; continue; }
      const close = matchBrace(stop);
      if (prelude.startsWith('@')) {
        const name = /^@([\w-]+)/.exec(prelude)[1].toLowerCase();
        if (['media', 'supports', 'container', 'layer'].includes(name)) parseList(stop + 1, close, [...context, prelude]);
        // keyframes, font-face, property, page: opaque
      } else {
        rules.push({ index: rules.length, selector: prelude, context, open: stop, close, decls: parseDecls(stop + 1, close) });
      }
      i = close + 1;
    }
  }
  parseList(0, n, []);
  return rules;
}
