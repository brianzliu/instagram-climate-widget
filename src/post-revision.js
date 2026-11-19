// Instagram CDN signatures rotate. Compare the media path without its query string.
export function mediaKey(src) {
  try { return new URL(src).pathname; }
  catch { return ''; }
}

export function gridRevision({ preview, alt, edited }) {
  return JSON.stringify([mediaKey(preview), alt, edited]);
}

export async function postRevision(post) {
  if (!post.images.length || post.captionSource !== 'post heading') return null;
  const media = post.images.map(photo => mediaKey(photo.url));
  if (media.some(path => !path)) return null;
  const input = new TextEncoder().encode(JSON.stringify([post.caption, media, post.isVideo, post.editedAt || null]));
  const bytes = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
