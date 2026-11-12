import { readPostPage } from './collector.js';
import { MAX_PHOTOS_PER_POST } from '../src/analysis-limits.js';
const api = globalThis.browser || chrome;
const API_URL = 'http://127.0.0.1:8787';
const captures = new Map();
const POST_URL = /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/$/;
const isExtension = sender => sender.url?.startsWith(api.runtime.getURL(''));
const isInstagram = sender => { try { return ['www.instagram.com', 'instagram.com'].includes(new URL(sender.url).hostname); } catch { return false; } };

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
  if (message.type === 'HEALTH') return request('/health');
  if (message.type === 'OPEN_JOURNAL') return api.tabs.create({ url: api.runtime.getURL('index.html#profiles') }).then(() => ({ ok: true }));
  if (message.type === 'COLLECT_POST' && isInstagram(sender)) return collectPost(message.url, sender.tab.id, message.maxPhotos);
  if (message.type === 'FETCH_IMAGE' && isInstagram(sender)) return fetchImage(message.url);
  if (message.type === 'CANCEL_CAPTURE') { const id = captures.get(sender.tab?.id); if (id) await api.tabs.remove(id).catch(() => {}); return { ok: true }; }
  if (message.type === 'START_ANALYSIS' && isInstagram(sender)) return request('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: message.posts }) });
  if (message.type === 'ANALYSIS_STATUS' && isInstagram(sender)) {
    if (!/^[a-f0-9-]{36}$/.test(message.id)) throw new Error('Invalid analysis identifier.');
    return request(`/jobs/${message.id}`);
  }
  if (message.type === 'SAVE_PROFILE' && isInstagram(sender)) {
    const profile = message.profile;
    if (!profile || !/^[\w.]{1,30}$/.test(profile.username) || !profile.analysis?.categories) throw new Error('Invalid analysis.');
    const key = 'evergreen:personal:v1'; const result = await api.storage.local.get(key);
    const journal = result[key] || { version: 1, actions: [], observations: [], responses: [] };
    journal.observations = [profile, ...journal.observations.filter(p => p.username !== profile.username)];
    await api.storage.local.set({ [key]: journal }); return { ok: true };
  }
  throw new Error('Unknown Evergreen request.');
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse).catch(error => sendResponse({ error: error.message }));
  return true;
});
api.tabs.onRemoved.addListener(id => { const capture = captures.get(id); if (capture) { captures.delete(id); api.tabs.remove(capture).catch(() => {}); } });
