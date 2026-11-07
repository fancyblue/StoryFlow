import { fileURLToPath } from 'node:url';
import base from '../../playwright.config.mjs';

// A tool, not part of the suite: it lives outside tests/browser so `npm test` never runs it.
// Each test measures one group of states and writes its own result, so they run in
// parallel. STORYFLOW_CHROMIUM points it at another Chromium, as for css:fingerprint.
export default {
  ...base,
  testDir: '.',
  fullyParallel: true,
  workers: Number(process.env.IMPORTANT_AUDIT_WORKERS) || 4,
  retries: 0,
  timeout: 0,
  reporter: 'line',
  webServer: { ...base.webServer, cwd: fileURLToPath(new URL('../..', import.meta.url)) },
  use: {
    ...base.use,
    trace: 'off',
    screenshot: 'off',
    ...(process.env.STORYFLOW_CHROMIUM ? { launchOptions: { executablePath: process.env.STORYFLOW_CHROMIUM } } : {})
  }
};
