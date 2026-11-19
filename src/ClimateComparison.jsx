import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { climateFacts, comparisonTopic, MAX_TRIP_MILES, summarizeComparisons } from './climate-facts.js';

const formatPercent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const format = value => `${formatPercent.format(value)}%`;

export function ComparisonFields({ topic, setTopic, miles, setMiles }) {
  return <>
    {setTopic && <label>Climate fact to compare (optional)
      <select value={topic} onChange={event => setTopic(event.target.value)}>
        <option value="">No comparison</option>
        {climateFacts.map(fact => <option key={fact.id} value={fact.id}>{fact.label}</option>)}
      </select>
    </label>}
    {topic === 'travel' && <label>One-way distance in miles (optional)
      <input type="number" step="any" min="0" max={MAX_TRIP_MILES} inputMode="decimal"
        placeholder="e.g. 2.5" value={miles} onChange={event => setMiles(event.target.value)} />
    </label>}
  </>;
}

export function EditComparison({ action, onSave }) {
  const [topic, setTopic] = useState(() => comparisonTopic(action));
  const [miles, setMiles] = useState(action.tripMiles ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <form onSubmit={async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try { await onSave(topic, miles === '' ? null : Number(miles)); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }}>
    <p>{action.title}</p>
    <ComparisonFields topic={topic} setTopic={setTopic} miles={miles} setMiles={setMiles} />
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button primary" disabled={saving}>Save comparison</button>
  </form>;
}

export function ClimateComparison({ actions, demo = false }) {
  const [selected, setSelected] = useState(null);
  const comparisons = summarizeComparisons(actions);
  if (!actions.length) return null;
  if (!comparisons.length) return <section className="section climate-comparison">
    <h2>Your actions in context</h2>
    <p className="fact-note">Use “Edit climate comparison” on a journal entry to choose a sourced fact.</p>
  </section>;
  const fact = comparisons.find(item => item.id === selected) || comparisons[0];
  const ownLabel = demo ? 'Fictional journal' : 'Your journal';
  return <section className="section climate-comparison">
    <div className="section-heading"><h2>Your actions in context</h2></div>
    {comparisons.length > 1 && <div className="fact-options" role="group" aria-label="Climate comparisons">
      {comparisons.map(item => <button key={item.id} type="button" aria-pressed={item.id === fact.id}
        className="button secondary" onClick={() => setSelected(item.id)}>{item.label}</button>)}
    </div>}
    <p className="fact-count" aria-live="polite"><strong>{fact.count}</strong> {fact.action[fact.count === 1 ? 0 : 1]} logged this period · {ownLabel}</p>
    <h3>{fact.title}</h3>
    <ul className="fact-bars" aria-label={fact.title}>{fact.bars.map(([label, value], index) => {
      const personal = fact.id === 'travel' && fact.measured > 0 && index === 0;
      return <li key={label}>
        <div><span>{personal && demo ? 'Fictional trips with a distance' : label}</span><strong>{format(value)}</strong></div>
        <div className="fact-track" aria-hidden="true"><span className={personal ? 'personal-bar' : ''} style={{ width: `${value}%` }} /></div>
      </li>;
    })}</ul>
    {fact.id === 'travel' && (fact.measured
      ? <p className="fact-note">{fact.short} of {fact.measured} logged {fact.measured === 1 ? 'trip with a distance was' : 'trips with a distance were'} under 3 miles.</p>
      : <p className="fact-note">Add distances using “Edit climate comparison” on your journal entries to see your share.</p>)}
    <p className="fact-note">{fact.note}</p>
    {fact.id !== 'travel' && <p className="fact-note">The chart gives context for your action count. It describes the study population.</p>}
    <a className="fact-source" href={fact.url} target="_blank" rel="noreferrer">{fact.source}<ArrowUpRight size={14} /></a>
  </section>;
}
