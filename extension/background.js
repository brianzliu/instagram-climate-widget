import { communityRoute, profileName } from '../src/community-routes.js';
import { readPostPage } from './collector.js';
import { MAX_PHOTOS_PER_POST } from '../src/analysis-limits.js';
import { blankJournal, demoJournal } from '../src/domain.js';
import { editJournal } from '../src/journal-mutations.js';
import { mergeProfileIntoJournal } from '../src/journal-observations.js';
const api = globalThis.browser || chrome;
const API_URL = 'http://127.0.0.1:8787';
const captures = new Map();
const POST_URL = /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/$/;
const isExtension = sender => sender.url?.startsWith(api.runtime.getURL(''));
const isInstagram = sender => { try { return ['www.instagram.com', 'instagram.com'].includes(new URL(sender.url).hostname); } catch { return false; } };

const journalWrites = new Map();
async function updateJournal(mode, update) {
  const key = `evergreen:${mode}:v1`;
  const pending = (journalWrites.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const stored = await api.storage.local.get(key);
    const original = stored[key] || (mode === 'demo' ? demoJournal() : blankJournal());
    const journal = update(original);
    if (journal !== original) await api.storage.local.set({ [key]: journal });
    return { journal };
  });
  journalWrites.set(key, pending);
  try { return await pending; }
  finally { if (journalWrites.get(key) === pending) journalWrites.delete(key); }
}

async function request(path, options) {
  let response;
  try { response = await fetch(`${API_URL}${path}`, { ...options, headers: { ...options?.headers, 'X-Evergreen-Client': 'extension' }, signal: AbortSignal.timeout(path === '/health' ? 5000 : 190000) }); }
  catch (e) { throw new Error(e.name === 'TimeoutError' ? 'Analysis timed out. Try a faster OpenRouter model.' : 'The local backend is offline. Run npm run api in the project folder.'); }
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || `Backend returned ${response.status}.`);
  return result;
}

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const finish = (error) => { clearTimeout(timer); api.tabs.onUpdated.removeListener(onUpdated); api.tabs.onRemoved.removeListener(onRemoved); error ? reject(error) : resolve(); };
    const onUpdated = (id, change) => { if (id === tabId && change.status === 'complete') finish(); };
    const onRemoved = id => { if (id === tabId) finish(new Error('The temporary post tab was closed.')); };
    const timer = setTimeout(() => finish(new Error('Instagram took too long to load this post.')), 25000);
    api.tabs.onUpdated.addListener(onUpdated); api.tabs.onRemoved.addListener(onRemoved);
    api.tabs.get(tabId).then(tab => { if (tab.status === 'complete') finish(); }).catch(finish);
  });
}

async function collectPost(url, ownerId, requestedPhotos = MAX_PHOTOS_PER_POST) {
  if (!POST_URL.test(url)) throw new Error('Invalid Instagram post URL.');
  if (captures.has(ownerId)) throw new Error('A post is already being read.');
  const tab = await api.tabs.create({ url, active: false }); captures.set(ownerId, tab.id);
  try {
    await waitForTab(tab.id);
    const maxPhotos = Number.isInteger(requestedPhotos) ? Math.max(1, Math.min(MAX_PHOTOS_PER_POST, requestedPhotos)) : MAX_PHOTOS_PER_POST;
    const results = await api.scripting.executeScript({ target: { tabId: tab.id }, func: readPostPage, args: [{ maxPhotos }] });
    if (!results[0]?.result) throw new Error('Could not read this post.');
    return results[0].result;
  } finally { captures.delete(ownerId); await api.tabs.remove(tab.id).catch(() => {}); }
}

async function fetchImage(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(parsed.hostname)) throw new Error('Image is outside Instagram media hosts.');
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  const type = response.headers.get('content-type')?.split(';')[0];
  if (!response.ok || !['image/jpeg', 'image/webp', 'image/png', 'image/avif'].includes(type)) throw new Error('Instagram image is unavailable.');
  const limit = 5 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Source image is too large to process.');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('Source image is too large to process.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { dataUrl: `data:${type};base64,${btoa(binary)}`, originalBytes: size };
}

