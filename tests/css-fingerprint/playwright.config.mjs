import { fileURLToPath } from 'node:url';
import base from '../../playwright.config.mjs';

// The CSS fingerprint is a tool, not part of the suite: it lives outside tests/browser so
// `npm test` never runs it. STORYFLOW_CHROMIUM points it at a browser other than the one
// the pinned Playwright expects, such as a container's preinstalled Chromium.
export default {
  ...base,
  testDir: '.',
  retries: 0,
  reporter: 'line',
  // The server serves the repository, not this folder.
  webServer: { ...base.webServer, cwd: fileURLToPath(new URL('../..', import.meta.url)) },
  use: {
    ...base.use,
    ...(process.env.STORYFLOW_CHROMIUM ? { launchOptions: { executablePath: process.env.STORYFLOW_CHROMIUM } } : {})
  }
};
