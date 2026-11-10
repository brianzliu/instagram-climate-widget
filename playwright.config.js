import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, fullyParallel: false,
  use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, reducedMotion: 'reduce', viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