async function handle(message, sender) {
  if (!isInstagram(sender) && !isExtension(sender)) throw new Error('Unsupported sender.');
  if (message.type === 'COMMUNITY_REQUEST' && isExtension(sender)) {
    const { path, method, body, account } = message;
    if (typeof path !== 'string' || !path.startsWith('/community') || path.length > 512
      || !communityRoute(new URL(path, API_URL).pathname, method)) throw new Error('Invalid community request.');
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (account?.token !== undefined) {
      if (!profileName.test(account.username || '') || typeof account.token !== 'string'
        || account.token.length < 32 || account.token.length > 512) throw new Error('Invalid community credentials.');
      headers.Authorization = `Bearer ${account.token}`;
      headers['X-Touch-Grass-Profile'] = account.username;
    } else if (account) headers['X-Touch-Grass-Signed-In'] = 'true';
    return request(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  if (['COMMUNITY_PROFILE', 'SHARE_POSTS', 'UNSHARE_PROFILE'].includes(message.type)) {
    const username = String(message.username || '').toLowerCase();
    if (!/^[a-z0-9_.]{1,30}$/.test(username)) throw new Error('Invalid Instagram handle.');
    const path = `/community/${username}`;
    if (message.type === 'COMMUNITY_PROFILE') return request(path + (isInstagram(sender) ? '?view=summary' : ''));
    if (message.type === 'UNSHARE_PROFILE' && isExtension(sender)) return request(path, { method: 'DELETE' });
    if (message.type === 'SHARE_POSTS' && isInstagram(sender)
      && new URL(sender.url).pathname.replace(/\/$/, '').toLowerCase() === `/${username}`) {
      return request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: message.posts }) });
    }
  }
  if (message.type === 'HEALTH') return request('/health');
  if (message.type === 'OPEN_JOURNAL') return api.tabs.create({ url: api.runtime.getURL(message.view === 'plans' ? 'index.html#plans' : 'index.html#journal') }).then(() => ({ ok: true }));
  if (message.type === 'COLLECT_POST' && isInstagram(sender)) return collectPost(message.url, sender.tab.id, message.maxPhotos);
  if (message.type === 'FETCH_IMAGE' && isInstagram(sender)) return fetchImage(message.url);
  if (message.type === 'CANCEL_CAPTURE') { const id = captures.get(sender.tab?.id); if (id) await api.tabs.remove(id).catch(() => {}); return { ok: true }; }
  if (message.type === 'START_ANALYSIS' && isInstagram(sender)) return request('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: message.posts }) });
  if (message.type === 'ANALYSIS_STATUS' && isInstagram(sender)) {
    if (!/^[a-f0-9-]{36}$/.test(message.id)) throw new Error('Invalid analysis identifier.');
    return request(`/jobs/${message.id}`);
  }
  if (message.type === 'EDIT_JOURNAL' && isExtension(sender) && ['personal', 'demo'].includes(message.mode)) {
    if (message.mode === 'demo' && message.edit?.type === 'importActions') throw new Error('Import actions into your personal journal.');
    return updateJournal(message.mode, journal => editJournal(journal, message.edit));
  }
  if (message.type === 'VERIFY_VISIBLE_CAPTION' && isInstagram(sender)) {
    const match = /^\/(?:[\w.]+\/)?(p|reel)\/([\w-]+)\/?$/.exec(new URL(sender.url).pathname);
    if (!match || typeof message.caption !== 'string' || !message.caption.trim() || message.caption.length > 10000) return { ok: true };
    const url = `https://www.instagram.com/${match[1]}/${match[2]}/`;
    await updateJournal('personal', journal => {
      const needsRefresh = post => post.url === url && post.revision && post.gridRevision && post.caption !== message.caption;
      const observedPosts = (journal.observedPosts || []).map(post => needsRefresh(post) ? { ...post, gridRevision: null, stale: true } : post);
      const observations = journal.observations.map(profile => profile.posts?.some(needsRefresh)
        ? { ...profile, posts: profile.posts.map(post => needsRefresh(post) ? { ...post, gridRevision: null, stale: true } : post) }
        : profile);
      if (observedPosts.every((post, i) => post === journal.observedPosts[i]) && observations.every((profile, i) => profile === journal.observations[i])) return journal;
      return { ...journal, observedPosts, observations };
    });
    return { ok: true };
  }
  if (message.type === 'SAVE_PROFILE' && isInstagram(sender)) {
    const profile = message.profile;
    if (!profile || !/^[\w.]{1,30}$/.test(profile.username) || !Array.isArray(profile.analysis?.posts)) throw new Error('Invalid analysis.');
    await updateJournal('personal', journal => mergeProfileIntoJournal(journal, profile));
    return { ok: true };
  }
  throw new Error('Unknown Touch Grass request.');
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse).catch(error => sendResponse({ error: error.message }));
  return true;
});
api.tabs.onRemoved.addListener(id => { const capture = captures.get(id); if (capture) { captures.delete(id); api.tabs.remove(capture).catch(() => {}); } });
