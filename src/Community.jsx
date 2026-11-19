import React, { useEffect, useState } from 'react';
import { ExternalLink, Users } from 'lucide-react';
import { extensionAPI } from './storage.js';

async function communityRequest(type, data = {}) {
  if (extensionAPI) {
    const result = await extensionAPI.runtime.sendMessage({ type, ...data });
    if (result?.error) throw new Error(result.error);
    return result;
  }
  const base = import.meta.env.DEV ? 'http://127.0.0.1:8787/community' : './community';
  const path = data.username ? '/' + encodeURIComponent(data.username) : data.after ? '?after=' + encodeURIComponent(data.after) : '';
  const response = await fetch(base + path);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export function Community() {
  const [names, setNames] = useState([]);
  const [next, setNext] = useState(null);
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState(null);
  const [directoryStatus, setDirectoryStatus] = useState('Loading shared profiles…');
  const [profileStatus, setProfileStatus] = useState('');
  const [selected, select] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadDirectory(after) {
    setLoadingMore(true);
    try {
      const page = await communityRequest('COMMUNITY_LIST', { after });
      setNames(previous => after ? [...previous, ...page.profiles] : page.profiles);
      setNext(page.next);
      setDirectoryStatus(page.profiles.length || after ? '' : 'No profiles have shared posts yet.');
    } catch { setDirectoryStatus('The community is unavailable.'); }
    finally { setLoadingMore(false); }
  }

  useEffect(() => { loadDirectory(); }, []);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setProfile(null);
    setProfileStatus(`Loading @${selected}…`);
    communityRequest('COMMUNITY_PROFILE', { username: selected }).then(({ profile }) => {
      if (!active) return;
      setProfile(profile);
      setProfileStatus(profile ? '' : `No public actions for @${selected}.`);
    }).catch(() => { if (active) setProfileStatus('This shared profile is unavailable.'); });
    return () => { active = false; };
  }, [selected]);

  function findProfile(event) {
    event.preventDefault();
    const username = search.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_.]{1,30}$/.test(username)) {
      setProfileStatus('Enter an Instagram handle.');
      return;
    }
    select(username);
  }

  return <section className="section community">
    <div className="section-heading"><h2>Shared actions</h2><Users size={21} /></div>
    <form className="community-search" onSubmit={findProfile}>
      <input type="search" aria-label="Find a shared Instagram profile" placeholder="Search by Instagram handle" value={search} onChange={e => setSearch(e.target.value)} />
      <button className="button secondary">Find profile</button>
    </form>
    {directoryStatus && <p className="muted" role="status">{directoryStatus}</p>}
    <div className="community-names" aria-label="Shared profiles">
      {names.map(name => <button key={name} className="button secondary" aria-pressed={name === selected} onClick={() => select(name)}>@{name}</button>)}
      {next && <button className="text-button" disabled={loadingMore} onClick={() => loadDirectory(next)}>More profiles</button>}
    </div>
    {profileStatus && <p role="status">{profileStatus}</p>}
    {profile && <div className="community-profile"><h3>@{profile.username}</h3><p className="muted">Reviewed and shared by this profile owner.</p>
      <div className="community-posts">{profile.posts.map(post => <article key={post.id}>
        <div className="community-photos">{post.images.map((image, i) => <img key={i} src={image} loading="lazy" alt={`Shared photo ${i + 1} of ${post.images.length}`} />)}</div>
        <div><p>{post.action}</p>{post.publishedDate && <time dateTime={post.publishedDate}>{new Date(post.publishedDate + 'T12:00:00').toLocaleDateString()}</time>}
        <a href={post.url} target="_blank" rel="noreferrer">Original post <ExternalLink size={13} /></a></div>
      </article>)}</div>
    </div>}
  </section>;
}

export async function unshareProfile(username) {
  return communityRequest('UNSHARE_PROFILE', { username });
}
