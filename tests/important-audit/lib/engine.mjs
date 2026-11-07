// Measures, in one page state, whether taking `!important` off the candidate declarations
// changes any element's computed style, and keeps every candidate a change traces back to.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMeta } from './meta.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '');
const { meta, instrumented } = buildMeta(ROOT);
const lib = readFileSync(new URL('./page-lib.js', import.meta.url), 'utf8');
const metaLite = meta.map(r => ({ id: r.id, selector: r.selector, context: r.context, body: r.body,
  decls: r.decls.map(d => ({ k: d.k, prop: d.prop, value: d.value, impS: d.impS, impE: d.impE })) }));
const declOf = new Map(meta.flatMap(r => r.decls.map(d => [d.k, { ...d, rule: r }])));

// Properties a size change somewhere else drags along; a difference in them alone is traced
// through the element whose own declaration changed.
const LAYOUT = new Set(['height', 'width', 'grid-template-rows', 'grid-template-columns', 'block-size', 'inline-size',
  'perspective-origin', 'transform-origin', 'min-height', 'max-height', 'top', 'left', 'right', 'bottom',
  'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end']);

// The run shared by every test: AUDIT_DIR holds candidates.json, and each test writes its
// own kept-<test>.json and the per-state match data under out/.
export function run() {
  const dir = process.env.IMPORTANT_AUDIT_DIR;
  if (!dir || !existsSync(`${dir}/candidates.json`)) return null;
  mkdirSync(`${dir}/out`, { recursive: true });
  return { dir, candidates: JSON.parse(readFileSync(`${dir}/candidates.json`, 'utf8')), saveDom: !existsSync(`${dir}/verify`) };
}

export async function instrument(page) {
  await page.route(/\/styles\/.*\.css(\?.*)?$/, route => {
    const file = new URL(route.request().url()).pathname.replace(/^\//, '');
    if (!(file in instrumented)) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: instrumented[file] });
  });
}

export function context(runInfo, name) {
  return { ...runInfo, name, cand: new Set(runInfo.candidates), kept: {}, longhands: null };
}

function save(ctx) {
  writeFileSync(`${ctx.dir}/kept-${ctx.name.replace(/[^\w.-]+/g, '_')}.json`, JSON.stringify(ctx.kept));
}

async function prepare(page, ctx) {
  const has = await page.evaluate(() => Boolean(window.__importantAudit));
  if (!has) await page.evaluate(lib);
  const init = await page.evaluate(m => window.__importantAudit.init(m), has ? null : metaLite);
  if (!ctx.longhands) {
    ctx.longhands = await page.evaluate(() => window.__importantAudit.longhands());
    if (!existsSync(`${ctx.dir}/longhands.json`)) writeFileSync(`${ctx.dir}/longhands.json`, JSON.stringify(ctx.longhands));
  }
  return init;
}

export async function measure(page, label, ctx) {
  await prepare(page, ctx);
  await page.evaluate(() => window.__importantAudit.collect());
  await core(page, label, ctx, false);
}

export async function measureForced(page, cdp, label, ctx, kind, limit = 120) {
  if (!ctx.cand.size) return;
  await prepare(page, ctx);
  const n = await page.evaluate(([k, c, l]) => window.__importantAudit.forcedTargets(k, c, l), [kind, [...ctx.cand], limit]);
  if (!n) return;
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const forced = kind === 'focus' ? ['focus', 'focus-visible', 'focus-within'] : [kind];
  for (let i = 0; i < n; i++) {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-important-audit-target="${i}"]` });
    if (!nodeId) continue;
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: forced });
    if (await page.evaluate(j => window.__importantAudit.collectScope(j), i)) await core(page, `${label}#${kind}${i}`, ctx, true);
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  }
}

async function core(page, label, ctx, forced) {
  const { longhands, cand } = ctx;
  const parents = await page.evaluate(() => window.__importantAudit.parents());
  const match = await page.evaluate(withDom => window.__importantAudit.match(withDom), ctx.saveDom && !forced);
  if (forced) for (const [id, v] of Object.entries(match.res)) if (!v.m.length) delete match.res[id];
  if (ctx.saveDom) writeFileSync(`${ctx.dir}/out/${label.replace(/[^\w.-]+/g, '_')}.json`, JSON.stringify({ label, forced, ...match }));
  if (!cand.size) return;
  const at = new Map();
  for (const k of cand) {
    const m = match.res[declOf.get(k).rule.id];
    if (m) for (const key of m.m) { const s = String(key); if (!at.has(s)) at.set(s, []); at.get(s).push(k); }
  }
  const props = [...new Set([...cand].flatMap(k => longhands[k] || []))];
  await page.evaluate(p => window.__importantAudit.setProps(p), props);
  await page.evaluate(() => window.__importantAudit.base());
  for (let round = 0; round < 40; round++) {
    await page.evaluate(keys => window.__importantAudit.remove(keys), [...cand]);
    const diffs = await page.evaluate(() => window.__importantAudit.diff());
    await page.evaluate(() => window.__importantAudit.restore());
    if (!diffs.length) break;
    const implicated = new Map();
    const blame = (k, i, prop) => { if (!implicated.has(k)) implicated.set(k, [i, prop]); };
    for (const [i, part, prop] of diffs) {
      const key = part === 'e' ? String(i) : `${i}${part}`;
      const direct = (at.get(key) || []).filter(k => cand.has(k) && (prop === '*' || (longhands[k] || []).includes(prop)));
      if (direct.length) { direct.forEach(k => blame(k, i, prop)); continue; }
      // inherited: the nearest ancestor whose candidate sets this property
      let found = false;
      for (let p = parents[i]; p >= 0 && !found; p = parents[p]) {
        const up = (at.get(String(p)) || []).filter(k => cand.has(k) && (longhands[k] || []).includes(prop));
        if (up.length) { up.forEach(k => blame(k, p, prop)); found = true; }
      }
      if (found) continue;
      const any = (at.get(key) || []).filter(k => cand.has(k));
      if (any.length) any.forEach(k => blame(k, i, prop));
      else if (!LAYOUT.has(prop)) console.log(`  ${label}: no candidate explains ${prop} on element ${i}`);
    }
    if (!implicated.size && forced) {
      // The cause lies outside the forced element's subtree: measure the whole page.
      await page.evaluate(() => window.__importantAudit.collect());
      return core(page, `${label}-page`, ctx, false);
    }
    if (!implicated.size) {
      // Keep everything touching the differing elements, their ancestors and descendants.
      for (const [i, , prop] of diffs) {
        const related = new Set([i]);
        for (let p = parents[i]; p >= 0; p = parents[p]) related.add(p);
        parents.forEach((p, j) => { for (let q = p; q >= 0; q = parents[q]) if (q === i) { related.add(j); break; } });
        for (const r of related) for (const key of [String(r), `${r}::before`, `${r}::after`]) (at.get(key) || []).filter(k => cand.has(k)).forEach(k => blame(k, i, prop));
      }
      if (!implicated.size) { console.log(`  ${label}: UNRESOLVED difference ${JSON.stringify(diffs.slice(0, 3))}`); break; }
    }
    for (const [k, [i, prop]] of implicated) {
      cand.delete(k);
      ctx.kept[k] = { state: label, index: i, element: await page.evaluate(j => window.__importantAudit.describe(j), i), property: prop };
    }
  }
  save(ctx);
}

export { meta, ROOT };
