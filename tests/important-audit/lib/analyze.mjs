// Decides, after the measurements, which candidates may go. Measuring zero differences is
// not enough on its own: a rule that would win once a candidate loses `!important` may only
// apply in a state the scenes never reached (a menu that was not opened, a :hover that was
// not forced). So a candidate is removable only when
//   * it applied to an element in at least one measured state, and
//   * every rule that could beat it afterwards (same property; important, or more specific,
//     or as specific and later) was measured on the same element at least once — or provably
//     cannot reach any element the candidate reaches.
// "Could reach" is decided on the DOM recorded in each state, with the competitor's
// selector loosened by everything that changes while the app runs: pseudo-classes,
// attribute selectors, :not()/:has(), and any class or id no measured state ever showed.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

export function splitTop(sel, chars = ',') {
  const out = []; let depth = 0, cur = '', q = null;
  for (const c of sel) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
    if (depth === 0 && chars.includes(c)) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
function specificity(complex) {
  let a = 0, b = 0, c = 0, s = complex;
  s = s.replace(/:(is|not|has|where)\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g, (m, fn, args) => {
    if (fn === 'where') return ' ';
    const best = splitTop(args).map(specificity).sort(cmp).pop() || [0, 0, 0];
    a += best[0]; b += best[1]; c += best[2];
    return ' ';
  });
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return ' '; });
  s = s.replace(/#[\w-]+/g, () => { a++; return ' '; });
  s = s.replace(/\.[\w-]+/g, () => { b++; return ' '; });
  s = s.replace(/::[\w-]+(\([^)]*\))?/g, () => { c++; return ' '; });
  s = s.replace(/:[\w-]+(\([^)]*\))?/g, () => { b++; return ' '; });
  s.replace(/(^|[\s>+~(])([a-zA-Z][\w-]*)/g, () => { c++; return ''; });
  return [a, b, c];
}
const pseudoElement = r => {
  const kinds = new Set(splitTop(r.selector).map(c => (/::([\w-]+)\s*$/.exec(c) || [])[1] || ''));
  return kinds.size === 1 ? [...kinds][0] : 'mixed';
};

