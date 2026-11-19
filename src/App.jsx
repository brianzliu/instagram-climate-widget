import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Download, ExternalLink, HelpCircle, LayoutDashboard, Leaf, List, LoaderCircle, LockKeyhole, Plus, Settings2, Sparkles, Sprout, Trash2, Users, X } from 'lucide-react';
import { ACTIONS, chartBuckets, createAction, dateKey, inRange, periodRange, stats } from './domain.js';
import { downloadFile, extensionAPI, JOURNAL_KEYS, loadJournal, changeJournal } from './storage.js';
import { journalObservations } from './journal-observations.js';
import { Community, unshareProfile } from './Community.jsx';
import { ActionPhotos, PhotoPicker } from './PhotoPicker.jsx';
import { NextSteps, PlanForm } from './NextSteps.jsx';

const nav = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'timeline', label: 'Journal', icon: List }, { id: 'wrapped', label: 'Climate Wrapped', icon: Sparkles }, { id: 'profiles', label: 'Community', icon: Users }];
const titles = {
  overview: 'Your overview',
  timeline: 'Journal',
  wrapped: 'Climate Wrapped',
  profiles: 'Community',
  research: 'Behind Touch Grass',
  settings: 'Settings & data',
};

function GrassDoodle({ compact = false }) {
  return <svg className={`grass-doodle ${compact ? 'compact' : ''}`} viewBox="0 0 180 150" fill="none" aria-hidden="true">
    <ellipse cx="90" cy="132" rx="61" ry="8" fill="currentColor" opacity=".08" />
    <path d="M41 124c2-29-5-49-16-64 28 7 43 31 44 64h-3c-8-42-2-73 20-97-3 38 3 63 12 97h-2c1-35 18-56 44-68-15 28-20 47-20 68Z" fill="currentColor" />
    <g className="grass-face" stroke="#fafbf7" strokeWidth="3.5" strokeLinecap="round"><path d="M74 100v3m21-3v3m-17 9q7 6 13-1" /></g>
    <path d="m138 35 3 6 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z" fill="currentColor" opacity=".5" />
    <path d="M22 111q-12-2-12-11m113 5q16 3 21-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

function Modal({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('input, select, button')?.focus();
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = [...ref.current.querySelectorAll('button, input, select, textarea, a[href]')].filter(el => !el.disabled);
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
        if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</section></div>;
}

function ActionForm({ onSave, onClose, post, plan, allowPhotos = false }) {
  const [kind, setKind] = useState(post || plan ? 'custom' : 'bus');
  const [title, setTitle] = useState(post?.finding?.observation.slice(0, 600) || '');
  const [date, setDate] = useState(post?.date || (post ? '' : dateKey()));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [preparing, setPreparing] = useState(false);
  return <form onSubmit={async e => {
    e.preventDefault();
    if (preparing) return;
    setSaving(true);
    try {
      const action = createAction({ kind, title, date, note, source: post ? 'instagram' : plan ? 'next-step' : 'manual', sourcePostId: post?.id });
      await onSave(photos.length ? { ...action, photos } : action);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }}>
    {post ? <p>Review the suggested description and date. Save it only if you took this action.</p>
      : plan ? <p>What did you do when you tried this change?</p> : <label>What did you do?<select value={kind} onChange={e => setKind(e.target.value)}>{ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}<option value="custom">Write my own</option></select></label>}
    {kind === 'custom' && <label>Action<input required maxLength={600} value={title} onChange={e => setTitle(e.target.value)} /></label>}
    <label>When?<input type="date" required max={dateKey()} value={date} onChange={e => setDate(e.target.value)} /></label>
    {!post && <label>Notes <span className="muted">optional</span><textarea maxLength={600} rows={3} value={note} placeholder="What made this possible?" onChange={e => setNote(e.target.value)} /></label>}
    {allowPhotos && !post && <PhotoPicker images={photos} onChange={setPhotos} onBusy={setPreparing} />}
    {error && <p role="alert" className="error">{error}</p>}
    <button disabled={saving || preparing} className="button primary full">{saving ? 'Saving…' : post ? 'Confirm and save' : 'Save action'}<Check size={16} /></button>
  </form>;
}

function ActivityList({ actions, onDelete, limit }) {
  const sorted = [...actions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return <div className="empty"><Sprout size={32} /><h3>Your journal has room to grow.</h3><p>Log an action to start seeing your habits over time.</p></div>;
  return <div className="activity-list">{sorted.slice(0, limit).map(a => <div className="activity" key={a.id}><span className="category-icon transport"><Sprout size={19} /></span><div className="activity-main"><strong>{a.title}</strong>{a.note && <p>{a.note}</p>}<ActionPhotos images={a.photos} label="Journal photo" className="journal-photos" /></div><div className="activity-date"><span>{new Date(`${a.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><small>{a.source === 'instagram' ? 'From Instagram' : a.source === 'next-step' ? 'Change tried' : 'Self-reported'}</small></div><button className="icon-button delete-action" aria-label={`Delete ${a.title} on ${a.date}`} onClick={() => onDelete(a.id)}><Trash2 size={15} /></button></div>)}</div>;
}

function TrendChart({ actions, anchor, period }) {
  const buckets = chartBuckets(actions, anchor, period); const max = Math.max(3, ...buckets.map(b => b.total));
  return <div className="chart-wrap"><div className="chart-axis"><span>{max}</span><span>{max / 2}</span><span>0</span></div><div className="chart" role="img" aria-label={`${period} action chart. ${buckets.map(b => `${b.label}: ${b.total}`).join(', ')}`}><div className="chart-grid"><i /><i /><i /></div><div className="chart-bars">{buckets.map((b, i) => <div className="bar-column" key={i}><div className="bar-track" title={`${b.label}: ${b.total} actions`}><div className="stack" style={{ height: `${b.total / max * 100}%`, animationDelay: `${i * 15}ms` }}>{b.total > 0 && <span className="action-bar" />}</div></div><span className="bar-label">{period !== 'month' || i === 0 || (i + 1) % 5 === 0 ? b.label : ''}</span></div>)}</div></div></div>;
}

function ObservationList({ posts, reviewed, onReview, onPlan }) {
  if (!posts.length) return <div className="empty"><Users size={32} /><h3>No Instagram observations here yet.</h3><p>Completed profile analyses are logged automatically. Try a different date or scan a profile.</p></div>;
  return <div className="observation-list">{posts.map(post => {
    return <article className="observation-entry" key={post.id}>
      <div className="observation-heading"><span className="category-icon transport"><Leaf size={19} /></span><div><strong>@{post.username}</strong><span className="observation-status">{post.stale ? 'Edited since last scan' : post.finding?.fromCommunity ? 'Reviewed by the profile owner' : 'Model suggestion · needs review'}</span></div><div className="observation-published"><time dateTime={post.publishedAt || post.publishedDate || undefined}>{post.date ? new Date(`${post.date}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Published date unknown'}</time><small>Published</small></div></div>
      <p>{post.finding?.observation || 'No model finding available for this post.'}</p>
      {post.finding?.signal === 'supportive' && !post.stale && !post.finding.fromCommunity && (reviewed.has(post.id)
        ? <p className="muted">Saved to your actions</p>
        : <button className="text-button" onClick={() => onReview(post)}>Review for my journal <ArrowRight size={14} /></button>)}
      {onPlan && !post.stale && post.finding?.signal === 'higherImpact' && <button className="text-button" onClick={() => onPlan(post.finding.observation)}>Plan an alternative <ArrowRight size={14} /></button>}
      <details><summary>Caption & evidence</summary><p className="observation-caption">{post.caption || 'Caption unavailable.'}</p><p>{post.finding?.evidence || 'No evidence returned.'}</p><p className="muted">{post.finding ? `${post.finding.confidence} model confidence · ${post.finding.signal}` : 'Unanalysed'} · Date source: {post.dateSource}</p></details>
      <div className="observation-footer"><span>Analysed {post.analyzedAt ? new Date(post.analyzedAt).toLocaleDateString() : 'at an unknown time'}</span><a href={post.url} target="_blank" rel="noreferrer">Original post<ExternalLink size={12} /></a></div>
    </article>;
  })}</div>;
}

export default function App() {
  const [page, setPage] = useState('overview'); const [mode, setMode] = useState(extensionAPI ? 'personal' : 'demo'); const [journal, setJournal] = useState(null); const [anchor, setAnchor] = useState(new Date()); const [period, setPeriod] = useState('month'); const [modal, setModal] = useState(null); const [toast, setToast] = useState(''); const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [health, setHealth] = useState(null);
  const toastTimer = useRef();
  const [reviewPost, setReviewPost] = useState(null);
  const [planIdea, setPlanIdea] = useState('');
  const [communityAccount, setCommunityAccount] = useState();
  const [completeStep, setCompleteStep] = useState(null);
  const [journalView, setJournalView] = useState('actions'); const [observedPeriod, setObservedPeriod] = useState('all');
  useEffect(() => { let canceled = false; setJournal(null); loadJournal(mode).then(data => { if (!canceled) setJournal(data); }).catch(e => setError(e.message)); return () => { canceled = true; }; }, [mode]);
  useEffect(() => {
    const changed = (changes, area) => { if (area === 'local' && changes[JOURNAL_KEYS[mode]]?.newValue) setJournal(changes[JOURNAL_KEYS[mode]].newValue); };
    const webChanged = e => { if (e.key === JOURNAL_KEYS[mode] && e.newValue) { try { setJournal(JSON.parse(e.newValue)); } catch {} } };
    extensionAPI?.storage.onChanged.addListener(changed); window.addEventListener('storage', webChanged);
    return () => { extensionAPI?.storage.onChanged.removeListener(changed); window.removeEventListener('storage', webChanged); };
  }, [mode]);
  useEffect(() => { if (location.hash === '#profiles' || location.hash === '#community') setPage('profiles'); if (location.hash === '#settings') setPage('settings'); if (location.hash === '#journal') { setPage('timeline'); setJournalView('instagram'); } if (location.hash === '#plans') { setPage('timeline'); setJournalView('plans'); } }, []);
  const notify = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); };
  const applyEdit = async edit => setJournal(await changeJournal(mode, edit));
  const addAction = async action => {
    try {
      await applyEdit(completeStep ? { type: 'completeStep', id: completeStep.id, action } : { type: 'addAction', action });
    } catch (e) {
      if (action.photos?.length && /quota|exceeded|too large/i.test(e.message)) throw new Error('This browser is low on journal storage. Remove a photo or export and clear old entries.');
      throw e;
    }
    notify(completeStep ? 'Change logged for your next Climate Wrapped.' : 'Action saved.');
  };
  const makePlan = idea => { setPlanIdea(idea || ''); setModal('plan'); };
  const removePlan = async id => {
    try { await applyEdit({ type: 'removeStep', id }); }
    catch (e) { setError(e.message); }
  };
  const deleteAction = async id => {
    try { await applyEdit({ type: 'removeAction', id }); notify('Action removed.'); }
    catch (e) { setError(e.message); }
  };
  async function importActions(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a journal export under 20 MB.');
      await applyEdit({ type: 'importActions', data: JSON.parse(await file.text()) });
      notify('Journal actions imported.');
    } catch (e) { setError(e instanceof SyntaxError ? 'Choose a Touch Grass JSON export.' : e.message); }
  }
  const changePage = id => {
    setPage(id);
    setQuery('');
    if (id === 'wrapped') {
      setPeriod('month');
      const now = new Date();
      setAnchor(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    } else if (page === 'wrapped') {
      setPeriod('month');
      setAnchor(new Date());
    }
  };
  const range = periodRange(anchor, period); const actions = journal ? inRange(journal.actions, range) : []; const summary = stats(actions);
  const monthName = anchor.toLocaleDateString('en-US', { month: 'long' });
  const dateLabel = period === 'day' ? anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : period === 'year' ? String(anchor.getFullYear()) : period === 'week' ? `Week of ${new Date(`${range.start}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : `${monthName} ${anchor.getFullYear()}`;
  const moveDate = delta => { const next = new Date(anchor); if (period === 'year') next.setFullYear(next.getFullYear() + delta); else if (period === 'month') { next.setDate(1); next.setMonth(next.getMonth() + delta); } else next.setDate(next.getDate() + (period === 'day' ? 1 : 7) * delta); setAnchor(next); };
  const exportJournal = () => { downloadFile(`touch-grass-${mode}-${dateKey()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), mode, ...journal }, null, 2)); notify('Journal exported.'); };
  const checkHealth = async () => { setHealth({ checking: true }); try { const response = extensionAPI ? await extensionAPI.runtime.sendMessage({ type: 'HEALTH' }) : await fetch('http://127.0.0.1:8787/health').then(r => r.json()); if (response.error) throw new Error(response.error); setHealth(response); } catch { setHealth({ error: 'Backend not running. Start it with npm run api.' }); } };
  const profiles = journal?.observations || [];
  const observedPosts = journal ? journalObservations(journal) : [];
  const visibleObservations = observedPosts.filter(post =>
    (observedPeriod === 'all' || (observedPeriod === 'unknown' ? !post.date : post.date && post.date >= range.start && post.date < range.end)) &&
    `${post.username} ${post.caption} ${post.finding?.observation || ''} ${post.finding?.evidence || ''}`.toLowerCase().includes(query.toLowerCase()));
  const deleteProfile = async id => {
    const profile = profiles.find(p => p.id === id);
    try { await applyEdit({ type: 'removeProfile', username: profile.username }); } catch (e) { setError(e.message); }
  };
  const reviewed = new Set(journal?.actions.map(action => action.sourcePostId).filter(Boolean));
  const visibleActions = actions.filter(action => `${action.title} ${action.note}`.toLowerCase().includes(query.toLowerCase()));
  const recapEnded = range.end <= dateKey();
  const changesTried = actions.filter(action => action.source === 'next-step').length;
  const highlighted = [...actions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  function selectPeriod(nextPeriod) {
    setPeriod(nextPeriod);
    if (page !== 'wrapped') return;
    const start = periodRange(new Date(), nextPeriod).start;
    const previous = new Date(`${start}T12:00:00`);
    previous.setDate(previous.getDate() - 1);
    setAnchor(previous);
  }

  function downloadRecap() {
    const label = dateLabel.replace(/[<>&"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
      <rect width="1080" height="1350" fill="#234231"/>
      <g fill="#daf59f" font-family="Arial,sans-serif">
        <text x="90" y="145" font-size="46" font-weight="bold">TOUCH GRASS!</text>
        <text x="90" y="246" font-size="28">${label} · ${mode === 'demo' ? 'FICTIONAL DEMO' : 'CLIMATE WRAPPED'}</text>
        <text x="78" y="720" font-size="390" font-weight="bold">${summary.total}</text>
        <text x="94" y="824" font-size="53">${summary.total === 1 ? 'action' : 'actions'} logged</text>
        <text x="95" y="920" font-size="38">${summary.days} active ${summary.days === 1 ? 'day' : 'days'}</text>
        ${changesTried ? `<text x="95" y="1000" font-size="38">${changesTried} ${changesTried === 1 ? 'change tried' : 'changes tried'}</text>` : ''}
        <text x="95" y="1210" font-size="24">Based on the actions you recorded.</text>
      </g></svg>`;
    downloadFile('touch-grass-wrapped.svg', svg, 'image/svg+xml');
    notify('Recap saved.');
  }

  return <div className="app-shell">
    <aside className="sidebar"><a href="#" className="brand" aria-label="Touch Grass home" onClick={e => { e.preventDefault(); changePage('overview'); }}><img className="brand-wordmark" src="./touch-grass-logo.png" alt="Touch Grass" /></a><nav aria-label="Main navigation">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} aria-label={item.label} onClick={() => changePage(item.id)}><item.icon size={18} strokeWidth={1.6} />{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'research' ? 'active' : ''}`} onClick={() => changePage('research')}><HelpCircle size={18} />About the project</button><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => changePage('settings')}><Settings2 size={18} />Settings & data</button><div className="local-status"><span className="avatar">{mode === 'demo' ? 'D' : 'Y'}</span><div><strong>{mode === 'demo' ? 'Demo journal' : 'Your private journal'}</strong><span><span className="status-dot" />Stored on this device</span></div></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-right">{page !== 'profiles' && <><span className="privacy-label"><LockKeyhole size={13} />Saved on this device</span><button className="mode-toggle" onClick={() => { if (mode === 'personal' && journalView === 'plans') setJournalView('actions'); setMode(mode === 'demo' ? 'personal' : 'demo'); }}>{mode === 'demo' ? 'Demo mode' : 'Personal mode'}<span className={mode === 'demo' ? 'toggle on' : 'toggle'} /></button></>}</div></header>
      <main><div className="page-heading"><div><h1>{titles[page]}</h1></div>{['overview', 'timeline'].includes(page) && <button className="button primary" onClick={() => setModal('action')} disabled={!journal}><Plus size={16} />Log an action</button>}</div>
        {mode === 'demo' && page !== 'profiles' && <div className="demo-banner"><span><span className="demo-tag">DEMO</span>You're exploring a sample journal. These actions are fictional.</span><button onClick={() => setMode('personal')}>Start my journal<ArrowRight size={14} /></button></div>}
        {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {!journal ? <div className="loading"><LoaderCircle className="spin" />Loading your journal…</div> : <div className="page-content" key={page}>
          {['overview', 'timeline', 'wrapped'].includes(page) && (page !== 'timeline' || journalView === 'actions' || (journalView === 'instagram' && observedPeriod === 'period')) && <div className="period-toolbar"><div className="date-controls"><button className="icon-button" aria-label="Previous period" onClick={() => moveDate(-1)}><ChevronLeft size={16} /></button><span><CalendarDays size={15} />{dateLabel}</span><button className="icon-button" aria-label="Next period" disabled={page === 'wrapped' && range.start >= periodRange(new Date(), period).start} onClick={() => moveDate(1)}><ChevronRight size={16} /></button><button className="text-button today" onClick={() => setAnchor(new Date())}>Today</button></div><div className="segmented" aria-label="Time period">{(page === 'wrapped' ? ['day', 'week', 'month'] : ['week', 'month', 'year']).map(p => <button aria-pressed={period === p} className={period === p ? 'selected' : ''} key={p} onClick={() => selectPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div></div>}
          {page === 'overview' && <>

            <div className="stats-row"><div><span>Actions logged<Sprout size={16} /></span><strong>{summary.total}<small>actions</small></strong></div><div><span>Days active<CalendarDays size={16} /></span><strong>{summary.days}<small>days</small></strong></div></div>
            <div className="overview-columns"><div className="main-column"><section className="section"><div className="section-heading"><h2>Your actions over time</h2></div><TrendChart actions={actions} anchor={anchor} period={period} /></section><section className="section recent-section"><div className="section-heading"><h2>Recent actions</h2><button className="text-button" onClick={() => changePage('timeline')}>View journal<ArrowRight size={14} /></button></div><ActivityList actions={actions} onDelete={deleteAction} limit={4} /></section></div>
              <aside className="insight-column"><div className="wrapped-teaser"><GrassDoodle /><h3>Climate Wrapped</h3><button onClick={() => changePage('wrapped')}>Open recap<ArrowUpRight size={16} /></button></div><details className="context-note"><summary>What do the numbers mean?</summary><p>Recorded actions, not an emissions estimate. Everyone has different access and circumstances.</p><button className="text-button" onClick={() => changePage('research')}>About the project<ArrowUpRight size={14} /></button></details></aside></div>
          </>}
          {page === 'timeline' && <section className="section timeline-section">
            <div className="journal-view-tabs" role="tablist" aria-label="Journal entries">
              <button role="tab" aria-selected={journalView === 'actions'} onClick={() => { setJournalView('actions'); setQuery(''); }}>My actions</button>
              <button role="tab" aria-selected={journalView === 'instagram'} onClick={() => { setJournalView('instagram'); setQuery(''); }}>Instagram observations ({observedPosts.length})</button>
              {mode === 'personal' && <button role="tab" aria-selected={journalView === 'plans'} onClick={() => setJournalView('plans')}>Changes to try</button>}
            </div>
            {journalView === 'instagram' && <div className="observation-controls"><p>Posts are grouped by their published date. Model findings need your review.</p><select aria-label="Observation dates" value={observedPeriod} onChange={e => setObservedPeriod(e.target.value)}><option value="all">All published dates</option><option value="period">Selected week, month, or year</option><option value="unknown">Published date unknown</option></select></div>}
            {journalView === 'plans'
              ? mode === 'personal' && <NextSteps steps={journal.nextSteps || []} onPlan={makePlan} onComplete={setCompleteStep} onRemove={removePlan} />
              : <><div className="journal-filters"><input type="search" aria-label={journalView === 'actions' ? 'Search actions' : 'Search Instagram observations'} placeholder="Search your journal…" value={query} onChange={e => setQuery(e.target.value)} /></div>
                {journalView === 'actions' ? <ActivityList actions={visibleActions} onDelete={deleteAction} /> : <ObservationList posts={visibleObservations} reviewed={reviewed} onReview={setReviewPost} onPlan={mode === 'personal' ? makePlan : null} />}</>}
          </section>}
          {page === 'wrapped' && (recapEnded && summary.total > 0
            ? <><section className="wrapped-poster"><div>
                <span className="eyebrow">{dateLabel}{mode === 'demo' ? ' · Fictional demo' : ''}</span>
                <h2>Look at you<br /><em>growing.</em></h2>
                <div className="wrapped-number">{summary.total}<span>{summary.total === 1 ? 'action' : 'actions'} logged</span></div>
                <p>{summary.days} active {summary.days === 1 ? 'day' : 'days'}</p>
                {changesTried > 0 && <p>{changesTried} {changesTried === 1 ? 'change tried' : 'changes tried'}</p>}
              </div><GrassDoodle compact /></section>
              <section className="section recap-highlights"><h2>From your journal</h2><ul>{highlighted.map(action => <li key={action.id}>{action.title}</li>)}</ul></section>
              <div className="recap-footer"><p>Based on the actions you recorded.</p><button className="button secondary" onClick={downloadRecap}><Download size={16} />Save my recap</button></div></>
            : <section className="empty section"><Sparkles size={32} /><h2>{recapEnded ? 'No actions in this period' : 'This recap is still growing'}</h2>
                <p>{recapEnded ? 'Log an action for this period to see a recap.' : 'Come back after this period ends to see a recap of the actions you logged.'}</p>
                <button className="button secondary" onClick={() => setModal('action')}>Log an action</button>
              </section>)}
          {page === 'profiles' && <>
            <Community account={communityAccount} setAccount={setCommunityAccount} />
            <section className="profile-intro"><span className="category-icon transport"><Users size={24} /></span><div><h2>Scan an Instagram profile</h2><p>Look for Touch Grass beside the profile photo. Scan the grid, then review the suggestions in your journal.</p><a className="button primary" href="https://www.instagram.com/" target="_blank" rel="noreferrer">Open Instagram<ExternalLink size={15} /></a></div></section>
            {mode === 'personal' && profiles.length > 0 && <section className="section"><h2>Scans saved on this device</h2>{profiles.map(profile => <article className="saved-profile" key={profile.id}><div className="section-heading"><div><h3>@{profile.username}</h3><p>{new Date(profile.analyzedAt).toLocaleDateString()}</p></div><button className="icon-button" aria-label={`Delete analysis for ${profile.username}`} onClick={() => deleteProfile(profile.id)}><Trash2 size={17} /></button></div><p>{profile.analysis.summary}</p></article>)}</section>}
          </>}
          {page === 'research' && <div className="reading-layout"><section><span className="eyebrow">A SYNTHESIS PROJECT</span><h2>What changes when<br />climate actions become visible?</h2><p>Touch Grass explores how social visibility, positive reinforcement, and reflection affect climate motivation and judgments of others. It is a research prototype for voluntary participants.</p><h3>What the profile widget can tell you</h3><p>An image-capable model reads the first 10 accessible grid posts and their captions. It suggests encouraging feedback on visible climate-friendly actions. Pinned posts may come first. Images are resized before analysis, and individual post findings remain available for review.</p><h3>What it cannot tell you</h3><p>Posts are curated. A photograph cannot reveal an entire lifestyle, the reason for a trip, access to transport, or someone's values. Model findings are uncertain observations, not verified emissions estimates. No ranking of people or moral score is assigned.</p><h3>Why a positive action journal?</h3><p>Research on goal monitoring, changing social norms, and anticipated emotions informs the design. It does not establish that this extension changes real behavior. That question needs a participant study.</p><ul className="source-list"><li><a href="https://doi.org/10.1037/bul0000025" target="_blank" rel="noreferrer">Harkin et al., 2016<ArrowUpRight size={14} /></a><span>A meta-analysis of progress monitoring and goal attainment.</span></li><li><a href="https://doi.org/10.1177/0956797617719950" target="_blank" rel="noreferrer">Sparkman & Walton, 2017<ArrowUpRight size={14} /></a><span>Dynamic norms and sustainable behavior.</span></li><li><a href="https://doi.org/10.1371/journal.pone.0188781" target="_blank" rel="noreferrer">Schneider et al., 2017<ArrowUpRight size={14} /></a><span>Anticipated pride and guilt in environmental decisions.</span></li></ul></section><aside className="context-note"><Sprout size={25} /><h3>Built for reflection.</h3><p>Positive actions are worth noticing. So are the circumstances that make them possible.</p><p>The journal records actions without converting them into a person's worth.</p><span className="tiny-label">UC SAN DIEGO · SYNTHESIS</span></aside></div>}
          {page === 'settings' && <div className="settings-layout">{(extensionAPI || import.meta.env.DEV) && <section className="section"><h2>OpenRouter connection</h2><p>The local backend holds your API key. The extension never stores or displays it.</p><div className="code-block">OPENROUTER_API_KEY=your_key<br />OPENROUTER_MODEL=google/gemini-2.5-flash</div><p>Add these to <code>.env</code> in the project folder, then run <code>npm run api</code>. Choose an image-capable model available to your OpenRouter account.</p><div className="connection-row"><span className={`connection-dot ${health?.configured ? 'connected' : ''}`} /><span>{health?.checking ? 'Checking connection…' : health?.error || (health ? health.configured ? `Connected · ${health.model}` : 'Backend online. Set OPENROUTER_API_KEY in .env.' : 'Connection not checked')}</span><button className="button secondary" onClick={checkHealth} disabled={health?.checking}>Test connection</button></div><p className="form-note">Scanning sends new post photos and captions to OpenRouter. Publishing to the community requires a separate review.</p>
          {extensionAPI && health?.publisher && <div className="settings-row"><div><strong>Community posts for @{health.publisher}</strong><p>Remove this profile and its photos from the shared site.</p></div><button className="button danger" onClick={() => setModal('unshare')}>Remove shared posts</button></div>}</section>}<section className="section"><h2>Your data</h2><p>{mode === 'demo' ? 'You are viewing fictional demo data. Your personal journal is stored separately.' : 'Your actions and profile analyses are stored locally in this browser.'}</p><div className="settings-row"><div><strong>Export this journal</strong><p>Download actions, notes, and profile analyses as JSON.</p></div><button className="button secondary" onClick={exportJournal}><Download size={16} />Export JSON</button></div>{mode === 'personal' && <div className="settings-row"><div><strong>Import personal actions</strong><p>Bring actions from your Touch Grass JSON export into this browser.</p></div><input type="file" aria-label="Import personal actions" accept=".json,application/json" onChange={importActions} /></div>}<div className="settings-row"><div><strong>Clear {mode === 'demo' ? 'demo' : 'personal'} data</strong><p>Removes all records in this mode. This cannot be undone.</p></div><button className="button danger" onClick={() => setModal('clear')}><Trash2 size={16} />Clear data</button></div></section><section className="section"><h2>Instagram permissions</h2><p>The widget runs only on Instagram. Collection starts when you click Scan. It opens one temporary background tab at a time to read posts, then closes it. It does not read DMs, post, like, follow, or change your account.</p><p>In Zen, allow this extension to access Instagram through the browser's extension permissions if the widget does not appear. Instagram layout changes and access restrictions can interrupt collection.</p></section></div>}
        </div>}

      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {modal === 'action' && <Modal title="Log a small win" onClose={() => setModal(null)}><ActionForm allowPhotos={mode === 'personal'} onSave={addAction} onClose={() => setModal(null)} /></Modal>}
    {reviewPost && <Modal title="Review and log an action" onClose={() => setReviewPost(null)}><ActionForm post={reviewPost} onSave={addAction} onClose={() => setReviewPost(null)} /></Modal>}
    {modal === 'plan' && <Modal title="Plan a change" onClose={() => setModal(null)}><PlanForm idea={planIdea} onSave={async step => {
      await applyEdit({ type: 'addStep', step });
      setModal(null);
      setJournalView('plans');
      changePage('timeline');
      notify('Plan saved privately.');
    }} /></Modal>}
    {completeStep && <Modal title="Log a change you tried" onClose={() => setCompleteStep(null)}>
      <ActionForm plan={completeStep} allowPhotos onSave={addAction} onClose={() => setCompleteStep(null)} />
    </Modal>}
    {modal === 'unshare' && <Modal title="Remove all shared posts?" onClose={() => setModal(null)}>
      <p>This removes the community profile and photos. Copies already saved by others may still exist.</p>
      <button className="button danger" disabled={health.removing} onClick={async () => {
        setHealth({ ...health, removing: true });
        try { await unshareProfile(health.publisher); setModal(null); notify('Shared posts removed.'); }
        catch (e) { setError(e.message); setModal(null); }
        finally { setHealth({ ...health, removing: false }); }
      }}>Remove shared posts</button>
    </Modal>}
    {modal === 'clear' && <Modal title="Clear this journal?" onClose={() => setModal(null)}><p>All {mode} actions and profile analyses will be deleted from this browser. Export a copy first if you want to keep them.</p><div className="inline-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep my data</button><button className="button danger" onClick={async () => { try { await applyEdit({ type: 'clear' }); setModal(null); notify('Journal cleared.'); } catch (e) { setError(e.message); } }}>Delete all {mode} data</button></div></Modal>}
  </div>;
}
