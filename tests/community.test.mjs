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

test('web uploads, likes and comments are durable and scoped to signed-in accounts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'touch-grass-board-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tokens = { author: token, neighbor: 'another-fixture-token-for-comments', guest: 'another-fixture-token-for-a-guest' };
  const cloud = await listen(createCommunityServer({ directory, tokens }), t);
  const proxy = await listen(createServer({ communityUrl: cloud }), t);
  const direct = { id: 'web-7e15690d-ba4b-4884-a2e2-acf33c6eaa10', source: 'direct', action: 'Repaired my bike.', images: first.images };
  const post = `/community/author/posts/${direct.id}`;
  const comment = { id: '7e15690d-ba4b-4884-a2e2-acf33c6eaa11', text: 'I want to try this too.' };

  function request(base, path, method, name, body) {
    return fetch(base + path, { method, headers: {
      Origin: 'http://localhost:5173',
      ...(name ? { 'X-Touch-Grass-Profile': name, Authorization: `Bearer ${tokens[name]}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  assert.equal((await request(cloud, '/community/auth/session', 'POST', 'neighbor')).status, 200);
  assert.equal((await request(cloud, '/community/author', 'PUT', 'neighbor', { posts: [direct] })).status, 403);
  assert.equal((await request(cloud, '/community/author', 'PUT', 'author', { posts: [direct] })).status, 200);
  assert.equal((await request(cloud, post + '/like', 'PUT', null, { liked: true })).status, 403);

  const like = () => request(proxy, post + '/like', 'PUT', 'neighbor', { liked: true });
  const addComment = () => request(proxy, post + '/comments', 'PUT', 'neighbor', comment);
  const responses = await Promise.all([like(), like(), addComment(), addComment()]);
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200, 200]);
  const board = await request(cloud, '/community/feed/recent', 'GET', 'neighbor').then(response => response.json());
  assert.equal(board.posts.length, 1);
  assert.equal(board.posts[0].url, undefined);
  assert.equal(board.posts[0].likeCount, 1);
  assert.equal(board.posts[0].liked, true);
  assert.deepEqual(board.posts[0].comments.map(entry => [entry.username, entry.text]), [['neighbor', comment.text]]);
  const anonymous = await request(cloud, '/community/feed/recent', 'GET').then(response => response.json());
  assert.equal(anonymous.posts[0].liked, false);
  assert.equal(anonymous.posts[0].likes, undefined);
  assert.equal((await request(cloud, post + '/comments/' + comment.id, 'DELETE', 'guest')).status, 403);
  assert.equal((await request(cloud, post + '/comments/' + comment.id, 'DELETE', 'author')).status, 200);
  assert.equal((await request(cloud, post, 'DELETE', 'neighbor')).status, 403);
  assert.equal((await request(cloud, post, 'DELETE', 'author')).status, 200);
  assert.deepEqual(await request(cloud, '/community/feed/recent', 'GET').then(response => response.json()), { posts: [], next: null });
});
