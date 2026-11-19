import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Heart, MessageCircle, Plus } from 'lucide-react';
import { extensionAPI } from './storage.js';
import { profileName } from './community-routes.js';
import { dateKey } from './domain.js';
import { ActionPhotos, PhotoPicker } from './PhotoPicker.jsx';

async function request(path, { method = 'GET', body, account } = {}) {
  if (extensionAPI) {
    const result = await extensionAPI.runtime.sendMessage({ type: 'COMMUNITY_REQUEST', path, method, body, account });
    if (result?.error) throw new Error(result.error);
    return result;
  }
  const base = import.meta.env.DEV ? 'http://127.0.0.1:8787' : location.origin;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (account?.token) {
    headers.Authorization = `Bearer ${account.token}`;
    headers['X-Touch-Grass-Profile'] = account.username;
  }
  const response = await fetch(base + path, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'error',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function SignIn({ onSignIn, onClose }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = form.get('username').trim().replace(/^@/, '').toLowerCase();
    const token = form.get('token').trim();
    if (!profileName.test(username) || token.length < 32) { setError('Enter your community handle and access key.'); return; }
    setBusy(true);
    setError('');
    try {
      const account = await request('/community/auth/session', { method: 'POST', account: { username, token } });
      onSignIn({ ...account, token });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <form className="community-panel" onSubmit={signIn}>
    <h3>Sign in to Touch Grass</h3>
    <p>Your community host provides a handle and access key.</p>
    <label>Community handle<input autoComplete="username" required name="username" maxLength={31} /></label>
    <label>Access key<input type="password" autoComplete="current-password" required name="token" maxLength={512} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="inline-actions"><button className="button primary" disabled={busy}>Sign in</button>
      <button className="text-button" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form>;
}

function ComposeAction({ account, onPublish, onClose }) {
  const [images, setImages] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useRef(null);

  async function publish(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const action = form.get('action').trim();
    if (!action) { setError('Describe the action you took.'); return; }
    setBusy(true);
    setError('');
    id.current ||= `web-${crypto.randomUUID()}`;
    try {
      await request(`/community/${account.username}`, {
        method: 'PUT', account, body: { posts: [{ id: id.current, source: 'direct', action, publishedDate: form.get('date'), images }] },
      });
      onPublish();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <form className="community-panel" onSubmit={publish}>
    <h3>Share an action</h3>
    <label>What did you do?<textarea rows={3} maxLength={600} required name="action" placeholder="I fixed my bike and rode it to class." /></label>
    <label>When?<input type="date" required defaultValue={dateKey()} max={dateKey()} name="date" /></label>
    <PhotoPicker images={images} onChange={setImages} onBusy={setPreparing} />
    <p>Your action and any attached photos will be public.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="inline-actions"><button className="button primary" disabled={busy || preparing}>{busy ? 'Publishing…' : 'Publish action'}</button>
      <button className="text-button" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form>;
}

function BoardPost({ post, account, onChange, onSignIn }) {
  const [reply, setReply] = useState('');
  const replyId = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const comments = post.comments || [];
  const likes = post.likeCount || 0;
  const owner = account?.username === post.username;
  const path = `/community/${post.username}/posts/${post.id}`;

  async function interact(suffix, method, body) {
    if (!account) { onSignIn(); return false; }
    setBusy(true);
    setError('');
    try {
      const result = await request(path + suffix, { method, body, account });
      onChange(result.ok ? null : { ...post, ...result });
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }

  function comment(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    replyId.current ||= crypto.randomUUID();
    interact('/comments', 'PUT', { id: replyId.current, text: reply.trim() }).then(saved => {
      if (saved) { setReply(''); replyId.current = null; }
    });
  }

  return <article className="board-post">
    <div className="board-byline"><strong>@{post.username}</strong>
      {post.publishedDate && <time dateTime={post.publishedDate}>{new Date(post.publishedDate + 'T12:00:00').toLocaleDateString()}</time>}</div>
    <p className="board-action">{post.action}</p>
    <ActionPhotos images={post.images} label="Shared photo" className="board-photos" />
    {post.url && <a className="board-source" href={post.url} target="_blank" rel="noreferrer">Original post <ExternalLink size={13} /></a>}
    <div className="board-controls">
      <button type="button" className="board-like" aria-pressed={!!post.liked} aria-label={`Like action, ${likes} ${likes === 1 ? 'like' : 'likes'}`}
        disabled={busy} onClick={() => interact('/like', 'PUT', { liked: !post.liked })}><Heart size={17} fill={post.liked ? 'currentColor' : 'none'} />{likes}</button>
      {owner && <button type="button" className="text-button" onClick={() => setRemoving(!removing)}>Remove action</button>}
    </div>
    {removing && <div className="inline-actions"><p>Remove this action, its photos, and its comments?</p>
      <button className="button danger" disabled={busy} onClick={() => interact('', 'DELETE')}>Confirm removal</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <details className="board-thread">
      <summary><MessageCircle size={16} />{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</summary>
      {!!comments.length && <ul>{comments.map(entry => <li key={entry.id}><div><strong>@{entry.username}</strong><p>{entry.text}</p></div>
        {(owner || entry.username === account?.username) && <button className="text-button" disabled={busy} onClick={() => interact(`/comments/${entry.id}`, 'DELETE')}>Remove comment</button>}</li>)}</ul>}
      {account ? <form className="board-reply" onSubmit={comment}><input aria-label={`Comment on @${post.username}'s action`} placeholder="Leave some encouragement…" required maxLength={500}
        value={reply} onChange={event => { setReply(event.target.value); replyId.current = null; }} disabled={busy} />
        <button className="button secondary" disabled={busy || !reply.trim()}>Post comment</button></form>
      : <button className="text-button" onClick={onSignIn}>Sign in to comment</button>}
    </details>
  </article>;
}

export function Community({ account, setAccount }) {
  const [panel, setPanel] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selected, setSelected] = useState('');
  const [next, setNext] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Loading shared actions…');
  const [notice, setNotice] = useState('');
  const [version, reload] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const signInAnchor = useRef(null);

  async function load(cursor) {
    const current = ++requestVersion.current;
    setLoading(true);
    setStatus(cursor ? '' : 'Loading shared actions…');
    try {
      let data;
      if (selected) {
        const { profile } = await request(`/community/${selected}`, { account });
        data = { posts: (profile?.posts || []).map(post => ({ ...post, username: selected })), next: null };
      } else {
        data = await request('/community/feed/recent' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''), { account });
      }
      if (current !== requestVersion.current) return;
      setPosts(previous => cursor ? [...previous, ...data.posts] : data.posts);
      setNext(data.next);
      setStatus(data.posts.length || cursor ? '' : selected ? `No public actions for @${selected}.` : 'No actions have been shared yet.');
    } catch {
      if (current === requestVersion.current) setStatus('The community is unavailable.');
    } finally { if (current === requestVersion.current) setLoading(false); }
  }

  useEffect(() => {
    setPosts([]);
    setNext(null);
    load();
    return () => { requestVersion.current++; };
  }, [account, selected, version]);

  useEffect(() => {
    if (!extensionAPI || account !== undefined) return;
    let active = true;
    request('/community/auth/session', { method: 'POST' }).then(user => {
      if (active) setAccount(current => current === undefined ? user : current);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function find(event) {
    event.preventDefault();
    const username = search.trim().replace(/^@/, '').toLowerCase();
    if (!profileName.test(username)) { setNotice('Enter a community handle.'); return; }
    setNotice('');
    if (selected === username) reload(previous => previous + 1);
    setSelected(username);
  }

  function signIn() {
    setPanel('sign-in');
    signInAnchor.current?.scrollIntoView({ block: 'nearest' });
  }

  function published() {
    setPanel(null);
    setNotice('Action shared.');
    setSelected('');
    setSearch('');
    reload(previous => previous + 1);
  }

  return <section className="section community" ref={signInAnchor}>
    <div className="section-heading board-heading"><h2>Shared actions</h2>
      <div className="inline-actions">
        {account ? <><span className="muted">@{account.username}</span><button className="text-button" onClick={() => { setAccount(null); setPanel(null); }}>Sign out</button></>
          : <button className="text-button" onClick={signIn}>Sign in</button>}
        <button className="button primary" onClick={() => setPanel(account ? 'compose' : 'share-sign-in')}><Plus size={16} />Share an action</button>
      </div>
    </div>
    {['sign-in', 'share-sign-in'].includes(panel) && <SignIn onSignIn={user => { setAccount(user); setPanel(panel === 'share-sign-in' ? 'compose' : null); }} onClose={() => setPanel(null)} />}
    {panel === 'compose' && account && <ComposeAction account={account} onPublish={published} onClose={() => setPanel(null)} />}
    <form className="community-search" onSubmit={find}>
      <input type="search" aria-label="Find a shared profile" placeholder="Search by community handle" value={search} onChange={e => setSearch(e.target.value)} />
      <button className="button secondary">Find profile</button>
      {selected && <button type="button" className="text-button" onClick={() => { setSelected(''); setSearch(''); }}>Show all actions</button>}
    </form>
    {notice && <p role="status">{notice}</p>}
    {status && <p className="muted" role="status">{status}</p>}
    <div className="community-board">{posts.map(post => <BoardPost key={`${post.username}/${post.id}`} post={post} account={account} onSignIn={signIn}
      onChange={updated => setPosts(previous => previous.flatMap(item => item.id === post.id && item.username === post.username ? updated ? [updated] : [] : [item]))} />)}</div>
    {next && <button className="button secondary" disabled={loading} onClick={() => load(next)}>More actions</button>}
  </section>;
}

export function unshareProfile(username) {
  return request(`/community/${username}`, { method: 'DELETE' });
}
