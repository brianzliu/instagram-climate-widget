import http from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { photoLimit, isCompressedPhoto } from '../src/action-photos.js';
import { MAX_PROFILE_POSTS } from '../src/analysis-limits.js';

import { communityProfilePath, communityPostPath, communityRoute, profileName as PROFILE } from '../src/community-routes.js';

const DIRECT = /^web-[0-9a-f-]{36}$/;
const COMMENT_ID = /^[0-9a-f-]{36}$/;
const PAGE_SIZE = 12;
const POST = /^[A-Za-z0-9_-]{1,64}$/;
const REVISION = /^[a-f0-9]{64}$/;
const payloadLimit = 5 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest();

function sharedPost(post) {
  const direct = post?.source === 'direct';
  if (!post || !POST.test(post.id || '')
    || (direct ? !DIRECT.test(post.id) : DIRECT.test(post.id) || !REVISION.test(post.revision || ''))
    || typeof post.action !== 'string' || !post.action.trim() || post.action.length > 600
    || !Array.isArray(post.images) || (!direct && !post.images.length) || post.images.length > photoLimit
    || post.images.some(image => !isCompressedPhoto(image))) {
    throw new Error('Invalid shared post.');
  }
  if (post.publishedDate != null && (typeof post.publishedDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(post.publishedDate)
    || new Date(post.publishedDate + 'T12:00:00Z').toISOString().slice(0, 10) !== post.publishedDate)) {
    throw new Error('Invalid publication date.');
  }
  return {
    id: post.id, action: post.action.trim(), images: post.images, publishedDate: post.publishedDate || null,
    ...(direct ? { source: 'direct' } : { revision: post.revision, url: `https://www.instagram.com/${post.isReel === true ? 'reel' : 'p'}/${post.id}/` }),
  };
}

async function readJson(req, limit) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

async function readSubmission(req) {
  const body = await readJson(req, payloadLimit);
  if (!Array.isArray(body?.posts) || !body.posts.length || body.posts.length > MAX_PROFILE_POSTS) return null;
  const posts = body.posts.map(sharedPost);
  if (new Set(posts.map(post => post.id)).size !== posts.length) return null;
  return posts;
}

async function readProfile(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

export function createCommunityServer({ directory, tokens = {}, appDirectory = 'dist/app' }) {
  // One deployable process per volume. Serialize writes to each profile file.
  const pending = new Map();
  const authorized = new Map(Object.entries(tokens).map(([name, token]) => {
    if (!PROFILE.test(name) || typeof token !== 'string' || token.length < 32) throw new Error('Invalid profile publishing credential.');
    return [name, digest(token)];
  }));

  async function mutate(name, run) {
    const task = (pending.get(name) || Promise.resolve()).catch(() => {}).then(run);
    pending.set(name, task);
    try { await task; }
    finally { if (pending.get(name) === task) pending.delete(name); }
  }

  function identity(req, fallback) {
    const username = req.headers['x-touch-grass-profile'] || fallback;
    const secret = authorized.get(username);
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    return secret && token && timingSafeEqual(secret, digest(token)) ? username : null;
  }

  const fileFor = name => join(directory, `${name}.json`);
  const namesOnDisk = async () => (await readdir(directory)).filter(file => file.endsWith('.json'))
    .map(file => file.slice(0, -5)).filter(name => PROFILE.test(name)).sort();

  async function persist(name, profile) {
    if (!profile.posts.length) return rm(fileFor(name), { force: true });
    const temp = join(directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(profile), { mode: 0o600 });
      await rename(temp, fileFor(name));
    } finally { await rm(temp, { force: true }); }
  }

  function publicPost({ likes = [], comments = [], images, ...post }, profile, viewer, summary = false) {
    const sharedAt = post.sharedAt || profile.sharedAt;
    if (summary) {
      const { id, revision, action, url } = post;
      return { id, revision, action, url, sharedAt };
    }
    return { ...post, username: profile.username, sharedAt, images, likeCount: likes.length,
      liked: likes.includes(viewer), comments };
  }

  async function readFeed(before, viewer) {
    const latest = [];
    for (const name of await namesOnDisk()) {
      const profile = await readProfile(fileFor(name));
      for (const post of profile?.posts || []) {
        const key = `${post.sharedAt || profile.sharedAt}|${name}|${post.id}`;
        if (before && key >= before) continue;
        latest.push({ key, post: publicPost(post, profile, viewer) });
      }
      latest.sort((a, b) => a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
      latest.length = Math.min(latest.length, PAGE_SIZE + 1);
    }
    const page = latest.slice(0, PAGE_SIZE);
    return { posts: page.map(item => item.post), next: latest.length > PAGE_SIZE ? page.at(-1).key : null };
  }

  async function updatePost(req, send, [, name, postId, action, commentId], viewer) {
    let input;
    if (req.method === 'PUT') {
      try { input = await readJson(req, 4096); }
      catch { return send(400, { error: 'Invalid interaction.' }); }
      if (action === 'like' && typeof input?.liked !== 'boolean') return send(400, { error: 'Set a valid like state.' });
      if (action === 'comments' && (!COMMENT_ID.test(input?.id || '') || typeof input.text !== 'string'
        || !input.text.trim() || input.text.length > 500)) return send(400, { error: 'Write a comment of 1 to 500 characters.' });
    }
    return mutate(name, async () => {
      const profile = await readProfile(fileFor(name));
      const post = profile?.posts.find(item => item.id === postId);
      if (!post) return send(404, { error: 'This action is no longer shared.' });
      if (!action) {
        if (viewer !== name) return send(403, { error: 'Only the author can remove this action.' });
        profile.posts = profile.posts.filter(item => item !== post);
        await persist(name, profile);
        return send(200, { ok: true });
      }
      if (action === 'like') {
        post.likes = (post.likes || []).filter(username => username !== viewer);
        if (input.liked) post.likes.push(viewer);
      } else {
        post.comments ||= [];
        if (commentId) {
          const comment = post.comments.find(item => item.id === commentId);
          if (comment && comment.username !== viewer && viewer !== name) {
            return send(403, { error: 'Only the commenter or author of this action can remove the comment.' });
          }
          post.comments = post.comments.filter(item => item.id !== commentId);
        } else {
          const repeated = post.comments.find(item => item.id === input.id);
          if (repeated && repeated.username !== viewer) return send(409, { error: 'This comment could not be saved. Try again.' });
          if (!repeated) {
            if (post.comments.length >= 100) return send(409, { error: 'This action has reached its comment limit.' });
            post.comments.push({ id: input.id, username: viewer, text: input.text.trim(), createdAt: new Date().toISOString() });
          }
        }
      }
      await persist(name, profile);
      const { comments, likeCount, liked } = publicPost(post, profile, viewer);
      return send(200, { comments, likeCount, liked });
    });
  }

  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;
      if (communityRoute(pathname, req.method)) {
        const viewer = identity(req);
        if (pathname === '/community/auth/session') {
          return viewer ? send(200, { username: viewer }) : send(403, { error: 'Check your community handle and access key.' });
        }
        if (pathname === '/community/feed/recent') return send(200, await readFeed(url.searchParams.get('before'), viewer));
        if (pathname === '/community') {
          const after = url.searchParams.get('after') || '';
          const names = (await namesOnDisk()).filter(name => name > after);
          return send(200, { profiles: names.slice(0, 48), next: names.length > 48 ? names[47] : null });
        }
        const target = communityPostPath.exec(pathname);
        if (target) return viewer ? await updatePost(req, send, target, viewer) : send(403, { error: 'Sign in to interact with this action.' });

        const [, name] = communityProfilePath.exec(pathname);
        if (req.method === 'GET') {
          const profile = await readProfile(fileFor(name));
          const summary = url.searchParams.get('view') === 'summary';
          return send(200, { profile: profile ? { ...profile, posts: profile.posts.filter(post => !summary || post.url).map(post => publicPost(post, profile, viewer, summary)) } : null });
        }
        if (identity(req, name) !== name) return send(403, { error: 'A publishing credential for this profile is required.' });
        if (req.method === 'DELETE') {
          await mutate(name, () => rm(fileFor(name), { force: true }));
          return send(200, { ok: true });
        }
        let posts;
        try { posts = await readSubmission(req); }
        catch { return send(400, { error: 'Invalid shared post data.' }); }
        if (!posts) return send(400, { error: 'Share between one and ten reviewed posts.' });
        await mutate(name, async () => {
          const saved = await readProfile(fileFor(name));
          const sharedAt = new Date().toISOString();
          const incoming = posts.map(post => {
            const previous = saved?.posts.find(item => item.id === post.id);
            return { ...post, sharedAt: previous?.sharedAt || (previous && saved.sharedAt) || sharedAt,
              likes: previous?.likes || [], comments: previous?.comments || [] };
          });
          const merged = [...incoming, ...(saved?.posts || []).filter(old => !posts.some(post => post.id === old.id))
            .map(post => ({ ...post, sharedAt: post.sharedAt || saved.sharedAt }))];
          await persist(name, { username: name, sharedAt, posts: merged.slice(0, 20) });
        });
        return send(200, { ok: true });
      }

      const asset = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };
      const type = types[asset.split('.').at(-1)];
      if (req.method !== 'GET' || !/^(?:assets\/)?[\w-]+\.[a-z]+$/.test(asset) || !type) return send(404, { error: 'Not found.' });
      let data;
      try { data = await readFile(join(appDirectory, asset)); }
      catch (e) { if (e.code === 'ENOENT') return send(404, { error: 'Not found.' }); throw e; }
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(data);
    } catch {
      if (!res.headersSent) send(500, { error: 'Community storage is unavailable.' });
      else res.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.env.TOUCH_GRASS_DATA_DIR;
  if (!directory) throw new Error('Set TOUCH_GRASS_DATA_DIR to the mounted storage path.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  createCommunityServer({ directory, tokens: JSON.parse(process.env.TOUCH_GRASS_PUBLISHERS || '{}') })
    .listen(Number(process.env.PORT) || 8080, process.env.TOUCH_GRASS_BIND || '127.0.0.1', () => console.log('Touch Grass community server ready.'));
}
