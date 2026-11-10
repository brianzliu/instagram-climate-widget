import { profileFromDocument, gridPosts } from './collector.js';
import { compressImage } from './compress.js';
import styles from './widget.css';

const api = globalThis.browser || chrome;
let host, shadow, profile, currentUsername, busy = false, canceled = false, result = null, collapsed = false;
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function message(data) { const response = await api.runtime.sendMessage(data); if (response?.error) throw new Error(response.error); return response; }

function shell(body) {
  shadow.innerHTML = `<style>${styles}</style>${collapsed ? '<button class="collapsed" id="expand">↗ evergreen.</button>' : `<div class="widget"><div class="widget-header"><span class="leaf">♧</span><span class="wordmark">evergreen.</span><button class="close" id="collapse" aria-label="Collapse climate widget">×</button></div><div class="body">${body}</div><div class="foot"><button class="text-link" id="journal">My journal ↗</button></div></div>`}`;
  shadow.getElementById('collapse')?.addEventListener('click', () => { collapsed = true; render(); });
  shadow.getElementById('expand')?.addEventListener('click', () => { collapsed = false; render(); });
  shadow.getElementById('journal')?.addEventListener('click', () => message({ type: 'OPEN_JOURNAL' }).catch(showError));
  queueMicrotask(positionWidget);
}
function render() {
  if (!shadow) return;
  if (result) return showResults(result);
  shell(`<h2>@${escape(currentUsername)}</h2><p class="consent">Analyze sends compressed photos and captions to OpenRouter and your configured model provider. It opens temporary background tabs to read posts. No automatic sharing.</p><button class="primary" id="analyze" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner"></span>Analysis in progress…' : 'Analyze first 10 posts ↗'}</button><p class="duration">Pinned posts count. Video covers only. Usually 1–3 minutes.</p>`);
  shadow.getElementById('analyze')?.addEventListener('click', analyze);
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
  if (busy) return; busy = true; canceled = false; result = null;
  const username = currentUsername;
  const stillHere = () => { if (canceled || currentUsername !== username || !host?.isConnected) throw new Error('Collection canceled. No analysis was sent.'); };
  try {
    showProgress('Checking OpenRouter connection…', 0);
    const health = await message({ type: 'HEALTH' });
    if (!health.configured) throw new Error('Add OPENROUTER_API_KEY to .env, then restart npm run api.');
    stillHere();
    // Loading more of the grid does not navigate away from the profile.
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(resolve => setTimeout(resolve, 350)); stillHere();
    let posts = gridPosts(document);
    for (let i = 0; posts.length < 10 && i < 4; i++) {
      showProgress(`Loading profile grid · ${posts.length} posts found…`, 0);
      window.scrollBy({ top: 700, behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 1000)); stillHere();
      const seen = new Set(posts.map(p => p.url));
      posts = [...posts, ...gridPosts(document).filter(p => !seen.has(p.url))].slice(0, 10);
    }
    if (!posts.length) throw new Error('No accessible posts found. This may be a private profile, an empty grid, or a changed Instagram layout.');
    const collected = []; let originalBytes = 0, compressedBytes = 0;
    for (let i = 0; i < posts.length; i++) {
      stillHere(); showProgress(`Reading post ${i + 1} of ${posts.length}…`, i, posts.length);
      let data;
      try { data = await message({ type: 'COLLECT_POST', url: posts[i].url }); }
      catch (e) { stillHere(); data = { caption: '', captionSource: 'missing', images: [], warnings: [e.message], isVideo: false }; }
      if (!data.images.length && /^https:\/\//.test(posts[i].preview)) {
        data.images.push({ url: posts[i].preview });
        data.warnings.push('Using the grid cover because full post media was unavailable. Carousel coverage is incomplete.');
      }
      stillHere(); const images = [];
      for (const [j, photo] of data.images.entries()) {
        stillHere(); showProgress(`Compressing post ${i + 1} · photo ${j + 1} of ${data.images.length}…`, i + .5, posts.length);
        try { const raw = await message({ type: 'FETCH_IMAGE', url: photo.url }); stillHere(); const compressed = await compressImage(raw.dataUrl); originalBytes += raw.originalBytes; compressedBytes += Math.round(compressed.length * .75); images.push(compressed); }
        catch (e) { stillHere(); data.warnings.push(`Photo ${j + 1}: ${e.message}`); }
      }
      collected.push({ url: posts[i].url, caption: data.caption, captionSource: data.captionSource, images, warnings: data.warnings, isVideo: data.isVideo });
    }
    stillHere();
    if (!collected.some(p => p.images.length)) throw new Error('No photos could be read. Check Instagram media permissions in your browser.');
    showProgress(`Sending ${collected.reduce((n, p) => n + p.images.length, 0)} compressed photos to ${health.model}…`, posts.length, posts.length);
    // Cancellation is no longer offered after upload starts. The model request may incur a charge.
    shadow.getElementById('cancel')?.remove();
    const job = await message({ type: 'START_ANALYSIS', posts: collected });
    let response;
    for (let i = 0; i < 100; i++) {
      if (currentUsername !== username || canceled) return;
      const status = await message({ type: 'ANALYSIS_STATUS', id: job.id });
      if (status.state === 'done') { response = status.result; break; }
      if (status.state === 'error') throw new Error(status.error);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!response) throw new Error('Analysis took too long. The OpenRouter request may still finish on the backend.');
    if (currentUsername !== username || canceled) return;
    const coverage = { postsRequested: 10, postsFound: posts.length, postsRead: collected.filter(p => p.images.length || p.caption).length, photos: collected.reduce((n, p) => n + p.images.length, 0), captions: collected.filter(p => p.caption).length, originalBytes, compressedBytes, warnings: collected.flatMap((p, i) => p.warnings.map(w => `Post ${i + 1}: ${w}`)) };
    result = { id: crypto.randomUUID(), username, analyzedAt: new Date().toISOString(), analysis: response.analysis, model: response.model, usage: response.usage, coverage, posts: collected.map(({ images, ...post }) => ({ ...post, photoCount: images.length })) };
    // Source images are discarded after the request. Only text findings and coverage are retained in memory.
    showResults(result);
  } catch (e) { if (currentUsername === username) { if (canceled) { busy = false; render(); } else showError(e); } }
  finally { busy = false; if (currentUsername !== username && host) render(); }
}

