import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPostPage } from '../../extension/collector.js';
import { compressImage } from '../../extension/compress.js';
const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=';
function analysis() { return { summary: 'The sample includes a caption describing a plant-based lunch.', categories: Object.fromEntries(['transport','food','circular'].map(c => [c,{ supportive:c==='food'?10:0,higherImpact:0,uncertain:0,explanation:'Based on supplied posts.' }])), posts:Array.from({length:10},(_,i)=>({index:i+1,observation:'A plant-based meal is described.',category:'food',signal:'supportive',evidence:'Caption says vegan lunch.',confidence:'medium'})),limitations:'Curated posts are not a verified footprint.' }; }
const profileHTML = `<html><head><title>Fictional Instagram profile</title></head><body style="margin:0;font-family:Arial;background:#fff"><aside style="position:fixed;top:0;left:0;width:200px;height:100vh;border-right:1px solid #ddd;padding:25px;font-size:25px">Instagram</aside><main style="margin-left:240px;max-width:850px;padding:40px"><header style="display:flex;gap:50px;min-height:210px"><img alt="sample profile picture" src="${IMAGE}" style="width:145px;height:145px;border-radius:50%;background:#e2e4db"/><div><h2>sample</h2><p>10 posts　 280 followers　 312 following</p><b>A fictional profile for testing</b></div></header><section style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">${Array.from({length:10},(_,i)=>`<a href="/p/post${i}/"><img alt="Vegan lunch" src="${IMAGE}" style="width:100%;height:200px;background:${i%2?'#d6ddc3':'#d9ccb3'}"/></a>`).join('')}</section></main></body></html>`;

test('profile widget collects exactly 10 posts, compresses images, and renders evidence', async ({ page }) => {
  await page.route('https://www.instagram.com/**', route => route.fulfill({ contentType:'text/html',body:profileHTML }));
  await page.goto('https://www.instagram.com/sample/');
  await page.evaluate(({image, answer}) => {
    window.requests=[];window.saved=[];
    window.chrome={runtime:{sendMessage:async data=>{window.requests.push(data.type);
      if(data.type==='HEALTH') return {configured:true,model:'test/vision'};
      if(data.type==='COLLECT_POST') return {caption:'A vegan lunch.',captionSource:'post heading',images:[{url:'https://media.cdninstagram.com/photo.jpg'}],warnings:[],isVideo:false};
      if(data.type==='FETCH_IMAGE') return {dataUrl:image,originalBytes:100000};
      if(data.type==='START_ANALYSIS'){window.sentPosts=data.posts;return {id:'11111111-1111-4111-8111-111111111111'};}
      if(data.type==='ANALYSIS_STATUS') return {state:'done',result:{analysis:answer,model:'test/vision'}};
      if(data.type==='SAVE_PROFILE'){window.saved.push(data.profile);return {ok:true};}
      return {ok:true};}},storage:{local:{get:async()=>({})}}};
  }, {image:IMAGE,answer:analysis()});
  await page.addScriptTag({content:await readFile('dist/chromium/content.js','utf8')});
  const widget=page.locator('evergreen-profile-widget');
  await expect(widget.getByRole('button',{name:'Analyze first 10 posts'})).toBeVisible();
  await widget.getByRole('button',{name:'Analyze first 10 posts'}).click();
  await expect(widget.getByText('10/10 posts read', {exact:false})).toBeVisible();
  expect(await page.evaluate(()=>requests.filter(r=>r==='COLLECT_POST').length)).toBe(10);
  expect(await page.evaluate(()=>sentPosts.every(p=>p.caption==='A vegan lunch.'&&p.images[0].startsWith('data:image/jpeg;base64,')))).toBe(true);
  await widget.getByRole('button',{name:'View evidence & collection notes'}).click();
  await expect(widget.getByText('Caption:',{exact:false}).first()).toBeVisible();
  await widget.getByRole('button',{name:'Save to my private journal'}).click();
  await expect(widget.getByRole('button',{name:'Saved to your private journal'})).toBeVisible();
  expect(await page.evaluate(()=>saved[0].posts.every(p=>!p.images))).toBe(true);
  await page.screenshot({path:'test-results/profile-widget.png',fullPage:true});
  await page.evaluate(()=>{history.pushState({},'', '/anotherprofile/'); document.querySelector('header h2').textContent='anotherprofile';});
  await expect(widget.getByText("@anotherprofile's first 10 grid posts",{exact:false})).toBeVisible();
  await page.evaluate(()=>{history.pushState({},'', '/explore/');document.querySelector('header h2').textContent='Explore';});
  await expect(widget).toHaveCount(0);
});

test('collector reads full caption and advances a carousel without reading comments', async ({ page }) => {
  const html=`<main><article><img alt="author profile picture" src="https://media.cdninstagram.com/avatar.jpg" style="width:40px;height:40px"/><h1>I took the bus, then made a vegan lunch.</h1><img id="photo" src="https://media.cdninstagram.com/one.jpg" style="width:500px;height:500px"/><button id="next" aria-label="Next">Next</button><p>Comment: I went on a flight!</p></article></main><script>document.getElementById('next').onclick=()=>{document.getElementById('photo').src='https://media.cdninstagram.com/two.jpg';document.getElementById('next').remove();}</script>`;
  await page.route('https://www.instagram.com/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.route('https://media.cdninstagram.com/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from(IMAGE.split(',')[1],'base64')}));
  await page.goto('https://www.instagram.com/p/test/');
  const result=await page.evaluate(readPostPage);
  expect(result.caption).toBe('I took the bus, then made a vegan lunch.');expect(result.images).toHaveLength(2);expect(result.images.every(i=>!i.url.includes('avatar'))).toBe(true);
});

test('unconfigured OpenRouter shows a setup error without collecting posts', async ({ page }) => {
  await page.route('https://www.instagram.com/**',r=>r.fulfill({contentType:'text/html',body:profileHTML}));await page.goto('https://www.instagram.com/sample/');
  await page.evaluate(()=>{window.requests=[];window.chrome={runtime:{sendMessage:async data=>{requests.push(data.type);return {configured:false};}},storage:{local:{get:async()=>({})}}};});
  await page.addScriptTag({content:await readFile('dist/chromium/content.js','utf8')});const widget=page.locator('evergreen-profile-widget');
  await widget.getByRole('button',{name:'Analyze first 10 posts'}).click();await expect(widget.getByRole('alert')).toContainText('OPENROUTER_API_KEY');
  expect(await page.evaluate(()=>requests.includes('COLLECT_POST'))).toBe(false);
});

test('photo compression preserves aspect ratio and bounds pixel dimensions', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  const original = await page.evaluate(() => { const c=document.createElement('canvas');c.width=1600;c.height=900;const ctx=c.getContext('2d');ctx.fillStyle='#aacb77';ctx.fillRect(0,0,1600,900);return c.toDataURL('image/png'); });
  const compressed = await page.evaluate(compressImage, original);
  expect(compressed.startsWith('data:image/jpeg;base64,')).toBe(true);
  const size = await page.evaluate(async src => { const i=new Image();i.src=src;await i.decode();return [i.naturalWidth,i.naturalHeight]; }, compressed);
  expect(size).toEqual([448,252]);
});
