import { communityRoute, profileName } from '../src/community-routes.js';

export function communityProxy({ url, profile, token, fetchImpl }) {
  const origin = url ? new URL(url) : null;
  if (origin && origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === '127.0.0.1')) {
    throw new Error('Use HTTPS for TOUCH_GRASS_COMMUNITY_URL.');
  }
  if (origin && (origin.username || origin.password)) throw new Error('Use a separate publishing credential.');
  const publisher = origin && token && profileName.test(profile || '') ? profile : null;

  async function forward(req, res, send) {
    const target = new URL(req.url, 'http://localhost');
    if (!communityRoute(target.pathname, req.method)) return false;
    if (!origin) {
      send(503, { error: 'Community sharing is not configured.' });
      return true;
    }

    const reading = req.method === 'GET';
    const extension = !req.headers.origin || /^(chrome|moz)-extension:\/\//.test(req.headers.origin);
    const explicit = profileName.test(req.headers['x-touch-grass-profile'] || '') && req.headers.authorization;
    const useLocalCredential = extension && publisher && (!reading || req.headers['x-touch-grass-signed-in'] === 'true');
    const request = { method: req.method, signal: AbortSignal.timeout(12000), redirect: 'error', headers: {} };
    if (explicit) {
      request.headers.Authorization = req.headers.authorization;
      request.headers['X-Touch-Grass-Profile'] = req.headers['x-touch-grass-profile'];
    } else if (useLocalCredential) {
      request.headers.Authorization = `Bearer ${token}`;
      request.headers['X-Touch-Grass-Profile'] = publisher;
    } else if (!reading) {
      send(403, { error: 'Publishing is unavailable for this profile.' });
      return true;
    }
    try {
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
