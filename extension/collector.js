// This self-contained function runs in an isolated world in a temporary post tab.
// It uses rendered DOM only, with no private Instagram endpoints or credentials.
export async function readPostPage({ maxPhotos = 2 } = {}) {
  // Keep this function self-contained for scripting.executeScript serialization.
  const photoLimit = Number.isInteger(maxPhotos) ? Math.max(1, Math.min(2, maxPhotos)) : 2;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const warnings = [];
  let article;
  for (let i = 0; i < 24; i++) {
    article = document.querySelector('article') || document.querySelector('main');
    if (article?.querySelector('img[src*="cdninstagram"], img[src*="fbcdn"], video')) break;
    await pause(500);
  }
  if (!article || /\/accounts\/login/.test(location.pathname)) return { caption: '', captionSource: 'missing', images: [], warnings: ['Post not accessible. It may require login or be restricted.'], isVideo: false };
  // Full post captions normally appear as h1. Meta description is an explicit fallback.
  const heading = article.querySelector('h1');
  const meta = document.querySelector('meta[property="og:description"]')?.content;
  let caption = heading?.textContent?.trim() || '';
  let captionSource = caption ? 'post heading' : 'missing';
  if (!caption && meta) { caption = meta; captionSource = 'page description, may include metadata'; }
  if (!caption) warnings.push('Caption unavailable.');
  const canonicalPath = path => path.replace(/^\/[\w.]+\/(p|reel)\//, '/$1/').replace(/\/$/, '');
  const postTime = [...article.querySelectorAll('time[datetime]')].find(time => {
    const link = time.closest('a[href]');
    if (!link || time.closest('li')) return false;
    try {
      const url = new URL(link.href, location.href);
      return !url.searchParams.has('comment_id') && !url.searchParams.has('reply_comment_id') && canonicalPath(url.pathname) === canonicalPath(location.pathname);
    } catch { return false; }
  });
  // Prefer the post permalink's timestamp over timestamps attached to comments.
  const rawDate = postTime?.getAttribute('datetime') || document.querySelector('meta[property="article:published_time"]')?.content || '';
  let publishedAt = null, publishedDate = null, dateSource = 'unknown';
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))) {
    if (rawDate.length === 10 && new Date(`${rawDate}T12:00:00Z`).toISOString().slice(0, 10) === rawDate) publishedDate = rawDate;
    else if (rawDate.includes('T')) publishedAt = new Date(rawDate).toISOString();
    if (publishedAt || publishedDate) dateSource = postTime ? 'post permalink time' : 'page publication metadata';
  }
  if (!publishedAt && !publishedDate) warnings.push('Published date unavailable. The journal will mark it unknown.');
  const images = new Map();
  let isVideo = false;
  function capture() {
    // Ignore profile avatars and comment images. Keep rendered post-sized media.
    for (const img of article.querySelectorAll('img')) {
      if (images.size >= photoLimit) break;
      const rect = img.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 140 || !img.src || img.alt?.toLowerCase().includes('profile picture')) continue;
      if (img.closest('a[href^="/p/"], a[href^="/reel/"]')) continue;
      let url; try { url = new URL(img.currentSrc || img.src); } catch { continue; }
      if (!/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)) continue;
      const key = url.pathname;
      if (!images.has(key)) images.set(key, { url: url.href, alt: (img.alt || '').slice(0, 500) });
    }
    for (const video of article.querySelectorAll('video')) {
      isVideo = true;
      if (images.size >= photoLimit) continue;
      if (video.poster) { try { const url = new URL(video.poster); if (/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)) images.set(url.pathname, { url: url.href, alt: 'Video cover only' }); } catch {} }
    }
  }
  capture();
  // Stop walking a carousel as soon as this post's photo budget is filled.
  const nextButton = () => [...article.querySelectorAll('button, [role="button"]')].find(el => {
    const label = (el.getAttribute('aria-label') || el.querySelector('svg')?.getAttribute('aria-label') || '').trim();
    return /^(Next|Next slide|Siguiente|Suivant|Weiter|Avanti|Próximo|下一步|下一张|次へ)$/i.test(label) && !el.disabled && el.getBoundingClientRect().width > 0;
  });
  let next = nextButton();
  for (let i = 0; i < 19 && next && images.size < photoLimit; i++) {
    next.click(); await pause(650);
    capture(); next = nextButton();
  }
  if (next && images.size >= photoLimit) warnings.push(`Photo limit: only the first ${photoLimit} accessible photos from this post were collected.`);
  else if (next) warnings.push('Carousel may contain inaccessible slides or an unsupported Next control.');
  const hasCarousel = article.querySelector('[aria-label*="slide"], [aria-label*="Slide"], [aria-label*="Carousel"]');
  if (hasCarousel && images.size < 2) warnings.push('Only the visible carousel cover could be read.');
  if (isVideo) warnings.push('Video cover analyzed only. Video playback and audio are not analyzed.');
  if (!images.size) warnings.push('No accessible post photos found.');
  return { caption: caption.slice(0, 10000), captionSource, publishedAt, publishedDate, dateSource, images: [...images.values()].slice(0, photoLimit), warnings, isVideo };
}

export function profileFromDocument(doc, pathname) {
  const match = /^\/([\w.]+)\/?$/.exec(pathname);
  if (!match || ['accounts', 'direct', 'explore', 'reels', 'stories', 'p', 'reel', 'about', 'legal', 'privacy', 'developer', 'web'].includes(match[1])) return null;
  const main = doc.querySelector('main');
  if (!main) return null;
  const header = main.querySelector('header') || [...main.querySelectorAll('section')].find(el => el.querySelector('h1, h2') && el.querySelector('img'));
  const photo = [...main.querySelectorAll('img')].find(img => /profile picture|foto del perfil|photo de profil|profilbild|foto do perfil|프로필|プロフィール|头像|大頭/i.test(img.alt || '')) || header?.querySelector('img');
  if (!photo) return null;
  return { username: match[1], header, photo };
}

export function gridPosts(doc) {
  const seen = new Set(); const posts = [];
  // Preserve visual grid order. Pinned posts intentionally count toward the first 10.
  for (const link of doc.querySelectorAll('main a[href]')) {
    const match = /^\/(?:[\w.]+\/)?(p|reel)\/([A-Za-z0-9_-]+)\/?/.exec(link.getAttribute('href'));
    if (!match || !link.querySelector('img') || seen.has(match[2])) continue;
    seen.add(match[2]);
    posts.push({ url: `https://www.instagram.com/${match[1]}/${match[2]}/`, preview: link.querySelector('img').currentSrc || link.querySelector('img').src });
    if (posts.length === 10) break;
  }
  return posts;
}
