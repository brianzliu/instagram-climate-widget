import { profileFromDocument, gridPosts } from './collector.js';
import { compressImage } from './compress.js';
import { gridRevision, postRevision } from '../src/post-revision.js';
import styles from './widget.css';
import grassLogo from '../public/favicon.svg';
import { MAX_ANALYSIS_PHOTOS, MAX_PHOTOS_PER_POST, MAX_PROFILE_POSTS } from '../src/analysis-limits.js';

const api = globalThis.browser || chrome;
let host, shadow, profile, currentUsername, busy = false, canceled = false, result = null, collapsed = false;
let sharedProfile, shareEnabled, shareCandidates = [], scanContext = 0;
const markers = new Map();
const changedPosts = new Set();
let historical = new Map();
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function message(data) { const response = await api.runtime.sendMessage(data); if (response?.error) throw new Error(response.error); return response; }

function shell(body) {
  shadow.innerHTML = `<style>${styles}</style>${collapsed
    ? `<button class="collapsed" id="expand" aria-label="Open Touch Grass"${sharedProfile?.posts?.length ? ' aria-describedby="shared-tooltip"' : ''}><span class="grass-logo">${grassLogo}</span>Touch Grass</button>${sharedProfile?.posts?.length ? `<div id="shared-tooltip" class="profile-tooltip" role="tooltip">${escape(sharedSummary())}</div>` : ''}`
    : `<div class="widget"><div class="widget-header"><span class="grass-logo" aria-hidden="true">${grassLogo}</span><span class="wordmark">Touch Grass</span><button class="close" id="collapse" aria-label="Collapse climate widget">×</button></div><div class="body">${body}</div><div class="foot"><button class="text-link" id="journal">My journal ↗</button></div></div>`}`;
  shadow.getElementById('collapse')?.addEventListener('click', () => { collapsed = true; render(); });
  shadow.getElementById('expand')?.addEventListener('click', () => { collapsed = false; render(); });
  shadow.getElementById('journal')?.addEventListener('click', () => message({ type: 'OPEN_JOURNAL' }).catch(showError));
  queueMicrotask(positionWidget);
}
function sharedSummary() {
  if (!sharedProfile?.posts?.length) return '';
  const count = sharedProfile.posts.length;
  return `${count} shared action${count === 1 ? '' : 's'}. ${sharedProfile.posts[0].action}`;
}

function render() {
  if (!shadow) return;
  if (result) return showResults(result);
  shell(`<h2>@${escape(currentUsername)}</h2>
    ${sharedSummary() ? `<p class="result-summary">${escape(sharedSummary())}</p><p class="duration">From their last share</p>` : ''}
    <p class="consent">New posts send compressed photos and captions to OpenRouter.</p>
    <button class="primary" id="analyze" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner"></span>Scan in progress…' : 'Scan up to 10 posts'}</button>
    <p class="duration">Max ${MAX_ANALYSIS_PHOTOS} photos total · up to ${MAX_PHOTOS_PER_POST} per post.</p>`);
  shadow.getElementById('analyze')?.addEventListener('click', analyze);
}

function updateMarkers() {
  const saved = new Map(historical);
  for (const [i, post] of (result?.posts || []).entries()) {
    saved.set(post.url, { post, finding: result.analysis.posts.find(finding => finding.index === i + 1) });
  }
  const active = new Set();
  if (profile) for (const tile of gridPosts(document, Infinity)) {
    const record = saved.get(tile.url);
    if (changedPosts.has(tile.url) || !record?.finding || record.finding.signal === 'notAnalyzed' || !record.post.gridRevision || record.post.gridRevision !== gridRevision(tile)) continue;
    active.add(tile.link);
    const label = `Last scan: ${record.finding.observation}`;
    let marker = markers.get(tile.link);
    if (!marker) {
      const element = document.createElement('touch-grass-scanned');
      element.style.cssText = 'position:absolute;top:8px;right:8px;z-index:1;pointer-events:none;';
      element.innerHTML = '<span style="display:grid;place-items:center;background:#d9f5a9;color:#163c28;width:24px;height:24px;border-radius:50%;font:bold 16px system-ui;box-shadow:0 1px 4px #0003">✓</span>';
      const originalPosition = tile.link.style.position;
      if (getComputedStyle(tile.link).position === 'static') tile.link.style.position = 'relative';
      tile.link.append(element);
      marker = { element, originalPosition };
      markers.set(tile.link, marker);
    }
    if (marker.element.getAttribute('aria-label') !== label) marker.element.setAttribute('aria-label', label);
    if (!marker.element.hasAttribute('role')) marker.element.setAttribute('role', 'img');
  }
  for (const [link, { element, originalPosition }] of markers) {
    if (active.has(link)) continue;
    element.remove();
    link.style.position = originalPosition;
    markers.delete(link);
  }
}

