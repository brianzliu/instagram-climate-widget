import React, { useState } from 'react';
import { ArrowRight, Check, Sprout } from 'lucide-react';

export function NextSteps({ steps, onPlan, onComplete, onRemove }) {
  const completed = steps.filter(step => step.actionId).length;
  return <div className="next-steps">
    <div className="section-heading">
      <div><h2>One change to try</h2><p>Pick a practical alternative for next time. Try it, then log what worked.</p></div>
      <button className="button secondary" onClick={() => onPlan(null)}>Make a plan</button>
    </div>
    {completed > 0 && <p className="steps-milestone"><Sprout size={18} />{completed} {completed === 1 ? 'change tried' : 'changes tried'}</p>}
    {!!steps.length && <ul className="steps-list">{steps.map(step => <li key={step.id}>
      <div><strong>{step.title}</strong>{step.actionId && <p><Check size={15} /> Tried it</p>}</div>
      <div className="inline-actions">
        {!step.actionId && <button className="button secondary" onClick={() => onComplete(step)}>I tried it<ArrowRight size={14} /></button>}
        <button className="text-button" aria-label={`Remove plan: ${step.title}`} onClick={() => onRemove(step.id)}>Remove plan</button>
      </div>
    </li>)}</ul>}
  </div>;
}

export function PlanForm({ idea, onSave }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault();
    const title = new FormData(event.currentTarget).get('title').trim();
    if (!title) { setError('Write one thing you can try.'); return; }
    setBusy(true);
    try { await onSave({ id: crypto.randomUUID(), title }); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }}>
    {idea && <p className="plan-idea">Idea from a scan. {idea}</p>}
    <label>What could you do differently next time?<textarea name="title" rows={3} required maxLength={300} placeholder="Take old electronics to a drop-off instead of throwing them out." /></label>
    <p className="form-note">Your plan stays in this browser. It counts in Climate Wrapped after you log what you did.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button primary" disabled={busy}>Save private plan</button>
  </form>;
}
