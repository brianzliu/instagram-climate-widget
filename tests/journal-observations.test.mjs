import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankJournal, dateKey } from '../src/domain.js';
import { journalObservations, mergeProfileIntoJournal, observationDate } from '../src/journal-observations.js';

function profile(ids, analyzedAt = '2026-11-12T19:00:00Z') {
  return { id: analyzedAt, username: 'example', analyzedAt, posts: ids.map(id => ({ url: `https://www.instagram.com/p/${id}/`, caption: `Caption ${id}`, publishedAt: '2024-02-29T18:00:00Z', dateSource: 'post permalink time', photoCount: 2 })), analysis: { posts: ids.map((_, i) => ({ index: i + 1, category: 'transport', signal: 'supportive', observation: 'Caption describes a bus trip.', confidence: 'medium', evidence: 'Self-reported in caption.' })) } };
}

test('publication dates are independent of analysis time and respect local calendar boundaries', () => {
  const local = new Date(2026, 0, 31, 23, 30);
  assert.equal(observationDate({ publishedAt: local.toISOString() }), '2026-01-31');
  assert.equal(observationDate({ publishedDate: '2024-02-29' }), '2024-02-29');
  assert.equal(observationDate({ publishedDate: '2025-02-30', analyzedAt: new Date().toISOString() }), null);
  assert.equal(observationDate({ analyzedAt: new Date().toISOString() }), null);
});

test('journal logging deduplicates posts, retains history, and leaves personal action counts unchanged', () => {
  const base = { ...blankJournal(), actions: [{ id: 'mine', date: dateKey() }] };
  const first = mergeProfileIntoJournal(base, profile(['first', 'second']));
  const secondProfile = profile(['second', 'third'], '2026-11-13T19:00:00Z');
  secondProfile.posts[0].publishedAt = null;
  const next = mergeProfileIntoJournal(first, secondProfile);
  assert.equal(next.observedPosts.length, 3); assert.equal(next.observations.length, 1);
  assert.deepEqual(next.actions, base.actions); assert.equal(base.observedPosts.length, 0);
  const repeated = next.observedPosts.find(p => p.id === 'instagram:second');
  assert.equal(repeated.publishedAt, '2024-02-29T18:00:00Z');
  assert.equal(repeated.firstObservedAt, '2026-11-12T19:00:00Z');
  assert.equal(repeated.analyzedAt, '2026-11-13T19:00:00Z');
  assert.equal(repeated.reviewStatus, 'unreviewed'); assert.equal(repeated.images, undefined);
  assert.equal(next.observations[0].savedToJournal, true);
});

test('existing saved profiles migrate into dated observations without inventing missing dates', () => {
  const old = profile(['old', 'undated']); delete old.posts[1].publishedAt;
  const entries = journalObservations({ observations: [old] });
  assert.equal(entries.length, 2); assert.ok(entries[0].date); assert.equal(entries[1].date, null);
  assert.equal(entries[1].caption, 'Caption undated');
  const corrected = profile(['old']); corrected.posts[0].publishedAt = null; corrected.posts[0].publishedDate = '2025-04-02';
  const next = mergeProfileIntoJournal({ observations: [old] }, corrected);
  assert.equal(journalObservations(next).find(p => p.id === 'instagram:old').date, '2025-04-02');
});
