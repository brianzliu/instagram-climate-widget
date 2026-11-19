import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankJournal, chartBuckets, classifyCaption, createAction, dateKey, demoJournal, inRange, monthRange, periodRange, stats } from '../src/domain.js';

test('ranges cross year and leap-day boundaries without dropping dates', () => {
  assert.deepEqual(periodRange(new Date(2024, 1, 29), 'day'), { start: '2024-02-29', end: '2024-03-01' });
  assert.deepEqual(monthRange(new Date(2024, 1, 15)), { start: '2024-02-01', end: '2024-03-01' });
  assert.deepEqual(periodRange(new Date(2026, 0, 1), 'week'), { start: '2025-12-29', end: '2026-01-05' });
  assert.equal(chartBuckets([], new Date(2024, 1, 15), 'month').length, 29);
  assert.deepEqual(inRange([{ date: '2024-02-29' }, { date: '2024-03-01' }], monthRange(new Date(2024, 1, 15))), [{ date: '2024-02-29' }]);
});
test('actions validate real dates and avoid invented emissions fields', () => {
  const a = createAction({ kind: 'bus', date: dateKey(), note: '  Campus bus  ' });
  assert.equal(a.note, 'Campus bus'); assert.equal(a.title, 'Took public transport'); assert.equal(a.emissions, undefined);
  assert.throws(() => createAction({ kind: 'bus', date: '2025-02-30' }));
  assert.throws(() => createAction({ kind: 'invalid', date: dateKey() }));
  assert.throws(() => createAction({ kind: 'bus', date: '2099-01-01' }));
});
test('sample actions are bounded by today and never seed the personal journal', () => {
  const today = new Date(2026, 0, 1); const demo = demoJournal(today);
  assert.equal(inRange(demo.actions, monthRange(today)).length, 28);
  assert.ok(demo.actions.every(a => a.date <= '2026-01-01'));
  assert.equal(blankJournal().actions.length, 0);
  const summary = stats(demo.actions);
  assert.equal(Object.values(summary.categories).reduce((a,b) => a+b), summary.total);
});
test('ambiguous or negated caption matches require context', () => {
  assert.equal(classifyCaption('I took the bus to campus')[0].kind, 'bus');
  assert.equal(classifyCaption("I didn't take the bus")[0].confidence, 'Needs context');
  assert.equal(classifyCaption('Would you try a vegan meal?')[0].confidence, 'Needs context');
  assert.deepEqual(classifyCaption('My favorite blue sky'), []);
});
