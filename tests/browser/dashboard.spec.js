import { test, expect } from '@playwright/test';

test('journal actions persist and remain separate from the demo', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByRole('heading', { name: 'Your overview', exact: true })).toBeVisible();
  await expect(page.getByText("You're exploring a sample journal.", { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Start my journal' }).click();
  await expect(page.getByText('Your journal has room to grow.')).toBeVisible();
  await page.getByRole('button', { name: 'Log an action' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').selectOption('bike');
  await dialog.getByPlaceholder('What made this possible?').fill('A protected bike lane made it possible.');
  await dialog.getByRole('button', { name: 'Save action' }).click();
  await expect(page.getByText('Rode my bike', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My action journal', exact: true }).click();
  await page.getByRole('searchbox').fill('protected');
  await expect(page.getByText('Rode my bike', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('no-match');
  await expect(page.getByText('Rode my bike', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Personal mode' }).click();
  await expect(page.getByText('Rode my bike', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Demo mode', exact: true }).click();
  await page.getByRole('button', { name: 'Climate Wrapped', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save my recap' }).click();
  expect((await download).suggestedFilename()).toBe('evergreen-wrapped.svg');
  await page.reload(); await page.getByRole('button', { name: 'Start my journal' }).click();
  await expect(page.getByText('Rode my bike', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('small screen layout stays within the viewport and supports keyboard dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByRole('heading', { name: 'Your overview', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Log an action' }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('all journal screens render and controls change time periods', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  await expect(page.locator('.stats-row > div:first-child strong')).toHaveText(/^28/);
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(page.locator('.stats-row > div:first-child strong')).toHaveText(/^14/);
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.getByRole('img', { name: /^year action chart/ })).toBeVisible();
  for (const [button, heading] of [['Profile insights', 'Profile insights'], ['About the project', 'Behind Evergreen'], ['Settings & data', 'Settings & data'], ['Climate Wrapped', 'Climate Wrapped']]) {
    await page.getByRole('button', { name: button, exact: true }).click(); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/wrapped-desktop.png', fullPage: true });
});
