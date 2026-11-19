import http from 'node:http';
import { communityProxy } from './community-proxy.mjs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SYSTEM_PROMPT, schemaForPostCount, parseModelAnalysis } from '../src/analysis-contract.js';
import { MAX_ANALYSIS_PHOTOS, MAX_PHOTOS_PER_POST, MAX_PROFILE_POSTS } from '../src/analysis-limits.js';

const MAX_BODY = 24 * 1024 * 1024;
const publicError = message => Object.assign(new Error(message), { publicMessage: message });
export function validOrigin(origin) {
  return /^((chrome|moz)-extension:\/\/[a-zA-Z0-9-]+|http:\/\/(127\.0\.0\.1|localhost):5173)$/.test(origin || '');
}
export function validateInput(body) {
  if (!body || !Array.isArray(body.posts) || body.posts.length < 1 || body.posts.length > MAX_PROFILE_POSTS) throw new Error(`Send between 1 and ${MAX_PROFILE_POSTS} posts.`);
  const photoCount = body.posts.reduce((count, post) => count + (Array.isArray(post?.images) ? post.images.length : 0), 0);
  if (photoCount > MAX_ANALYSIS_PHOTOS) throw new Error(`Analysis is limited to ${MAX_ANALYSIS_PHOTOS} photos total. Reload the updated extension before trying again.`);
  let images = 0;
  for (const post of body.posts) {
    if (!post || typeof post.caption !== 'string' || post.caption.length > 10000 || !Array.isArray(post.images)) throw new Error('Invalid caption or photo count.');
    if (post.images.length > MAX_PHOTOS_PER_POST) throw new Error(`Each post is limited to ${MAX_PHOTOS_PER_POST} photos. Reload the updated extension before trying again.`);
    for (const image of post.images) {
      if (typeof image !== 'string' || image.length > 200000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)) throw new Error('Images must be compressed JPEG data URLs under 150 KB.');
      images++;
    }
  }
  if (images === 0 && !body.posts.some(post => post.captionSource === 'post heading' && post.caption.trim())) throw new Error('No readable photos or captions were collected.');
  return body.posts;
}
export function buildRequest(posts, model, maxTokens = 5000) {
  validateInput({ posts });
  const content = [{ type: 'text', text: `Analyze these ${posts.length} posts in profile-grid order. Captions may be missing; that absence is not evidence of an action. Images are compressed. Some carousel slides or video content may be inaccessible. Output JSON matching the schema.` }];
  posts.forEach((post, i) => {
    content.push({ type: 'text', text: JSON.stringify({ index: i + 1, caption: post.caption, captionSource: post.captionSource || 'unknown', collectionWarnings: post.warnings || [], photoCount: post.images.length, isVideo: !!post.isVideo }) });
    post.images.forEach(url => content.push({ type: 'image_url', image_url: { url, detail: 'low' } }));
  });
  content.push({ type: 'text', text: `Return exactly ${posts.length} post findings. Required indices: ${posts.map((_, i) => i + 1).join(', ')}. Include notRelevant findings for unrelated posts; do not omit them.` });
  return { model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content }], temperature: 0.2, max_tokens: maxTokens, response_format: { type: 'json_schema', json_schema: { name: 'climate_profile', strict: true, schema: schemaForPostCount(posts.length) } }, provider: { require_parameters: true, data_collection: 'deny' } };
}
export function createServer({ apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash', fetchImpl = fetch,
  communityUrl = process.env.TOUCH_GRASS_COMMUNITY_URL,
  shareProfile = process.env.TOUCH_GRASS_SHARE_PROFILE,
  shareToken = process.env.TOUCH_GRASS_SHARE_TOKEN,
} = {}) {
  const community = communityProxy({ url: communityUrl, profile: shareProfile, token: shareToken, fetchImpl });
  let active = false; const jobs = new Map();
  async function runModel(posts) {
    const maxTokens = Math.min(12000, Math.max(1000, Number(process.env.OPENROUTER_MAX_TOKENS) || 5000));
    const upstream = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Touch Grass Climate Research' }, body: JSON.stringify(buildRequest(posts, model, maxTokens)), signal: AbortSignal.timeout(180000) });
    if (!upstream.ok) throw publicError({ 401: 'OpenRouter rejected the API key.', 402: 'Your OpenRouter account needs credits.', 429: 'OpenRouter is rate-limiting requests. Try again later.' }[upstream.status] || `OpenRouter returned ${upstream.status}. Check that ${model} accepts images, structured outputs, and your provider privacy settings.`);
    const result = await upstream.json(); const choice = result.choices?.[0]; const raw = choice?.message?.content;
    if (choice?.finish_reason === 'length' || choice?.native_finish_reason === 'MAX_TOKENS') throw publicError('The model hit its output-token limit before finishing. Increase OPENROUTER_MAX_TOKENS in .env or choose a model with less reasoning overhead, then restart the backend.');
    if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) throw publicError('The model declined to analyze this content. Try another profile or model.');
    if (typeof raw !== 'string') throw publicError('OpenRouter returned no readable analysis. Try another model.');
    let analysis;
    try { analysis = parseModelAnalysis(raw, posts.length); }
    catch (e) {
      // Record format metadata only. Never log images, captions, model prose, or API keys.
      console.warn('[Touch Grass] Analysis output rejected', { model, expectedPosts: posts.length, finishReason: choice?.finish_reason, completionTokens: result.usage?.completion_tokens, reason: e.message });
      throw publicError(e.message);
    }
    return { analysis, model, usage: result.usage ? { prompt_tokens: result.usage.prompt_tokens, completion_tokens: result.usage.completion_tokens, cost: result.usage.cost } : null };
  }
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (![ `127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}` ].includes(req.headers.host)) return send(403, { error: 'Use the loopback backend address.' });
    if (!validOrigin(origin) && !(!origin && req.headers['x-evergreen-client'] === 'extension' && req.headers['sec-fetch-site'] !== 'cross-site')) return send(403, { error: 'Only the Touch Grass extension or local development app may use this backend.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Evergreen-Client, Authorization, X-Touch-Grass-Profile');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && req.url === '/health') return send(200, { configured: !!apiKey, model, imageEdge: 448, postLimit: MAX_PROFILE_POSTS, photoLimit: MAX_ANALYSIS_PHOTOS, photosPerPost: MAX_PHOTOS_PER_POST, analysisFormatVersion: 3, community: community.configured, publisher: community.publisher });
    if (req.url.startsWith('/community') && await community.forward(req, res, send)) return;
    for (const [id, job] of jobs) if (Date.now() - job.createdAt > 600000) jobs.delete(id);
    if (req.method === 'GET' && /^\/jobs\/[a-f0-9-]{36}$/.test(req.url)) {
      const job = jobs.get(req.url.split('/')[2]);
      return job ? send(200, { state: job.state, result: job.result, error: job.error }) : send(404, { error: 'This analysis expired. Please run it again.' });
    }
    if (req.method !== 'POST' || !['/analyze', '/jobs'].includes(req.url)) return send(404, { error: 'Not found.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Use application/json.' });
    if (!apiKey) return send(503, { error: 'Add OPENROUTER_API_KEY to .env and restart npm run api.' });
    if (active) return send(429, { error: 'An analysis is already running. Wait for it to finish.' });
    let size = 0; const chunks = []; let ownsSlot = false;
    try {
      for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) { send(413, { error: 'Analysis exceeds the 24 MB limit. Try a profile with fewer carousel photos.' }); return; } chunks.push(chunk); }
      let posts;
      try { posts = validateInput(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { return send(400, { error: e.message }); }
      if (active) return send(429, { error: 'An analysis is already running.' });
      active = true; ownsSlot = true;
      if (req.url === '/jobs') {
        const id = randomUUID(); const job = { createdAt: Date.now(), state: 'pending' }; jobs.set(id, job); ownsSlot = false;
        // Short polling requests avoid Chromium's service-worker fetch lifetime limits.
        runModel(posts).then(result => { job.state = 'done'; job.result = result; }).catch(e => { job.state = 'error'; job.error = e.name === 'TimeoutError' ? 'OpenRouter timed out. Try a faster model.' : e.message; }).finally(() => { active = false; });
        return send(202, { id });
      }
      send(200, await runModel(posts));
    } catch (e) { if (!res.headersSent) send(502, { error: e.publicMessage || (e.name === 'TimeoutError' ? 'OpenRouter timed out. Try again or choose a faster model.' : 'Could not reach OpenRouter. Check your connection and model configuration.') }); }
    finally { if (ownsSlot) active = false; }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(8787, '127.0.0.1', () => console.log('Touch Grass backend listening at http://127.0.0.1:8787. API keys remain on this machine.'));
}