function showProgress(label, completed, total = 10) {
  if (collapsed) return render();
  shell(`<p aria-live="polite"><span class="spinner"></span>${escape(label)}</p><div class="progress"><i style="width:${Math.min(100, completed / total * 100)}%"></i></div><button class="secondary" id="cancel">Cancel collection</button>`);
  shadow.getElementById('cancel')?.addEventListener('click', () => { canceled = true; message({ type: 'CANCEL_CAPTURE' }).catch(() => {}); });
}
function showError(error) {
  if (!shadow) return;
  shell(`<p class="error" role="alert">${escape(error.message || error)}</p><button class="primary" id="retry">Try again</button>`);
  shadow.getElementById('retry')?.addEventListener('click', analyze);
}

async function analyze() {
  if (busy) return;
  busy = true;
  canceled = false;
  const context = scanContext;
  const username = currentUsername;
  const previous = result;
  const stillHere = () => {
    if (canceled || scanContext !== context || !host?.isConnected
      || location.pathname.replace(/\/$/, '').toLowerCase() !== `/${username.toLowerCase()}`) {
      throw new Error('Scan canceled.');
    }
  };
  try {
    showProgress('Checking scan settings…', 0);
    const health = await message({ type: 'HEALTH' });
    stillHere();
    shareEnabled = health.publisher === username.toLowerCase();
    if (health.community) {
      const shared = await message({ type: 'COMMUNITY_PROFILE', username }).catch(() => null);
      stillHere();
      if (shared) sharedProfile = shared.profile;
    }
    if (!health.configured && !sharedProfile?.posts?.length && !previous?.posts?.some(post => post.revision)) {
      throw new Error('Add OPENROUTER_API_KEY to .env, then restart npm run api.');
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(resolve => setTimeout(resolve, 350));
    stillHere();
    let posts = gridPosts(document);
    for (let i = 0; posts.length < MAX_PROFILE_POSTS && i < 4; i++) {
      showProgress(`Loading grid · ${posts.length} posts found…`, 0);
      window.scrollBy({ top: 700, behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 1000));
      stillHere();
      const seen = new Set(posts.map(post => post.url));
      posts = [...posts, ...gridPosts(document).filter(post => !seen.has(post.url))].slice(0, MAX_PROFILE_POSTS);
    }
    if (!posts.length) throw new Error('No accessible posts found on this profile.');
    const local = new Map(historical);
    for (const [i, post] of (previous?.posts || []).entries()) {
      local.set(post.url, { post, finding: previous.analysis.posts.find(finding => finding.index === i + 1) });
    }
    const shared = new Map((sharedProfile?.posts || []).map(post => [post.url, post]));
    const collected = [], findings = [], pending = [];
    let originalBytes = 0, compressedBytes = 0, photosCollected = 0, reused = 0;
    for (const [i, tile] of posts.entries()) {
      stillHere();
      showProgress(`Checking post ${i + 1} of ${posts.length}…`, i, posts.length);
      let data;
      const photoBudget = Math.min(MAX_PHOTOS_PER_POST, MAX_ANALYSIS_PHOTOS - photosCollected);
      try { data = await message({ type: 'COLLECT_POST', url: tile.url, maxPhotos: photoBudget }); }
      catch (e) { stillHere(); data = { caption: '', captionSource: 'missing', images: [], warnings: [e.message], isVideo: false }; }
      const revision = await postRevision({ ...data, images: data.images.slice(0, photoBudget) });
      stillHere();
      const saved = local.get(tile.url);
      const published = shared.get(tile.url);
      const images = [];
      const key = gridRevision(tile);
      let finding;
      if (revision && saved?.post.revision === revision && saved.finding && saved.finding.signal !== 'notAnalyzed' && !saved.post.stale) {
        finding = saved.finding;
      } else if (revision && published?.revision === revision) {
        finding = { observation: published.action, signal: 'supportive', evidence: 'Reviewed and shared by this profile owner.', confidence: 'high', fromCommunity: true };
      }
      if (revision && saved?.post.revision && saved.post.revision !== revision) {
        changedPosts.add(tile.url);
        updateMarkers();
      }
      if (finding) {
        findings[i] = { ...finding, index: i + 1 };
        reused++;
      }
      if (!finding || (shareEnabled && finding.signal === 'supportive' && published?.revision !== revision && !shareCandidates.some(post => post.revision === revision))) {
        if (!data.images.length && /^https:\/\//.test(tile.preview)) {
          data.images.push({ url: tile.preview });
          data.warnings.push('Used the grid cover because the post media was unavailable.');
        }
        if (data.images.length > photoBudget) data.warnings.push(`Only the first ${photoBudget} photos were included.`);
        for (const [j, photo] of data.images.slice(0, photoBudget).entries()) {
          stillHere();
          try {
            const raw = await message({ type: 'FETCH_IMAGE', url: photo.url });
            stillHere();
            const compressed = await compressImage(raw.dataUrl);
            originalBytes += raw.originalBytes;
            compressedBytes += Math.round(compressed.length * .75);
            images.push(compressed);
            photosCollected++;
          } catch (e) { stillHere(); data.warnings.push(`Photo ${j + 1}: ${e.message}`); }
        }
        if (!finding && (images.length || (data.caption && data.captionSource === 'post heading'))) pending.push(i);
      }
      collected.push({
        url: tile.url, revision: finding || (images.length > 0 && images.length === Math.min(photoBudget, data.images.length)) ? revision : null,
        gridRevision: key, caption: data.caption, captionSource: data.captionSource,
        publishedAt: data.publishedAt || null, publishedDate: data.publishedDate || null,
        dateSource: data.dateSource || 'unknown', images, warnings: data.warnings, isVideo: data.isVideo,
      });
    }
    stillHere();
    if (!pending.length && !reused) throw new Error('No photos or captions could be read. Check Instagram permissions.');
    let response;
    if (pending.length && health.configured) {
      const uploads = pending.map(i => collected[i]);
      showProgress(`Analyzing ${uploads.length} new or edited posts…`, posts.length, posts.length);
      shadow.getElementById('cancel')?.remove();
      const job = await message({ type: 'START_ANALYSIS', posts: uploads });
      for (let i = 0; i < 100; i++) {
        stillHere();
        const status = await message({ type: 'ANALYSIS_STATUS', id: job.id });
        if (status.state === 'done') { response = status.result; break; }
        if (status.state === 'error') throw new Error(status.error);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      stillHere();
      if (!response) throw new Error('Analysis took too long. OpenRouter may still finish the request.');
      for (const finding of response.analysis.posts) {
        const index = pending[finding.index - 1];
        findings[index] = { ...finding, index: index + 1 };
      }
    }
    const combined = collected.map((_, i) => findings[i] || {
      index: i + 1, signal: 'notAnalyzed', confidence: 'low', observation: 'No finding for this post.',
      evidence: health.configured ? 'The post could not be read.' : 'Set up OpenRouter to scan new or edited posts.',
    });
    const missingIndices = combined.filter(finding => finding.signal === 'notAnalyzed').map(finding => finding.index);
    const positive = combined.filter(finding => finding.signal === 'supportive');
    const analysis = {
      summary: !reused && response?.analysis.summary ? response.analysis.summary
        : positive.length ? positive[0].observation : 'No clear positive actions in the posts reviewed.',
      limitations: response?.analysis.limitations || 'These findings describe a limited sample of posts. Review the original posts for context.',
      posts: combined,
      coverage: { analyzedPosts: posts.length - missingIndices.length, expectedPosts: posts.length, missingIndices },
    };
    const coverage = {
      postsRequested: MAX_PROFILE_POSTS, postsRead: collected.filter(p => p.images.length || p.caption).length,
      postsFound: posts.length, photos: photosCollected, captions: collected.filter(p => p.caption).length,
      originalBytes, compressedBytes, reused,
      warnings: collected.flatMap((p, i) => p.warnings.map(w => `Post ${i + 1}: ${w}`)),
    };
    const next = {
      id: crypto.randomUUID(), username, analyzedAt: new Date().toISOString(), analysis,
      model: response?.model || previous?.model || null, coverage,
      posts: collected.map(({ images, ...post }) => ({ ...post, photoCount: images.length })),
    };
    try {
      await message({ type: 'SAVE_PROFILE', profile: next });
      next.savedToJournal = true;
    } catch {
      next.savedToJournal = false;
      next.coverage.warnings.push('The local journal could not be saved. You can retry below.');
    }
    stillHere();
    // Retain fresh photos only for an explicit, reviewed export on this page.
    const candidates = new Map(shareCandidates.map(post => [post.id, post]));
    shareCandidates = shareEnabled ? positive.flatMap(finding => {
      const post = collected[finding.index - 1];
      const [, kind, id] = /\/(p|reel)\/([\w-]+)\/$/.exec(post.url);
      if (!post.revision || shared.get(post.url)?.revision === post.revision) return [];
      const images = post.images.length ? post.images : candidates.get(id)?.revision === post.revision ? candidates.get(id).images : [];
      return images.length ? [{ id, revision: post.revision, action: finding.observation.slice(0, 600), isReel: kind === 'reel', publishedDate: post.publishedDate || post.publishedAt?.slice(0, 10) || null, images }] : [];
    }) : [];
    for (const [i, post] of next.posts.entries()) historical.set(post.url, { post, finding: combined[i] });
    result = next;
    changedPosts.clear();
    updateMarkers();
    showResults(result);
  } catch (e) {
    if (scanContext === context) {
      if (canceled) { busy = false; render(); }
      else showError(e);
    }
  } finally {
    busy = false;
    if (scanContext !== context && host) render();
  }
}

function showResults(data) {
  const { analysis, coverage } = data;
  const signalNames = { supportive: 'Positive signal', higherImpact: 'Gentle nudge', uncertain: 'Needs context', notRelevant: 'No clear signal', notAnalyzed: 'Not analysed' };
  const positive = analysis.posts.filter(post => post.signal === 'supportive').length;
  const nudge = analysis.posts.find(post => post.signal === 'higherImpact' && !data.posts[post.index - 1]?.stale);
  shell(`<h2>@${escape(data.username)}</h2><p class="result-summary">${escape(analysis.summary)}</p>
    <p class="positive-count">${positive} positive ${positive === 1 ? 'action' : 'actions'} spotted</p>
    ${nudge ? `<p class="nudge"><strong>One idea to try</strong> ${escape(nudge.observation)} <button class="text-link" id="plan">Plan a change privately ↗</button></p>` : ''}
    <div class="coverage">${coverage.postsRead}/${coverage.postsRequested} posts read · ${coverage.photos} photos · ${coverage.captions} captions${coverage.reused ? ` · ${coverage.reused} reused` : ''}</div>
    ${coverage.warnings.length ? `<p class="warnings">${coverage.warnings.length} collection notes. Some content may be missing.</p>` : ''}
    <button class="details-toggle" id="details" aria-expanded="false">View evidence & collection notes ↓</button>
    <div class="scroll" id="evidence" hidden>
      <div class="findings">${analysis.posts.map(p => {
        const source = data.posts[p.index - 1];
        return `<div class="finding"><strong>Post ${p.index}<span class="badge">${escape(signalNames[p.signal] || p.signal)}</span></strong><p>${source?.stale ? 'Edited since the last scan. ' : ''}${escape(p.observation)}</p><p>${escape(p.evidence)}</p><p><b>Published:</b> ${escape(source?.publishedDate || source?.publishedAt || 'Unknown')}</p><p><b>Caption:</b> ${escape(source?.caption || 'Unavailable')}</p><span class="confidence">${p.fromCommunity ? 'Shared by the profile owner' : `${escape(p.confidence)} model confidence`}</span><a href="${escape(source?.url)}" target="_blank" rel="noreferrer">Original post ↗</a></div>`;
      }).join('')}</div>
      ${coverage.warnings.map(w => `<p class="collection-note">${escape(w)}</p>`).join('')}
      <p class="limit-note">${escape(analysis.limitations)}</p>
      <p class="duration">${escape(data.model)} · ${escape(new Date(data.analyzedAt).toLocaleString())}<br>${Math.round(coverage.compressedBytes / 1024)} KB uploaded</p>
    </div>
    <div class="result-actions">${data.savedToJournal ? '<span class="saved-state" role="status">✓ Saved to journal</span>' : '<button class="secondary" id="save">Save to my private journal</button>'}<button class="refresh-button" id="again" aria-label="Scan for changes" title="Scan for changes">↻</button></div>
    ${shareCandidates.length ? '<button class="secondary" id="review-share">Review & share photos</button>' : ''}`);
  if (analysis.coverage?.missingIndices?.length) {
    const notice = document.createElement('p'); notice.className = 'warnings'; notice.setAttribute('role', 'status');
    notice.textContent = `Model findings: ${analysis.coverage.analyzedPosts} of ${analysis.coverage.expectedPosts} posts. Some posts still need a scan.`;
    shadow.getElementById('details')?.before(notice);
  }
  shadow.getElementById('details')?.addEventListener('click', e => { const area = shadow.getElementById('evidence'); area.hidden = !area.hidden; e.target.setAttribute('aria-expanded', String(!area.hidden)); e.target.textContent = area.hidden ? 'View evidence & collection notes ↓' : 'Hide evidence ↑'; positionWidget(); });
  shadow.getElementById('save')?.addEventListener('click', async e => {
    e.target.disabled = true;
    try {
      await message({ type: 'SAVE_PROFILE', profile: data }); data.savedToJournal = true;
      const state = document.createElement('span'); state.className = 'saved-state'; state.setAttribute('role', 'status'); state.textContent = '✓ Saved to journal'; e.target.replaceWith(state);
    } catch { e.target.disabled = false; e.target.textContent = 'Save failed. Try again.'; }
  });
  shadow.getElementById('plan')?.addEventListener('click', () => message({ type: 'OPEN_JOURNAL', view: 'plans' }).catch(showError));
  shadow.getElementById('again')?.addEventListener('click', analyze);
  shadow.getElementById('review-share')?.addEventListener('click', reviewShare);
  positionWidget();
}

function reviewShare() {
  const context = scanContext;
  shell(`<h2>Share to the community</h2>
    <p>Check the actions and photos you want to make public. Share posts you own and have permission to publish.</p>
    <form id="share-form" class="share-form">
      <div class="scroll">${shareCandidates.map((post, i) => `<fieldset><label><input type="checkbox" name="include" value="${i}"> Include this post</label>
        <textarea aria-label="Action for post ${i + 1}" maxlength="600" rows="2">${escape(post.action)}</textarea>
        <div class="share-photos">${post.images.map(image => `<img src="${escape(image)}" alt="Photo to share">`).join('')}</div>
      </fieldset>`).join('')}</div>
      <button class="primary">Publish selected posts</button>
      <button type="button" class="text-link" id="back">Back</button>
      <p role="status" id="share-status"></p>
    </form>`);
  shadow.getElementById('back').addEventListener('click', () => showResults(result));
  shadow.getElementById('share-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = shadow.getElementById('share-status');
    const descriptions = form.querySelectorAll('textarea');
    const posts = new FormData(form).getAll('include').map(index => ({
      ...shareCandidates[index], action: descriptions[index].value.trim(),
    }));
    if (!posts.length || posts.some(post => !post.action)) { status.textContent = 'Select at least one post and add an action for each selected post.'; return; }
    form.querySelector('.primary').disabled = true;
    try {
      await message({ type: 'SHARE_POSTS', username: currentUsername, posts });
      if (scanContext !== context) return;
      shareCandidates = shareCandidates.filter(post => !posts.some(shared => shared.id === post.id));
      showResults(result);
      const notice = document.createElement('p');
      notice.setAttribute('role', 'status');
      notice.textContent = 'Selected posts shared.';
      shadow.querySelector('.body').append(notice);
    } catch (e) {
      status.textContent = e.message;
      form.querySelector('.primary').disabled = false;
    }
  });
}

function positionWidget() {
  if (!host || !profile?.photo?.isConnected) return;
  const rect = profile.photo.getBoundingClientRect();
  // Prefer the space beside the photo, below its lower edge, without changing Instagram's layout.
  const width = collapsed && !sharedProfile ? 155 : Math.min(296, innerWidth - 24);
  const left = Math.max(12, Math.min(innerWidth - width - 12, rect.right + 14));
  host.style.width = `${width}px`; host.style.left = `${left}px`;
  const widgetHeight = shadow.querySelector('.widget')?.getBoundingClientRect().height || 320;
  host.style.top = `${Math.max(12, Math.min(innerHeight - Math.min(widgetHeight, innerHeight - 24) - 12, rect.top + 8))}px`;
  host.style.maxHeight = `${innerHeight - 24}px`; host.style.overflowY = 'auto'; host.style.scrollbarWidth = 'thin';
  host.style.display = rect.bottom < 0 && !busy ? 'none' : 'block';
}

let visibleCaption;
function verifyVisiblePost() {
  if (!/^\/(?:[\w.]+\/)?(?:p|reel)\/[\w-]+\/?$/.test(location.pathname)) {
    visibleCaption = null;
    return;
  }
  const caption = document.querySelector('main article h1')?.textContent?.trim().slice(0, 10000);
  if (!caption) return;
  const key = JSON.stringify([location.pathname, caption]);
  if (key === visibleCaption) return;
  visibleCaption = key;
  const code = location.pathname.split('/').filter(Boolean).at(-1);
  api.storage.local.get('evergreen:personal:v1').then(stored => {
    if (key !== visibleCaption) return;
    if (stored['evergreen:personal:v1']?.observedPosts?.some(post => post.id === `instagram:${code}` && post.revision && post.caption !== caption)) {
      return message({ type: 'VERIFY_VISIBLE_CAPTION', caption });
    }
  }).catch(() => {});
}

function mount() {
  verifyVisiblePost();
  const next = profileFromDocument(document, location.pathname);
  if (!next) { if (host) { canceled = true; message({ type: 'CANCEL_CAPTURE' }).catch(() => {}); host.remove(); host = null; profile = null; currentUsername = null; result = null; sharedProfile = null; shareCandidates = []; changedPosts.clear(); historical = new Map(); scanContext++; updateMarkers(); } return; }
  profile = next;
  if (host?.isConnected && currentUsername === next.username) { positionWidget(); updateMarkers(); return; }
  if (host) { canceled = true; host.remove(); message({ type: 'CANCEL_CAPTURE' }).catch(() => {}); }
  currentUsername = next.username; result = null; sharedProfile = null; shareEnabled = false; shareCandidates = []; changedPosts.clear(); historical = new Map(); scanContext++; updateMarkers(); collapsed = false;
  host = document.createElement('evergreen-profile-widget'); host.setAttribute('aria-label', 'Touch Grass climate profile insights');
  shadow = host.attachShadow({ mode: 'open' }); document.documentElement.append(host); render(); positionWidget();
  const context = scanContext;
  const username = currentUsername;
  api.storage.local.get('evergreen:personal:v1').then(stored => {
    if (scanContext !== context || busy) return;
    const journal = stored['evergreen:personal:v1'];
    historical = new Map((journal?.observedPosts || []).filter(post => post.username === username)
      .map(post => [post.url, { post, finding: post.finding }]));
    updateMarkers();
    const saved = journal?.observations?.find(p => p.username === username);
    if (saved) {
      result = { ...saved, savedToJournal: true };
      updateMarkers();
      render();
    }
  }).catch(() => {});
  message({ type: 'COMMUNITY_PROFILE', username }).then(shared => {
    if (scanContext !== context || busy || !shared.profile) return;
    sharedProfile = shared.profile;
    if (!result) {
      collapsed = true;
      render();
    }
  }).catch(() => {});
}
let pending = false;
const observer = new MutationObserver(mutations => {
  if (pending || mutations.every(m => m.target === host || host?.contains(m.target))) return;
  pending = true; setTimeout(() => { pending = false; mount(); }, 350);
});
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true, attributeFilter: ['src', 'alt', 'aria-label'] });
window.addEventListener('scroll', positionWidget, { passive: true }); window.addEventListener('resize', positionWidget);
api.storage.onChanged?.addListener((changes, area) => {
  const personal = changes['evergreen:personal:v1'];
  if (area !== 'local' || !personal || !currentUsername || busy) return;
  const journal = personal.newValue;
  historical = new Map((journal?.observedPosts || []).filter(post => post.username === currentUsername)
    .map(post => [post.url, { post, finding: post.finding }]));
  if (result && result.savedToJournal) {
    const saved = journal?.observations?.find(item => item.id === result.id);
    if (!saved || saved.posts.some((post, i) => post.stale && !result.posts[i]?.stale)) {
      result = saved || null;
      render();
    }
  }
  updateMarkers();
});
mount();
