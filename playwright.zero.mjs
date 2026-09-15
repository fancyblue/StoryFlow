import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({
  ...base,
  expect: { toHaveScreenshot: { animations: 'disabled', threshold: 0, maxDiffPixelRatio: 0, maxDiffPixels: 0 } },
  use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } }
});
