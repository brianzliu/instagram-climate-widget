import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommunityServer } from '../server/community.mjs';
import { createServer } from '../server/index.mjs';
import { postRevision } from '../src/post-revision.js';

const token = 'fixture-token-for-a-publishing-profile';
const first = {
  id: 'sample1', revision: 'a'.repeat(64), action: 'Joined a park cleanup.',
  images: ['data:image/jpeg;base64,/9j/'], publishedDate: '2026-06-12',
  caption: 'Private source caption',
};

async function listen(server, t) {
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('community export is profile-scoped, durable, minimal and removable', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'touch-grass-community-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cloud = await listen(createCommunityServer({ directory: dir, tokens: { hiker: token } }), t);
  const local = await listen(createServer({ communityUrl: cloud, shareProfile: 'hiker', shareToken: token }), t);
  const sender = { Origin: 'moz-extension://test-addon', 'Content-Type': 'application/json' };
  const update = (url, headers, posts) => fetch(url, { method: 'PUT', headers, body: JSON.stringify({ posts }) });

  assert.equal((await update(cloud + '/community/hiker', {}, [first])).status, 403);
  assert.equal((await update(local + '/community/other', sender, [first])).status, 403);
  assert.equal((await update(local + '/community/hiker', { ...sender, Origin: 'http://localhost:5173' }, [first])).status, 403);
  const second = { ...first, id: 'sample2', action: 'Planted a native garden.' };
  const published = await Promise.all([first, second].map(post => update(local + '/community/hiker', sender, [post])));
  assert.deepEqual(published.map(response => response.status), [200, 200]);

  const reopened = await listen(createCommunityServer({ directory: dir, tokens: { hiker: token } }), t);
  assert.deepEqual((await fetch(reopened + '/community').then(r => r.json())).profiles, ['hiker']);
  const raw = await fetch(reopened + '/community/hiker').then(r => r.text());
  assert.ok(!raw.includes(first.caption) && !raw.includes(token));
  const { profile } = JSON.parse(raw);
  assert.deepEqual(profile.posts.map(post => post.id).sort(), [first.id, second.id]);
  assert.deepEqual(profile.posts[0].images, first.images);
  const summary = await fetch(cloud + '/community/hiker?view=summary').then(r => r.json());
  assert.ok(summary.profile.posts.every(post => !post.images));

  const updated = { ...first, revision: 'b'.repeat(64), action: 'Led a park cleanup.' };
  assert.equal((await update(local + '/community/hiker', sender, [updated])).status, 200);
  const edited = await fetch(cloud + '/community/hiker').then(r => r.json());
  assert.equal(edited.profile.posts[0].action, updated.action);
  assert.equal(edited.profile.posts.filter(post => post.id === first.id).length, 1);

  assert.equal((await fetch(local + '/community/hiker', { method: 'DELETE', headers: sender })).status, 200);
  assert.deepEqual(await fetch(cloud + '/community/hiker').then(r => r.json()), { profile: null });
});

test('post revisions ignore rotating signatures and change with the source caption or media', async () => {
  const original = { caption: 'I biked to work.', captionSource: 'post heading', isVideo: false, images: [{ url: 'https://a.cdninstagram.com/photo.jpg?signature=old' }] };
  const revision = await postRevision(original);
  assert.match(revision, /^[a-f0-9]{64}$/);
  assert.equal(await postRevision({ ...original, images: [{ url: 'https://b.cdninstagram.com/photo.jpg?signature=new' }] }), revision);
  assert.notEqual(await postRevision({ ...original, caption: 'I fixed my bike.' }), revision);
  assert.notEqual(await postRevision({ ...original, images: [{ url: 'https://a.cdninstagram.com/new.jpg' }] }), revision);
  assert.equal(await postRevision({ ...original, captionSource: 'missing' }), null);
});
