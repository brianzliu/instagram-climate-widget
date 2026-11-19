export function communityProxy({ url, profile, token, fetchImpl }) {
  const origin = url ? new URL(url) : null;
  if (origin && origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === '127.0.0.1')) {
    throw new Error('Use HTTPS for TOUCH_GRASS_COMMUNITY_URL.');
  }
  if (origin && (origin.username || origin.password)) throw new Error('Use a separate publishing credential.');
  const publisher = origin && token && /^[a-z0-9_.]{1,30}$/.test(profile || '') ? profile : null;

  async function forward(req, res, send) {
    const target = new URL(req.url, 'http://localhost');
    const match = /^\/community(?:\/([a-z0-9_.]{1,30}))?$/.exec(target.pathname);
    if (!match) return false;
    const reading = req.method === 'GET';
    if (!origin) {
      send(503, { error: 'Community sharing is not configured.' });
      return true;
    }
    const extension = !req.headers.origin || /^(chrome|moz)-extension:\/\//.test(req.headers.origin);
    if (!reading && (!extension || !publisher || match[1] !== publisher || !['PUT', 'DELETE'].includes(req.method))) {
      send(403, { error: 'Publishing is unavailable for this profile.' });
      return true;
    }
    try {
      const request = { method: req.method, signal: AbortSignal.timeout(12000), redirect: 'error' };
      if (!reading) request.headers = { Authorization: `Bearer ${token}` };
      if (req.method === 'PUT') {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 5 * 1024 * 1024) {
            send(413, { error: 'Shared photos exceed the upload limit.' });
            return true;
          }
          chunks.push(chunk);
        }
        request.headers['Content-Type'] = 'application/json';
        request.body = Buffer.concat(chunks);
      }
      const remote = await fetchImpl(new URL(target.pathname + target.search, origin), request);
      send(remote.status, await remote.json());
    } catch {
      if (!res.headersSent) send(502, { error: 'The community server could not be reached.' });
    }
    return true;
  }
  return { configured: !!origin, publisher, forward };
}
