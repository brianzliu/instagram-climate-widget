export const profilePattern = '[a-z0-9_.]{1,30}';
export const postPattern = '[A-Za-z0-9_-]{1,64}';
export const profileName = new RegExp(`^${profilePattern}$`);
export const communityProfilePath = new RegExp(`^/community/(${profilePattern})$`);
export const communityPostPath = new RegExp(`^/community/(${profilePattern})/posts/(${postPattern})(?:/(like|comments)(?:/(${postPattern}))?)?$`);

export function communityRoute(path, method) {
  if (path === '/community' || path === '/community/feed/recent') return method === 'GET';
  if (path === '/community/auth/session') return method === 'POST';
  if (communityProfilePath.test(path)) return ['GET', 'PUT', 'DELETE'].includes(method);
  const post = communityPostPath.exec(path);
  if (!post) return false;
  const [, , , action, commentId] = post;
  if (!action) return method === 'DELETE';
  if (action === 'like') return !commentId && method === 'PUT';
  return commentId ? method === 'DELETE' : method === 'PUT';
}
