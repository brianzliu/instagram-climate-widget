import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { ANALYSIS_SCHEMA, SYSTEM_PROMPT, validateAnalysis } from '../src/analysis-contract.js';

const MAX_BODY = 24 * 1024 * 1024;
export function validOrigin(origin) {
  return /^((chrome|moz)-extension:\/\/[a-zA-Z0-9-]+|http:\/\/(127\.0\.0\.1|localhost):5173)$/.test(origin || '');
}
export function validateInput(body) {
  if (!body || !Array.isArray(body.posts) || body.posts.length < 1 || body.posts.length > 10) throw new Error('Send between 1 and 10 posts.');
  let images = 0;
  for (const post of body.posts) {
    if (typeof post.caption !== 'string' || post.caption.length > 10000 || !Array.isArray(post.images) || post.images.length > 20) throw new Error('Invalid caption or photo count.');
    for (const image of post.images) {
      if (typeof image !== 'string' || image.length > 200000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)) throw new Error('Images must be compressed JPEG data URLs under 150 KB.');
      images++;
    }
  }
  if (images === 0) throw new Error('No readable images were collected. Please retry on a profile with accessible photos.');
  return body.posts;
}
export function buildRequest(posts, model, maxTokens = 5000) {
  const content = [{ type: 'text', text: `Analyze these ${posts.length} posts in profile-grid order. Captions may be missing; that absence is not evidence of an action. Images are compressed. Some carousel slides or video content may be inaccessible. Output JSON matching the schema.` }];
  posts.forEach((post, i) => {
    content.push({ type: 'text', text: JSON.stringify({ index: i + 1, caption: post.caption, captionSource: post.captionSource || 'unknown', collectionWarnings: post.warnings || [], photoCount: post.images.length, isVideo: !!post.isVideo }) });
    post.images.forEach(url => content.push({ type: 'image_url', image_url: { url, detail: 'low' } }));
  });
  return { model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content }], temperature: 0.2, max_tokens: maxTokens, response_format: { type: 'json_schema', json_schema: { name: 'climate_profile', strict: true, schema: ANALYSIS_SCHEMA } }, provider: { require_parameters: true, data_collection: 'deny' } };
}
export function createServer({ apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash', fetchImpl = fetch } = {}) {
  let active = false;
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (!['127.0.0.1:8787', 'localhost:8787'].includes(req.headers.host) && process.env.NODE_ENV !== 'test') return send(403, { error: 'Use the loopback backend address.' });
    if (!validOrigin(origin) && !(!origin && req.headers['x-evergreen-client'] === 'extension' && req.headers['sec-fetch-site'] !== 'cross-site')) return send(403, { error: 'Only the Evergreen extension or local development app may use this backend.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Evergreen-Client');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && req.url === '/health') return send(200, { configured: !!apiKey, model, imageEdge: 448, postLimit: 10 });
    if (req.method !== 'POST' || req.url !== '/analyze') return send(404, { error: 'Not found.' });
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
      const maxTokens = Math.min(12000, Math.max(1000, Number(process.env.OPENROUTER_MAX_TOKENS) || 5000));
      const upstream = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Evergreen Climate Research' }, body: JSON.stringify(buildRequest(posts, model, maxTokens)), signal: AbortSignal.timeout(180000) });
      if (!upstream.ok) { const message = { 401: 'OpenRouter rejected the API key.', 402: 'Your OpenRouter account needs credits.', 429: 'OpenRouter is rate-limiting requests. Try again later.' }[upstream.status] || `OpenRouter returned ${upstream.status}. Check that ${model} accepts images, structured outputs, and your provider privacy settings.`; return send(502, { error: message }); }
      const result = await upstream.json();
      const raw = result.choices?.[0]?.message?.content;
      if (typeof raw !== 'string') return send(502, { error: 'OpenRouter returned no readable analysis. Try another model.' });
      let analysis;
      try { analysis = validateAnalysis(JSON.parse(raw), posts.length); } catch (e) { return send(502, { error: e.message.startsWith('The model') ? e.message : 'The model returned invalid JSON. Try an image-capable model with structured output support.' }); }
      send(200, { analysis, model, usage: result.usage ? { prompt_tokens: result.usage.prompt_tokens, completion_tokens: result.usage.completion_tokens, cost: result.usage.cost } : null });
    } catch (e) { if (!res.headersSent) send(502, { error: e.name === 'TimeoutError' ? 'OpenRouter timed out. Try again or choose a faster model.' : 'Could not reach OpenRouter. Check your connection and model configuration.' }); }
    finally { if (ownsSlot) active = false; }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(8787, '127.0.0.1', () => console.log('Evergreen backend listening at http://127.0.0.1:8787. API keys remain on this machine.'));
}
