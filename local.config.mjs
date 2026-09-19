import base from './playwright.config.mjs';
export default { ...base, retries: 0, use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } };
