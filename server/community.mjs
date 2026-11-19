import http from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAX_PHOTOS_PER_POST, MAX_PROFILE_POSTS } from '../src/analysis-limits.js';

const PROFILE = /^[a-z0-9_.]{1,30}$/;
const POST = /^[A-Za-z0-9_-]{1,64}$/;
const REVISION = /^[a-f0-9]{64}$/;
const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const payloadLimit = 5 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest();

function sharedPost(post) {
  if (!post || !POST.test(post.id || '') || !REVISION.test(post.revision || '')
    || typeof post.action !== 'string' || !post.action.trim() || post.action.length > 600
    || !Array.isArray(post.images) || !post.images.length || post.images.length > MAX_PHOTOS_PER_POST
    || post.images.some(image => typeof image !== 'string' || image.length > 200000 || !JPEG.test(image))) {
    throw new Error('Invalid shared post.');
  }
  if (post.publishedDate != null && (typeof post.publishedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(post.publishedDate))) {
    throw new Error('Invalid publication date.');
  }
  return { id: post.id, revision: post.revision, action: post.action.trim(),
    url: `https://www.instagram.com/${post.isReel === true ? 'reel' : 'p'}/${post.id}/`,
    images: post.images, publishedDate: post.publishedDate || null };
}

async function readSubmission(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > payloadLimit) return null;
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks));
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

  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/community') {
        const after = url.searchParams.get('after') || '';
        const names = (await readdir(directory)).filter(file => file.endsWith('.json'))
          .map(file => file.slice(0, -5)).filter(name => PROFILE.test(name) && name > after).sort();
        return send(200, { profiles: names.slice(0, 48), next: names.length > 48 ? names[47] : null });
      }
      const name = /^\/community\/([a-z0-9_.]{1,30})$/.exec(url.pathname)?.[1];
      if (name) {
        const file = join(directory, `${name}.json`);
        if (req.method === 'GET') {
          const profile = await readProfile(file);
          if (url.searchParams.get('view') !== 'summary' || !profile) return send(200, { profile });
          return send(200, { profile: { ...profile, posts: profile.posts.map(({ images, ...post }) => post) } });
        }
        const secret = authorized.get(name);
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!secret || !token || !timingSafeEqual(secret, digest(token))) return send(403, { error: 'A publishing credential for this profile is required.' });
        if (req.method === 'DELETE') {
          await mutate(name, () => rm(file, { force: true }));
          return send(200, { ok: true });
        }
        if (req.method === 'PUT') {
          let posts;
          try { posts = await readSubmission(req); }
          catch { return send(400, { error: 'Invalid shared post data.' }); }
          if (!posts) return send(400, { error: 'Share between one and ten reviewed posts.' });
          await mutate(name, async () => {
            const saved = await readProfile(file);
            const merged = [...posts, ...(saved?.posts || []).filter(old => !posts.some(post => post.id === old.id))];
            // Keep storage bounded. The most recently shared 20 posts stay available.
            const profile = { username: name, sharedAt: new Date().toISOString(), posts: merged.slice(0, 20) };
            const temp = join(directory, `${randomUUID()}.tmp`);
            try {
              await writeFile(temp, JSON.stringify(profile), { mode: 0o600 });
              await rename(temp, file);
            } finally { await rm(temp, { force: true }); }
          });
          return send(200, { ok: true });
        }
        return send(405, { error: 'Method not allowed.' });
      }

      const asset = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };
      const type = types[asset.split('.').at(-1)];
      if (req.method !== 'GET' || !/^(?:assets\/)?[\w-]+\.[a-z]+$/.test(asset) || !type) return send(404, { error: 'Not found.' });
      let data;
      try { data = await readFile(join(appDirectory, asset)); }
      catch (e) { if (e.code === 'ENOENT') return send(404, { error: 'Not found.' }); throw e; }
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
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