function showResults(data) {
  const { analysis, coverage } = data;
  shell(`<h2>@${escape(data.username)}</h2><p>${escape(analysis.summary)}</p><div class="stats">${[['transport', 'Transport'], ['food', 'Food'], ['circular', 'Reuse & repair']].map(([id, label]) => { const c = analysis.categories[id]; return `<div class="stat"><strong>${c.supportive}</strong><span>${label}</span><small>${c.higherImpact} higher-impact<br />${c.uncertain} uncertain</small></div>`; }).join('')}</div><div class="coverage">${coverage.postsRead}/${coverage.postsRequested} posts read · ${coverage.photos} photos · ${coverage.captions} captions<br />${Math.round(coverage.compressedBytes / 1024)} KB uploaded${coverage.originalBytes ? ` · ${Math.round((1 - coverage.compressedBytes / coverage.originalBytes) * 100)}% smaller` : ''}</div>${coverage.warnings.length ? `<div class="warnings">${coverage.warnings.length} collection notes. Some content may be missing.</div>` : ''}<button class="details-toggle" id="details" aria-expanded="false">View evidence & collection notes ↓</button><div class="scroll" id="evidence" hidden><div class="findings">${analysis.posts.map(p => `<div class="finding"><strong>Post ${p.index}<span class="badge">${escape(p.signal)}</span><span class="badge">${escape(p.confidence)} confidence</span></strong><p>${escape(p.observation)}</p><p>${escape(p.evidence)}</p><p><b>Caption:</b> ${escape(data.posts[p.index - 1]?.caption || 'Unavailable')}</p><a href="${escape(data.posts[p.index - 1]?.url)}" target="_blank" rel="noreferrer">View original post ↗</a></div>`).join('')}</div>${coverage.warnings.map(w => `<p>${escape(w)}</p>`).join('')}<p class="limit-note">${escape(analysis.limitations)}</p><p class="duration">${escape(data.model)} · ${escape(new Date(data.analyzedAt).toLocaleString())}</p></div><button class="primary" id="save">Save to my private journal</button><button class="secondary" id="again">Analyze again</button>`);
  shadow.getElementById('details')?.addEventListener('click', e => { const area = shadow.getElementById('evidence'); area.hidden = !area.hidden; e.target.setAttribute('aria-expanded', String(!area.hidden)); e.target.textContent = area.hidden ? 'View evidence & collection notes ↓' : 'Hide evidence ↑'; positionWidget(); });
  shadow.getElementById('save')?.addEventListener('click', async e => { e.target.disabled = true; try { await message({ type: 'SAVE_PROFILE', profile: data }); e.target.textContent = '✓ Saved to your private journal'; } catch (error) { e.target.disabled = false; e.target.textContent = 'Save failed. Try again.'; } });
  shadow.getElementById('again')?.addEventListener('click', () => { result = null; render(); });
  positionWidget();
}

