// Evaluated inside the app page by engine.mjs; everything hangs off window.__importantAudit.
// It finds each served rule by its `--sfr-…` marker, takes `!important` off chosen
// declarations by rewriting that rule's cssText in place (the stylesheet and its position in
// the cascade do not move), and compares every element's computed style before and after.
(() => {
  const A = window.__importantAudit = {};
  let meta = null;
  let ruleById = new Map();
  const declByKey = new Map();
  const STATE_PSEUDO = { hover: /:hover(?![\w-])/, focus: /:focus(-visible|-within)?(?![\w-])/, active: /:active(?![\w-])/ };
  const ANY_STATE = /:(hover|focus-visible|focus-within|focus|active)(?![\w-])/g;
  const UNMEASURABLE = /::(?!before\b|after\b)[\w-]+|:-webkit-[\w-]+|:-moz-[\w-]+/;
  const probe = document.createElement('div');

  function walk(list, out) {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) out.push(rule);
      else if (rule.cssRules) walk(rule.cssRules, out);
    }
  }
  function splitTop(sel, chars) {
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

  // Find the served rules again; a stylesheet re-appended by the app is a new CSSOM object.
  A.init = m => {
    if (m) meta = m;
    declByKey.clear();
    const byMarker = new Map();
    for (const sheet of document.styleSheets) {
      const rules = [];
      try { walk(sheet.cssRules, rules); } catch (_) { continue; }
      for (const rule of rules) {
        for (let i = 0; i < rule.style.length; i++) {
          const name = rule.style[i];
          if (name.startsWith('--sfr-')) { byMarker.set(name.slice(6), rule); break; }
        }
      }
    }
    ruleById = new Map();
    const missing = [];
    for (const r of meta) {
      const rule = byMarker.get(r.id);
      if (rule) ruleById.set(r.id, rule); else missing.push(r.id);
      for (const d of r.decls) {
        d.rule = r;
        declByKey.set(d.k, d);
        if (d.prop.startsWith('--')) { d.long = [d.prop]; continue; }
        probe.style.cssText = '';
        probe.style.setProperty(d.prop, d.value);
        d.long = [...probe.style];
        if (!d.long.length) d.long = [d.prop];
      }
    }
    return { found: ruleById.size, missing };
  };
  A.longhands = () => Object.fromEntries(meta.flatMap(r => r.decls.map(d => [d.k, d.long])));

  let modified = new Set();
  A.remove = keys => {
    const perRule = new Map();
    for (const k of keys) {
      const d = declByKey.get(k);
      if (!d || d.impS === undefined) continue;
      if (!perRule.has(d.rule.id)) perRule.set(d.rule.id, []);
      perRule.get(d.rule.id).push(d);
    }
    for (const [id, decls] of perRule) {
      const rule = ruleById.get(id);
      if (!rule) continue;
      let body = decls[0].rule.body;
      decls.sort((a, b) => b.impS - a.impS).forEach(d => { body = body.slice(0, d.impS) + body.slice(d.impE); });
      rule.style.cssText = body;
      modified.add(id);
    }
  };
  A.restore = () => {
    for (const id of modified) ruleById.get(id).style.cssText = meta.find(r => r.id === id).body;
    modified = new Set();
  };
  // A transition started by the change would otherwise be read halfway.
  A.finish = () => { for (const a of document.getAnimations()) { try { a.finish(); } catch (_) { try { a.cancel(); } catch (__) {} } } };

  let els = [];
  A.collect = () => {
    const skip = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD', 'TEMPLATE', 'NOSCRIPT']);
    const toast = document.getElementById('storyflowToastStack');
    els = [...document.querySelectorAll('*')].filter(el => !skip.has(el.tagName) && !(toast && toast.contains(el)) && !el.closest('svg defs'));
    return els.length;
  };
  // The forced element, what follows it (for + and ~) and everything inside those.
  A.collectScope = i => {
    const t = document.querySelector(`[data-important-audit-target="${i}"]`);
    if (!t) return 0;
    const set = new Set([t, ...t.querySelectorAll('*')]);
    for (let s = t.nextElementSibling; s; s = s.nextElementSibling) { set.add(s); s.querySelectorAll('*').forEach(x => set.add(x)); }
    els = [...document.querySelectorAll('*')].filter(el => set.has(el));
    return els.length;
  };
  A.parents = () => {
    const index = new Map(els.map((el, i) => [el, i]));
    return els.map(el => { let p = el.parentElement; while (p && !index.has(p)) p = p.parentElement; return p ? index.get(p) : -1; });
  };
  A.describe = i => { const el = els[i]; return el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${[...el.classList].slice(0, 3).map(c => '.' + c).join('')}` : ''; };

  let props = [];
  A.setProps = p => { props = p; };
  function read() {
    return els.map(el => {
      if (!el.isConnected) return null;
      const s = getComputedStyle(el);
      const row = { e: props.map(p => s.getPropertyValue(p)) };
      for (const ps of ['::before', '::after']) {
        const q = getComputedStyle(el, ps);
        if (q.content && q.content !== 'none' && q.content !== 'normal') row[ps] = props.map(p => q.getPropertyValue(p));
      }
      return row;
    });
  }
  let base = null;
  A.base = () => { A.finish(); base = read(); };
  A.diff = () => {
    A.finish();
    const now = read();
    const diffs = [];
    for (let i = 0; i < els.length; i++) {
      // An element the app replaced while we looked (a re-rendered preview) is skipped.
      if (!base[i] || !now[i]) continue;
      for (const part of ['e', '::before', '::after']) {
        const a = base[i][part], b = now[i][part];
        if (!a && !b) continue;
        if (!a || !b) { diffs.push([i, part, '*']); continue; }
        for (let j = 0; j < props.length; j++) if (a[j] !== b[j]) diffs.push([i, part, props[j]]);
      }
    }
    return diffs;
  };

  function contextActive(ctx) {
    for (const c of ctx) {
      if (c.startsWith('@media') && !matchMedia(c.slice(6).trim()).matches) return false;
      if (c.startsWith('@supports') && !CSS.supports(c.slice(9).trim())) return false;
    }
    return true;
  }
  // @container: only the `name (max-width:Npx)` form the stylesheets use.
  function containerOk(ctx, el) {
    for (const c of ctx) {
      if (!c.startsWith('@container')) continue;
      const m = /@container\s+([\w-]+)?\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/.exec(c);
      if (!m) return false;
      let a = el.parentElement;
      while (a && !(getComputedStyle(a).containerName || '').split(' ').includes(m[1])) a = a.parentElement;
      if (!a) return false;
      const s = getComputedStyle(a);
      const w = a.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth);
      if (!(w <= +m[2])) return false;
    }
    return true;
  }
  // Which elements each rule applies to now, and the DOM's shape for the analysis to ask
  // which elements a rule could apply to in a state that was not measured.
  A.match = withDom => {
    const index = new Map(els.map((el, i) => [el, i]));
    const res = {};
    for (const r of meta) {
      const out = { m: [] };
      if (UNMEASURABLE.test(r.selector)) { out.u = 1; res[r.id] = out; continue; }
      if (!contextActive(r.context)) { res[r.id] = out; continue; }
      const container = r.context.some(c => c.startsWith('@container'));
      for (const complex of splitTop(r.selector, ',')) {
        const ps = (/::(before|after)\s*$/.exec(complex) || [])[1];
        let found = [];
        try { found = document.querySelectorAll(complex.replace(/::(before|after)\s*$/, '')); } catch (_) { out.u = 1; continue; }
        for (const el of found) {
          const i = index.get(el);
          if (i === undefined || (container && !containerOk(r.context, el))) continue;
          out.m.push(ps ? `${i}::${ps}` : i);
        }
      }
      out.m = [...new Set(out.m)];
      res[r.id] = out;
    }
    const inline = [];
    els.forEach((el, i) => { for (let j = 0; j < el.style.length; j++) inline.push([i, el.style[j]]); });
    const order = [...document.styleSheets].map(s => { try { return new URL(s.href).pathname.replace(/^\//, ''); } catch (_) { return ''; } }).filter(Boolean);
    const result = { res, inline, order, n: els.length };
    if (withDom) {
      result.dom = els.map(el => {
        let prev = el.previousElementSibling; while (prev && !index.has(prev)) prev = prev.previousElementSibling;
        return [el.tagName.toLowerCase(), el.id, [...el.classList], index.get(el.parentElement) ?? -1, prev ? index.get(prev) : -1];
      });
    }
    return result;
  };

  // Elements a :hover / :focus / :active rule that competes with a candidate could reach:
  // the compound carrying the pseudo-class, with state pseudo-classes taken off. One element
  // per tag/id/class signature is enough to see that rule at work.
  A.forcedTargets = (kind, candidateKeys, limit) => {
    document.querySelectorAll('[data-important-audit-target]').forEach(el => el.removeAttribute('data-important-audit-target'));
    const candLong = new Set(candidateKeys.flatMap(k => declByKey.get(k)?.long || []));
    const re = STATE_PSEUDO[kind];
    const seen = new Set();
    const targets = [];
    for (const r of meta) {
      if (!re.test(r.selector) || !r.decls.some(d => (d.long || []).some(l => candLong.has(l)))) continue;
      for (const complex of splitTop(r.selector, ',')) {
        const m = re.exec(complex);
        if (!m) continue;
        let depth = 0;
        for (let j = 0; j < m.index; j++) { if (complex[j] === '(') depth++; else if (complex[j] === ')') depth--; }
        if (depth) continue;
        let i = m.index + m[0].length;
        while (i < complex.length && !(depth === 0 && /[\s>+~]/.test(complex[i]))) { if (complex[i] === '(') depth++; else if (complex[i] === ')') depth--; i++; }
        const prefix = complex.slice(0, i).replace(ANY_STATE, '').replace(/::(before|after)/g, '').trim() || '*';
        let found = [];
        try { found = document.querySelectorAll(prefix); } catch (_) { continue; }
        for (const el of found) {
          if (el.closest('#storyflowToastStack')) continue;
          const sig = `${el.tagName}#${el.id}.${[...el.classList].sort().join('.')}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          targets.push(el);
        }
      }
    }
    targets.slice(0, limit).forEach((el, i) => el.setAttribute('data-important-audit-target', String(i)));
    return Math.min(targets.length, limit);
  };
})();
