import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonTopic, summarizeComparisons } from '../src/climate-facts.js';
import { blankJournal, createAction, dateKey } from '../src/domain.js';
import { editJournal } from '../src/journal-mutations.js';

test('travel compares the share under 3 miles using measured trips only', () => {
  const [travel] = summarizeComparisons([
    { kind: 'walk', tripMiles: 2.9 },
    { kind: 'bike', tripMiles: 3 },
    { kind: 'bus' },
    { kind: 'walk', tripMiles: Infinity },
    { kind: 'custom', title: 'Biked', tripMiles: 1 },
    { kind: 'bike', comparisonTopic: '', tripMiles: 1 },
  ]);
  assert.equal(travel.count, 4);
  assert.equal(travel.measured, 2);
  assert.equal(travel.short, 1);
  assert.deepEqual(travel.bars.map(([, value]) => value), [50, 52]);
  assert.equal(summarizeComparisons([{ kind: 'walk' }])[0].bars.length, 1);
});

test('an edited or imported comparison preserves explicit choices without guessing from text', () => {
  const action = createAction({ kind: 'custom', title: 'Took an old computer to a drop-off', date: dateKey() });
  assert.equal(comparisonTopic(action), '');
  const journal = { ...blankJournal(), actions: [action] };
  assert.throws(() => editJournal(journal, { type: 'editComparison', id: action.id, topic: 'travel', miles: 0 }), /distance above 0/);
  assert.throws(() => createAction({ kind: 'bike', date: dateKey(), tripMiles: -10 }), /distance above 0/);
  const changed = editJournal(journal, { type: 'editComparison', id: action.id, topic: 'electronics' });
  assert.equal(summarizeComparisons(changed.actions)[0].count, 1);
  const imported = editJournal(blankJournal(), { type: 'importActions', data: { mode: 'personal', actions: changed.actions } });
  assert.equal(comparisonTopic(imported.actions[0]), 'electronics');

  const bike = createAction({ kind: 'bike', date: dateKey(), tripMiles: 4 });
  const restored = editJournal(blankJournal(), { type: 'importActions', data: { mode: 'personal', actions: [bike] } });
  assert.equal(comparisonTopic(restored.actions[0]), 'travel');
  assert.equal(restored.actions[0].tripMiles, 4);
  const cleared = editJournal(restored, { type: 'editComparison', id: bike.id, topic: '', miles: 4 });
  assert.equal(cleared.actions[0].tripMiles, undefined);
  assert.equal(summarizeComparisons(cleared.actions).length, 0);
});
