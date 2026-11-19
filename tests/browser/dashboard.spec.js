import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCommunityServer } from '../../server/community.mjs';

const photo = {
  name: 'park.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64'),
};

test('journal actions persist and remain separate from the demo', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await expect(page).toHaveTitle('Touch Grass · Your climate journal');
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
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByRole('searchbox').fill('protected');
  await expect(page.getByText('Rode my bike', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('no-match');
  await expect(page.getByText('Rode my bike', { exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Personal mode' }).click();
  await expect(page.getByText('Rode my bike', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Demo mode', exact: true }).click();
  await page.getByRole('button', { name: 'Climate Wrapped', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No actions in this period' })).toBeVisible();
  await page.getByRole('button', { name: 'Personal mode' }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save my recap' }).click();
  expect((await download).suggestedFilename()).toBe('touch-grass-wrapped.svg');
  await page.reload(); await page.getByRole('button', { name: 'Start my journal' }).click();
  await expect(page.getByText('Rode my bike', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Instagram observations use published dates, keep unknown dates visible, and do not become personal actions', async ({ page }) => {
  const current = new Date(); const today = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
  await page.addInitScript(({today})=>{
    const observedPosts=[
      {id:'instagram:old',username:'example',url:'https://www.instagram.com/p/old/',caption:'An older bus journey.',publishedDate:'2023-05-03',publishedAt:null,dateSource:'post permalink time',analyzedAt:new Date().toISOString(),finding:{category:'transport',signal:'supportive',observation:'An older transport observation.',evidence:'The caption describes a journey.',confidence:'medium'}},
      {id:'instagram:today',username:'example',url:'https://www.instagram.com/p/today/',caption:'A plant-based meal.',publishedDate:today,dateSource:'page publication metadata',analyzedAt:new Date().toISOString(),finding:{category:'food',signal:'supportive',observation:'A current food observation.',evidence:'Caption evidence.',confidence:'medium'}},
      {id:'instagram:unknown',username:'another',url:'https://www.instagram.com/p/unknown/',caption:'Undated caption.',publishedAt:null,publishedDate:null,dateSource:'unknown',analyzedAt:new Date().toISOString(),finding:null},
    ];
    localStorage.setItem('evergreen:personal:v1',JSON.stringify({version:1,actions:[],observations:[],observedPosts,responses:[]}));
  },{today});
  await page.goto('http://127.0.0.1:5173/#journal');await page.getByRole('button',{name:'Start my journal'}).click();
  await expect(page.getByRole('tab',{name:'Instagram observations (3)'})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('May 3, 2023',{exact:true})).toBeVisible();
  await expect(page.locator('.observation-published time').filter({hasText:'Published date unknown'})).toBeVisible();
  await page.getByLabel('Observation dates').selectOption('period');
  await expect(page.getByText('A current food observation.',{exact:true})).toBeVisible();
  await expect(page.getByText('An older transport observation.',{exact:true})).toHaveCount(0);
  await page.getByLabel('Observation dates').selectOption('unknown');
  await expect(page.locator('.observation-entry')).toHaveCount(1);
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await expect(page.locator('.stats-row > div:first-child strong')).toHaveText(/^0/);
  await page.getByRole('button', { name: 'Climate Wrapped', exact: true }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No actions in this period' })).toBeVisible();
  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByRole('heading', { name: 'This recap is still growing' })).toBeVisible();
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByLabel('Observation dates').selectOption('period');
  await page.getByRole('button', { name: 'Review for my journal' }).click();
  await page.getByRole('dialog').getByLabel('Action', { exact: true }).fill('Made a vegan lunch.');
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page.getByText('Saved to your actions')).toBeVisible();
  await page.getByRole('tab', { name: 'My actions' }).click();
  await expect(page.getByText('Made a vegan lunch.')).toBeVisible();
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
  for (const [button, heading] of [['Community', 'Community'], ['About the project', 'Behind Touch Grass'], ['Settings & data', 'Settings & data'], ['Climate Wrapped', 'Climate Wrapped']]) {
    await page.getByRole('button', { name: button, exact: true }).click(); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/wrapped-desktop.png', fullPage: true });
});

test('people can upload a photo, like, and comment on the hosted community board', async ({ page, browser }) => {
  const directory = await mkdtemp(join(tmpdir(), 'touch-grass-browser-'));
  const access = 'browser-fixture-community-member-key';
  const server = createCommunityServer({ directory, tokens: { outdoors: access, neighbor: access } });
  try {
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    const url = `http://127.0.0.1:${server.address().port}/#community`;
    await page.goto(url);
    await page.getByRole('button', { name: 'Share an action' }).click();
    await page.getByLabel('Community handle').fill('outdoors');
    await page.getByLabel('Access key').fill(access);
    await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
    await page.getByLabel('What did you do?').fill('Volunteered at a park cleanup.');
    await page.getByLabel(/^Photos/).setInputFiles(photo);
    await expect(page.getByRole('img', { name: 'Selected photo 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Publish action' }).click();
    await expect(page.getByText('Action shared.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Shared photo 1 of 1' })).toBeVisible();

    const other = await browser.newPage();
    try {
      await other.goto(url);
      await expect(other.getByText('Volunteered at a park cleanup.')).toBeVisible();
      await other.getByRole('button', { name: /^Like action/ }).click();
      await other.getByLabel('Community handle').fill('neighbor');
      await other.getByLabel('Access key').fill(access);
      await other.getByRole('button', { name: 'Sign in', exact: true }).last().click();
      await other.getByRole('button', { name: /^Like action/ }).click();
      await expect(other.getByRole('button', { name: 'Like action, 1 like' })).toHaveAttribute('aria-pressed', 'true');
      await other.getByText('0 comments', { exact: true }).click();
      await other.getByRole('textbox', { name: "Comment on @outdoors's action" }).fill('Thanks for making time for this.');
      await other.getByRole('button', { name: 'Post comment' }).click();
      await expect(other.getByText('Thanks for making time for this.')).toBeVisible();
    } finally { await other.close(); }
    await page.reload();
    await page.getByText('1 comment', { exact: true }).click();
    await expect(page.getByText('Thanks for making time for this.')).toBeVisible();
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('photo journals and completed alternatives stay private and count in the recap', async ({ page }) => {
  const outbound = [];
  page.on('request', request => { if (['PUT', 'POST'].includes(request.method())) outbound.push(request.url()); });
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Start my journal' }).click();
  await page.getByRole('button', { name: 'Log an action' }).click();
  await page.getByRole('dialog').getByLabel(/^Photos/).setInputFiles(photo);
  await expect(page.getByRole('img', { name: 'Selected photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Save action' }).click();
  await expect(page.getByRole('img', { name: 'Journal photo 1 of 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByRole('tab', { name: 'Changes to try' }).click();
  await page.getByRole('button', { name: 'Make a plan' }).click();
  await page.getByLabel('What could you do differently next time?').fill('Take old electronics to a drop-off.');
  await page.getByRole('button', { name: 'Save private plan' }).click();
  await expect(page.getByText('Take old electronics to a drop-off.')).toBeVisible();
  await expect(page.getByText('1 change tried')).toHaveCount(0);
  await page.getByRole('button', { name: 'I tried it' }).click();
  await page.getByRole('dialog').getByLabel('Action', { exact: true }).fill('Dropped off my old laptop for recycling.');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = [yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate()].map(value => String(value).padStart(2, '0')).join('-');
  await page.getByRole('dialog').getByLabel('When?').fill(date);
  await page.getByRole('button', { name: 'Save action' }).click();
  await expect(page.getByText('1 change tried')).toBeVisible();
  await page.getByRole('button', { name: 'Climate Wrapped', exact: true }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByText('Dropped off my old laptop for recycling.')).toBeVisible();
  await expect(page.getByText('1 change tried')).toBeVisible();
  expect(outbound).toEqual([]);
});

test('climate comparisons use private journal distances and published benchmarks', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T12:00:00'));
  await page.goto('http://127.0.0.1:5173');
  const comparison = page.locator('.climate-comparison');
  await expect(comparison.getByText('Fictional trips with a distance')).toBeVisible();
  await comparison.getByRole('button', { name: 'Plant-based meals' }).click();
  await expect(comparison.getByText('25.1%', { exact: true })).toBeVisible();
  await expect(comparison.getByRole('link', { name: /Nature Food/ })).toHaveAttribute('href', /PMC10365988/);

  await page.getByRole('button', { name: 'Start my journal' }).click();
  await expect(comparison).toHaveCount(0);
  for (const [kind, distance] of [['bike', '2'], ['walk', '3']]) {
    await page.getByRole('button', { name: 'Log an action' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').selectOption(kind);
    await dialog.getByLabel(/One-way distance/).fill(distance);
    await dialog.getByLabel('When?').fill('2026-11-18');
    await dialog.getByRole('button', { name: 'Save action' }).click();
  }
  await expect(comparison.getByText('50%', { exact: true })).toBeVisible();
  await expect(comparison.getByText('52%', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit climate comparison for Walked instead' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit climate comparison' });
  await edit.getByLabel(/One-way distance/).fill('1');
  await edit.getByRole('button', { name: 'Save comparison' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Start my journal' }).click();
  await page.getByRole('button', { name: 'Climate Wrapped', exact: true }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(comparison.getByText('100%', { exact: true })).toBeVisible();
  await expect(comparison.getByText('2 of 2 logged trips with a distance were under 3 miles.')).toBeVisible();
});
