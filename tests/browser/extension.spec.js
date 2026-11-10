import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createServer } from '../../server/index.mjs';

test('real Chromium extension loads its service worker, popup, and private dashboard', async () => {
  const executablePath = process.env.EVERGREEN_EXTENSION_BROWSER || chromium.executablePath();
  test.skip(!existsSync(executablePath), 'Install Playwright Chromium or set EVERGREEN_EXTENSION_BROWSER to a Chromium-for-testing executable.');
  const server = createServer({ apiKey: '', model: 'test/vision' });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8787, '127.0.0.1', resolve); });
  const context = await chromium.launchPersistentContext('', { executablePath, headless: true, args: [`--disable-extensions-except=${resolve('dist/chromium')}`, `--load-extension=${resolve('dist/chromium')}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole('button', { name: 'Open my journal' })).toBeVisible();
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(page.getByRole('heading', { name: 'Your overview', exact: true })).toBeVisible();
    await expect(page.getByText('Your journal has room to grow.')).toBeVisible();
    await page.getByRole('button', { name: 'Log an action' }).click();
    await page.getByRole('button', { name: 'Save action', exact: true }).click();
    await expect(page.getByText('Took public transport', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Took public transport', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings & data', exact: true }).click();
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(page.getByText('Backend online. Set OPENROUTER_API_KEY in .env.', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
});