function positionWidget() {
  if (!host || !profile?.photo?.isConnected) return;
  const rect = profile.photo.getBoundingClientRect();
  // Prefer the space beside the photo, below its lower edge, without changing Instagram's layout.
  const width = collapsed ? 132 : Math.min(286, innerWidth - 24);
  const left = Math.max(12, Math.min(innerWidth - width - 12, rect.right + 14));
  host.style.width = `${width}px`; host.style.left = `${left}px`;
  const widgetHeight = shadow.querySelector('.widget')?.getBoundingClientRect().height || 320;
  host.style.top = `${Math.max(12, Math.min(innerHeight - Math.min(widgetHeight, innerHeight - 24) - 12, rect.top + 8))}px`;
  host.style.maxHeight = `${innerHeight - 24}px`; host.style.overflowY = 'auto'; host.style.scrollbarWidth = 'thin';
  host.style.display = rect.bottom < 0 && !busy ? 'none' : 'block';
}

function mount() {
  const next = profileFromDocument(document, location.pathname);
  if (!next) { if (host) { canceled = true; message({ type: 'CANCEL_CAPTURE' }).catch(() => {}); host.remove(); host = null; profile = null; currentUsername = null; result = null; } return; }
  profile = next;
  if (host?.isConnected && currentUsername === next.username) { positionWidget(); return; }
  if (host) { canceled = true; host.remove(); message({ type: 'CANCEL_CAPTURE' }).catch(() => {}); }
  currentUsername = next.username; result = null; collapsed = false;
  host = document.createElement('evergreen-profile-widget'); host.setAttribute('aria-label', 'Evergreen climate profile insights');
  shadow = host.attachShadow({ mode: 'open' }); document.documentElement.append(host); render(); positionWidget();
  const mountedUsername = currentUsername;
  api.storage.local.get('evergreen:personal:v1').then(stored => {
    if (currentUsername !== mountedUsername || busy || !host?.isConnected) return;
    const saved = stored['evergreen:personal:v1']?.observations?.find(p => p.username === mountedUsername);
    if (saved) { result = saved; showResults(saved); }
  }).catch(() => {});
}
let pending = false;
const observer = new MutationObserver(mutations => {
  if (pending || mutations.every(m => m.target === host || host?.contains(m.target))) return;
  pending = true; setTimeout(() => { pending = false; mount(); }, 350);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('scroll', positionWidget, { passive: true }); window.addEventListener('resize', positionWidget);
mount();
