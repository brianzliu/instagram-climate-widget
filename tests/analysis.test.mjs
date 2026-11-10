import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysis } from '../src/analysis-contract.js';
import { buildRequest, createServer, validateInput, validOrigin } from '../server/index.mjs';

export function sampleAnalysis(count = 1) {
  return { summary: 'A plant-based meal appears in the sample.', categories: Object.fromEntries(['transport', 'food', 'circular'].map(c => [c, { supportive: 9, higherImpact: 9, uncertain: 9, explanation: 'Limited to visible evidence.' }])), posts: Array.from({ length: count }, (_, i) => ({ index: i + 1, observation: 'The caption describes a plant-based meal.', category: 'food', signal: 'supportive', evidence: 'Caption says vegan lunch.', confidence: 'medium' })), limitations: 'Curated posts are not a verified footprint. Some images may be missing.' };
}
const post = { caption: 'A vegan lunch.', images: ['data:image/jpeg;base64,/9j/'], captionSource: 'post heading', warnings: [] };
test('findings must cover the exact sample, and category totals are recalculated', () => {
  const a = validateAnalysis(sampleAnalysis(2), 2); assert.equal(a.categories.food.supportive, 2); assert.equal(a.categories.transport.supportive, 0);
  assert.throws(() => validateAnalysis(sampleAnalysis(2), 1));
  const duplicate = sampleAnalysis(2); duplicate.posts[1].index = 1; assert.throws(() => validateAnalysis(duplicate, 2));
  const invalid = sampleAnalysis(); invalid.posts[0].category = 'none'; assert.throws(() => validateAnalysis(invalid, 1));
});
test('only bounded inline images reach OpenRouter, with captions paired by post', () => {
  assert.equal(validateInput({ posts: [post] }).length, 1);
  assert.throws(() => validateInput({ posts: [] }));
  assert.throws(() => validateInput({ posts: [{ ...post, images: ['https://private.example/image.jpg'] }] }));
  assert.throws(() => validateInput({ posts: [{ ...post, images: [] }] }));
  const request = buildRequest([post], 'provider/model');
  assert.equal(request.model, 'provider/model'); assert.equal(request.messages[1].content[2].image_url.detail, 'low');
  assert.ok(request.messages[1].content[1].text.includes('A vegan lunch.'));
  assert.equal(request.provider.data_collection, 'deny');
});
test('local backend rejects arbitrary website origins and exposes no API key', async t => {
  const server = createServer({ apiKey: 'test-private-key', model: 'test/model', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sampleAnalysis()) } }], usage: { prompt_tokens: 100 } }), { status: 200 }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { Host: '127.0.0.1:8787', Origin: 'chrome-extension://abcdefghijklmnop', 'Content-Type': 'application/json' };
  const blocked = await fetch(`${url}/health`, { headers: { ...headers, Origin: 'https://instagram.com' } }); assert.equal(blocked.status, 403);
  const health = await fetch(`${url}/health`, { headers }); const healthText = await health.text(); assert.ok(!healthText.includes('test-private-key')); assert.equal(JSON.parse(healthText).configured, true);
  const response = await fetch(`${url}/analyze`, { method: 'POST', headers, body: JSON.stringify({ posts: [post] }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).analysis.categories.food.supportive, 1);
  assert.equal(validOrigin('http://127.0.0.1:5173'), true); assert.equal(validOrigin('https://evil.example'), false);
});
test('missing keys and upstream failures produce actionable errors', async t => {
  const server = createServer({ apiKey: '', model: 'test/model' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/analyze`, { method: 'POST', headers: { Host: '127.0.0.1:8787', Origin: 'moz-extension://test-extension', 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [post] }) });
  assert.equal(response.status, 503); assert.match((await response.json()).error, /OPENROUTER_API_KEY/);
});

test('analysis jobs return immediately, retain one paid request, and expose results through polling', async t => {
  let finish; let calls = 0;
  const server = createServer({ apiKey: 'test-key', fetchImpl: async () => { calls++; await new Promise(resolve => { finish = resolve; }); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sampleAnalysis()) } }] })); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`; const headers = { Origin: 'chrome-extension://test-extension', 'Content-Type': 'application/json' };
  const start = await fetch(`${url}/jobs`, { method: 'POST', headers, body: JSON.stringify({ posts: [post] }) });
  assert.equal(start.status, 202); const { id } = await start.json();
  const pending = await fetch(`${url}/jobs/${id}`, { headers }); assert.equal((await pending.json()).state, 'pending');
  const duplicate = await fetch(`${url}/jobs`, { method: 'POST', headers, body: JSON.stringify({ posts: [post] }) }); assert.equal(duplicate.status, 429);
  assert.equal(calls, 1); finish();
  // Yield until the mocked upstream promise settles, without a timed sleep.
  await new Promise(resolve => setImmediate(resolve));
  const done = await fetch(`${url}/jobs/${id}`, { headers }); const result = await done.json();
  assert.equal(result.state, 'done'); assert.equal(result.result.analysis.categories.food.supportive, 1);
  assert.equal(calls, 1);
});