// class -> the one tag the app's source writes it on, for a class no state showed.
function staticTags(root) {
  const files = execSync("git ls-files 'src/*.js' 'src/**/*.js' index.html", { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const seen = {};
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    for (const m of text.matchAll(/<([a-zA-Z][\w-]*)\b[^<>]*?\bclass=["']([^"'$]*)/g)) {
      for (const cls of m[2].split(/\s+/).filter(Boolean)) (seen[cls] ||= new Set()).add(m[1].toLowerCase());
    }
  }
  return Object.fromEntries(Object.entries(seen).filter(([, v]) => v.size === 1).map(([k, v]) => [k, [...v][0]]));
}

// [compound, combinator, compound, …] with each compound as { tag, ids, classes }.
function loosen(complex, seenClass, seenId, tags) {
  const parts = []; let cur = '', depth = 0, q = null;
  const push = () => { if (cur.trim()) parts.push(cur.trim()); cur = ''; };
  for (let i = 0; i < complex.length; i++) {
    const c = complex[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) {
      let comb = ' ';
      while (i < complex.length && /[\s>+~]/.test(complex[i])) { if (complex[i] !== ' ') comb = complex[i]; i++; }
      i--; push(); if (parts.length) parts.push(comb); continue;
    }
    cur += c;
  }
  push();
  if (parts.length && typeof parts[parts.length - 1] === 'string' && /^[\s>+~]$/.test(parts[parts.length - 1])) parts.pop();
  return parts.map((p, i) => {
    if (i % 2) return p;
    let s = p;
    for (let k = 0; k < 4; k++) s = s.replace(/:{1,2}[\w-]+\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, '');
    s = s.replace(/\[[^\]]*\]/g, '').replace(/::?[\w-]+/g, '');
    let tag = (/^([a-zA-Z][\w-]*)/.exec(s) || [])[1]?.toLowerCase() || '';
    const classes = [];
    for (const m of s.matchAll(/\.([\w-]+)/g)) {
      if (seenClass.has(m[1])) classes.push(m[1]);
      else if (!tag && tags[m[1]]) tag = tags[m[1]];
    }
    const ids = [...s.matchAll(/#([\w-]+)/g)].map(m => m[1]).filter(id => seenId.has(id));
    return { tag, ids, classes };
  });
}
function matchesCompound(node, c) {
  if (c.tag && node[0] !== c.tag) return false;
  if (c.ids.length && !c.ids.every(id => node[1] === id)) return false;
  return c.classes.every(cls => node[2].includes(cls));
}
// Right to left over the recorded DOM: [tag, id, classes, parent, previous sibling].
function matchesAt(dom, i, parts, k) {
  if (!matchesCompound(dom[i], parts[k])) return false;
  if (k === 0) return true;
  const comb = parts[k - 1];
  const prev = k - 2;
  if (comb === '>') return dom[i][3] >= 0 && matchesAt(dom, dom[i][3], parts, prev);
  if (comb === '+') return dom[i][4] >= 0 && matchesAt(dom, dom[i][4], parts, prev);
  const step = comb === '~' ? 4 : 3;
  for (let j = dom[i][step]; j >= 0; j = dom[j][step]) if (matchesAt(dom, j, parts, prev)) return true;
  return false;
}

export function analyze({ root, meta, longhands, outs, candidates }) {
  const decls = meta.flatMap(r => r.decls.map(d => ({ ...d, rule: r })));
  const declByKey = new Map(decls.map(d => [d.k, d]));
  const specMin = new Map(), specMax = new Map();
  for (const r of meta) {
    const sp = splitTop(r.selector).map(specificity).sort(cmp);
    specMin.set(r.id, sp[0]); specMax.set(r.id, sp[sp.length - 1]);
  }
  const ruleIdx = r => +r.id.split('-')[1];
  const orderLists = [...new Set(outs.map(o => JSON.stringify(o.order)))].map(o => JSON.parse(o));
  const laterAlways = (fx, fy) => {
    let res = null;
    for (const list of orderLists) {
      const ix = list.indexOf(fx), iy = list.indexOf(fy);
      if (ix < 0 || iy < 0) return 0;
      const v = ix > iy ? 1 : -1;
      if (res === null) res = v; else if (res !== v) return 0;
    }
    return res ?? 0;
  };
  // Could C's declaration win over D once D loses !important?
  const canBeat = (C, cd, D, dk) => {
    if (C.id === D.id) return cd.important || +cd.k.split('-')[2] > +dk.split('-')[2];
    if (cd.important) {
      // Where C already won it still wins; it only changes where D used to beat C.
      const k = cmp(specMax.get(D.id), specMin.get(C.id));
      if (k) return k > 0;
      return D.file === C.file ? ruleIdx(D) > ruleIdx(C) : laterAlways(D.file, C.file) >= 0;
    }
    const k = cmp(specMax.get(C.id), specMin.get(D.id));
    if (k) return k > 0;
    return C.file === D.file ? ruleIdx(C) > ruleIdx(D) : laterAlways(C.file, D.file) >= 0;
  };

  const seenClass = new Set(), seenId = new Set();
  const doms = outs.filter(o => o.dom);
  for (const o of doms) for (const node of o.dom) { node[2].forEach(c => seenClass.add(c)); if (node[1]) seenId.add(node[1]); }
  const tags = staticTags(root);
  const loosened = new Map();
  const loose = r => {
    if (!loosened.has(r.id)) loosened.set(r.id, splitTop(r.selector).map(c => ({ pe: (/::([\w-]+)\s*$/.exec(c) || [])[1] || '', parts: loosen(c.replace(/::[\w-]+\s*$/, ''), seenClass, seenId, tags) })));
    return loosened.get(r.id);
  };
  const reaches = (C, o, keys) => keys.some(key => {
    const [i, pe = ''] = String(key).split('::');
    return loose(C).some(x => x.pe === pe && matchesAt(o.dom, +i, x.parts, x.parts.length - 1));
  });

  const byLong = new Map();
  for (const d of decls) for (const l of longhands[d.k] || [d.prop]) { if (!byLong.has(l)) byLong.set(l, []); byLong.get(l).push(d); }

  const result = { removable: [], blocked: {}, noEvidence: [] };
  for (const k of candidates) {
    const D = declByKey.get(k), R = D.rule;
    if (!outs.some(o => o.res[R.id]?.m.length)) { result.noEvidence.push(k); continue; }
    const competitors = new Map();
    for (const l of longhands[k] || [D.prop]) for (const cd of byLong.get(l) || []) if (cd.k !== k) competitors.set(cd.k, cd);
    let blocker = null;
    for (const cd of competitors.values()) {
      const C = cd.rule;
      if (pseudoElement(C) !== pseudoElement(R) || !canBeat(C, cd, R, k)) continue;
      let measured = false, possible = false;
      for (const o of outs) {
        const mine = o.res[R.id]?.m;
        if (!mine?.length) continue;
        const theirs = o.res[C.id];
        const set = new Set(mine.map(String));
        if (theirs?.m.some(x => set.has(String(x)))) { measured = true; break; }
        if (theirs?.u) possible = true;
        else if (!possible && o.dom && reaches(C, o, mine)) possible = true;
      }
      if (!measured && possible) { blocker = cd; break; }
    }
    if (blocker) result.blocked[k] = blocker.k; else result.removable.push(k);
  }
  return result;
}
