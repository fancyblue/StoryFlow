import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';
export default defineConfig({
  ...base,
  use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } }
});
