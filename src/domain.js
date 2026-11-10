export const CATEGORIES = {
  transport: { label: 'Getting around', short: 'Transport', color: '#426a53' },
  food: { label: 'Eating thoughtfully', short: 'Food', color: '#a5b381' },
  circular: { label: 'Making things last', short: 'Reuse & repair', color: '#d5b879' },
};
export const ACTIONS = [
  { id: 'bus', category: 'transport', label: 'Took public transport', caption: 'A bus or train journey', word: 'transit trips' },
  { id: 'bike', category: 'transport', label: 'Rode my bike', caption: 'A journey on two wheels', word: 'bike rides' },
  { id: 'walk', category: 'transport', label: 'Walked instead', caption: 'A journey on foot', word: 'walks' },
  { id: 'plant', category: 'food', label: 'Chose a plant-based meal', caption: 'A meal centered on plants', word: 'plant-based meals' },
  { id: 'leftovers', category: 'food', label: 'Used up leftovers', caption: 'Made good use of food I had', word: 'leftover meals' },
  { id: 'reuse', category: 'circular', label: 'Chose to reuse', caption: 'Used something I already own', word: 'reuse moments' },
  { id: 'repair', category: 'circular', label: 'Repaired something', caption: 'Gave an item more life', word: 'repairs' },
  { id: 'thrift', category: 'circular', label: 'Bought secondhand', caption: 'Found something pre-loved', word: 'secondhand finds' },
];
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function monthRange(anchor, offset = 0) {
  const date = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
  return { start: dateKey(date), end: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 1)) };
}
export function periodRange(anchor, period = 'month') {
  if (period === 'year') return { start: `${anchor.getFullYear()}-01-01`, end: `${anchor.getFullYear() + 1}-01-01` };
  if (period === 'week') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return { start: dateKey(start), end: dateKey(end) };
  }
  return monthRange(anchor);
}
export function inRange(actions, range) { return actions.filter(a => a.date >= range.start && a.date < range.end); }
export function stats(actions) {
  return { total: actions.length, days: new Set(actions.map(a => a.date)).size,
    categories: Object.fromEntries(Object.keys(CATEGORIES).map(c => [c, actions.filter(a => a.category === c).length])),
    kinds: Object.fromEntries(ACTIONS.map(k => [k.id, actions.filter(a => a.kind === k.id).length])) };
}
export function chartBuckets(actions, anchor, period) {
  const range = periodRange(anchor, period);
  if (period === 'year') return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(anchor.getFullYear(), i, 1);
    return { label: d.toLocaleDateString('en-US', { month: 'short' }), ...stats(inRange(actions, monthRange(d))) };
  });
  const start = new Date(`${range.start}T12:00:00`);
  const count = period === 'week' ? 7 : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return { label: period === 'week' ? d.toLocaleDateString('en-US', { weekday: 'short' }) : String(i + 1), ...stats(actions.filter(a => a.date === dateKey(d))) };
  });
}
export function createAction({ kind, date, note = '', source = 'manual' }) {
  const action = ACTIONS.find(a => a.id === kind);
  if (!action || !/^\d{4}-\d{2}-\d{2}$/.test(date) || dateKey(new Date(`${date}T12:00:00`)) !== date || date > dateKey()) throw new Error('Choose an action and a valid date up to today.');
  return { id: crypto.randomUUID(), kind, category: action.category, title: action.label, date, note: note.trim().slice(0, 600), source };
}
export function blankJournal() { return { version: 1, actions: [], observations: [], responses: [] }; }
export function demoJournal(now = new Date()) {
  const actions = [];
  const kinds = ['bus', 'plant', 'bus', 'reuse', 'walk', 'plant', 'bike', 'leftovers', 'bus', 'thrift', 'plant', 'repair'];
  for (const [offset, count] of [[-2, 9], [-1, 14], [0, 28]]) {
    const maxDay = offset === 0 ? now.getDate() : 28;
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1 + Math.floor(i * maxDay / count));
      const kind = kinds[(i + (offset + 2) * 3) % kinds.length];
      const action = ACTIONS.find(a => a.id === kind);
      actions.push({ id: `demo-${offset}-${i}`, kind, title: action.label, category: action.category, date: dateKey(d), source: i % 4 === 0 ? 'instagram' : 'manual', note: ['The campus bus made this an easy choice.', 'A small habit I want to keep.', '', 'Made time to try something different.'][i % 4] });
    }
  }
  return { ...blankJournal(), actions };
}
export function classifyCaption(caption) {
  const text = caption.toLowerCase();
  const rules = [
    ['bus', /\b(took|taking|take|caught|catch|rode|ride|riding|on)\s+(the |a |my )?(bus|train|tram|trolley|metro|subway)\b|\bpublic (transport|transit)\b/],
    ['bike', /\b(biked|biking|cycled|cycling|rode my bike|bike commute)\b/],
    ['walk', /\b(walked|walking) (to|instead|home|rather)\b/],
    ['plant', /\b(vegan|plant[ -]based|meatless|vegetarian) (meal|lunch|dinner|breakfast|food|bowl|burger|tacos?)\b/],
    ['leftovers', /\b(ate|eating|used|using|finished|finishing) (up )?(the |my |our )?leftovers\b/],
    ['reuse', /\b(reusable (cup|bottle|bag)|brought my (cup|bottle|bag)|reused)\b/],
    ['repair', /\b(repaired|mended|fixed my|fixed the)\b/],
    ['thrift', /\b(thrifted|secondhand|second-hand|pre-loved)\b/],
  ];
  const uncertain = /\b(not|never|didn't|didn’t|haven't|haven’t|wish|maybe|could|would|want to|going to|plan to)\b/.test(text) || text.includes('?');
  const matches = rules.filter(([, rule]) => rule.test(text));
  return matches.map(([kind]) => ({ kind, category: ACTIONS.find(a => a.id === kind).category, label: ACTIONS.find(a => a.id === kind).label, confidence: uncertain ? 'Needs context' : 'Caption match', reason: uncertain ? 'This may describe a plan, a question, or a negated action. Confirm what happened.' : 'A phrase in the caption matches a local rule. The image and real-world action have not been verified.' }));
}
