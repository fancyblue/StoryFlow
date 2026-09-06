// Standing in for a connected StoryFlow folder.
//
// Creating a work requires a connected folder, because a work is written into that
// folder from the moment it exists. A headless browser cannot connect one: the File
// System Access picker needs a real user gesture and a real directory. Without a
// stand-in, every test that creates a work would be testing the folder gate instead of
// its own subject.
//
// Two things have to be true, matching what a real connected session looks like:
// folder-session.js refuses to revive a folder on a cold browser session unless its
// sessionStorage hint is set, and the restore itself has to report a connected folder.
// This replaces only that state lookup, never the gate — the gate has its own test.
export async function standInForConnectedFolder(page) {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('storyflow.folder.session.v1', '1'); } catch (_) {}

    const folder = {
      supported: true,
      connected: true,
      name: 'StoryFlow 測試資料夾',
      remembered: true
    };
    let integrations;
    // The module assigns window.StoryFlowIntegrations once at startup. Intercepting
    // that assignment patches the real object before folder-session.js wraps it, so the
    // wrapper ends up calling this as its base.
    Object.defineProperty(window, 'StoryFlowIntegrations', {
      configurable: true,
      get: () => integrations,
      set: next => {
        integrations = next;
        if (next && typeof next === 'object' && !next.__folderStandIn) {
          next.__folderStandIn = true;
          next.restoreOutputDirectory = async () => ({ ...folder });
          // A folder that reports itself connected must also accept a write. Reporting
          // connected while every save still failed put the app in a state no real user
          // reaches: "保存失敗 · 請重試" in the header and a toast sliding in over the
          // layout, which moved measured positions and made position assertions flaky.
          // The stand-in keeps the workspace in memory so the connected state is
          // coherent. A test that is about saving still overrides these afterwards,
          // because page.evaluate runs after this init script.
          const realSave = next.saveWorkspace;
          next.saveWorkspace = async (...args) => {
            try {
              return await realSave.apply(next, args);
            } catch (_) {
              // No real directory handle exists, so the write cannot land. Report the
              // success the connected state implies rather than leaving the header in
              // "保存失敗 · 請重試"; a test that is about saving overrides this after
              // load, since page.evaluate runs later than this init script.
              return { name: folder.name };
            }
          };
        }
      }
    });
  });
}
