import { dateKey } from './domain.js';

function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(new Date(`${value}T12:00:00`)) === value;
}

export function observationDate(post) {
  if (validDay(post.publishedDate)) return post.publishedDate;
  if (typeof post.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(post.publishedAt)) return null;
  const date = new Date(post.publishedAt);
  return Number.isNaN(date.getTime()) ? null : dateKey(date);
}

function entriesForProfile(profile) {
  return (profile.posts || []).map((post, i) => {
    const match = /^https:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([\w-]+)\/?$/.exec(post.url || '');
    if (!match) return null;
    return {
      id: `instagram:${match[1]}`, username: profile.username, url: post.url,
      caption: post.caption || '', photoCount: post.photoCount || 0,
      publishedAt: typeof post.publishedAt === 'string' && !Number.isNaN(Date.parse(post.publishedAt)) ? post.publishedAt : null,
      publishedDate: validDay(post.publishedDate) ? post.publishedDate : null,
      dateSource: post.dateSource || 'unknown', analyzedAt: profile.analyzedAt,
      firstObservedAt: profile.analyzedAt, reviewStatus: 'unreviewed',
      finding: profile.analysis?.posts?.find(p => p.index === i + 1) || null,
    };
  }).filter(Boolean);
}

export function journalObservations(journal) {
  const entries = new Map((journal.observedPosts || []).map(post => [post.id, post]));
  for (const profile of journal.observations || []) {
    for (const post of entriesForProfile(profile)) if (!entries.has(post.id)) entries.set(post.id, post);
  }
  return [...entries.values()].map(post => ({ ...post, date: observationDate(post) }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.analyzedAt || '').localeCompare(a.analyzedAt || ''));
}

export function mergeProfileIntoJournal(journal, profile) {
  const existing = journalObservations(journal);
  const entries = new Map(existing.map(({ date, ...entry }) => [entry.id, entry]));
  for (const post of entriesForProfile(profile)) {
    const previous = entries.get(post.id);
    entries.set(post.id, { ...post,
      publishedAt: post.publishedAt || post.publishedDate ? post.publishedAt : previous?.publishedAt || null,
      publishedDate: post.publishedAt || post.publishedDate ? post.publishedDate : previous?.publishedDate || null,
      dateSource: post.dateSource !== 'unknown' ? post.dateSource : previous?.dateSource || 'unknown',
      firstObservedAt: previous?.firstObservedAt || post.firstObservedAt,
    });
  }
  return { ...journal, observedPosts: [...entries.values()],
    observations: [{ ...profile, savedToJournal: true }, ...(journal.observations || []).filter(p => p.username !== profile.username)] };
}
