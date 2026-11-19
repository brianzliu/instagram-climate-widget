import { test, expect } from '@playwright/test';

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

test('the separate community page shows owner-reviewed photos and actions', async ({ page }) => {
  await page.route('http://127.0.0.1:8787/community', route => route.fulfill({ json: { profiles: ['outdoors'], next: null } }));
  await page.route('http://127.0.0.1:8787/community/outdoors', route => route.fulfill({
    json: { profile: { username: 'outdoors', posts: [{
      id: 'park', url: 'https://www.instagram.com/p/park/', action: 'Volunteered at a park cleanup.',
      images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII='],
    }] } },
  }));
  await page.goto('http://127.0.0.1:5173/#community');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '@outdoors' }).click();
  await expect(page.getByText('Volunteered at a park cleanup.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Shared photo 1 of 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Original post' })).toHaveAttribute('href', 'https://www.instagram.com/p/park/');
});
