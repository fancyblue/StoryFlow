// Render pipeline.
//
// Four global render functions — renderAll, renderChapters, renderSuggestion and renderParts —
// used to be extended by reassignment: a module captured the current window function and put a
// wrapper in its place. Eighteen modules did this twenty-four times, so what ran depended on
// load order, and a module that *replaced* a function rather than wrapping it silently threw
// away every wrapper loaded before it. Four wrappers had been discarded that way — source-flow's
// renderChapters and renderParts hooks, platform-lock's renderParts hook and
// workspace-interactions' whole renderChapters — and ran only while the page was still loading,
// before the replacement arrived. Nothing in the code said so.
//
// Now each function has one implementation and explicit hooks:
//
//   StoryFlowRender.provide(name, impl)      the implementation (a later provide replaces it,
//                                            and keeps every hook)
//   StoryFlowRender.before(name, key, hook)  runs before the implementation
//   StoryFlowRender.after(name, key, hook)   runs after it, given its result and arguments
//
// After-hooks run in registration order and before-hooks in reverse — the order the wrapper
// chain produced, where the last module loaded was the outermost wrapper. A hook registered
// again under the same key replaces itself rather than running twice, which is what the
// `__marker` flags on the old wrappers guarded against. The functions stay on window under
// their old names, so every caller, including app.js's unqualified calls, reaches the pipeline.
// scripts/check-static.mjs refuses a new `window.renderX =` so the chain cannot grow back.
(function () {
  const NAMES = ['renderAll', 'renderChapters', 'renderSuggestion', 'renderParts'];
  const pipelines = new Map();

  function pipeline(name) {
    const entry = pipelines.get(name);
    if (!entry) throw new Error(`StoryFlowRender: ${name} is not a render pipeline`);
    return entry;
  }

  function upsert(list, key, hook) {
    if (typeof hook !== 'function') throw new Error(`StoryFlowRender: hook ${key} is not a function`);
    const index = list.findIndex(item => item.key === key);
    if (index >= 0) list[index] = { key, hook };
    else list.push({ key, hook });
  }

  function install(name) {
    const initial = window[name];
    if (typeof initial !== 'function') throw new Error(`StoryFlowRender: ${name} is not defined yet`);
    const entry = { impl: initial, before: [], after: [] };
    pipelines.set(name, entry);
    window[name] = function (...args) {
      for (let index = entry.before.length - 1; index >= 0; index -= 1) entry.before[index].hook.apply(this, args);
      const result = entry.impl.apply(this, args);
      for (const { hook } of entry.after) hook.call(this, result, ...args);
      return result;
    };
  }

  NAMES.forEach(install);

  window.StoryFlowRender = Object.freeze({
    provide(name, impl) {
      if (typeof impl !== 'function') throw new Error(`StoryFlowRender: ${name} implementation is not a function`);
      pipeline(name).impl = impl;
    },
    before(name, key, hook) { upsert(pipeline(name).before, key, hook); },
    after(name, key, hook) { upsert(pipeline(name).after, key, hook); },
    // What runs, in order, when `name` is called — for diagnostics and tests.
    describe(name) {
      const entry = pipeline(name);
      return {
        before: entry.before.map(item => item.key).reverse(),
        impl: entry.impl.name || 'anonymous',
        after: entry.after.map(item => item.key)
      };
    }
  });
})();
