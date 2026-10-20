const DATA_URL = 'data/videos.json';
const REFRESH_MS = 2 * 60 * 1000;
const MAX_PER_ROW = 30;

// Content-type filter chips (single-select). `k` matches video.kind; null = all.
const KINDS = [
  { id: 'all', k: null, label: 'All' },
  { id: 'match', k: 'match', label: 'Matches' },
  { id: 'broadcast', k: 'broadcast', label: 'Full broadcasts' },
  { id: 'show', k: 'show', label: 'Shows & interviews' },
  { id: 'clip', k: 'clip', label: 'Clips' },
  { id: 'short', k: 'short', label: 'Shorts' },
];

const state = { data: null, season: null, query: '', kind: 'all', expanded: new Set() };
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dateOf = (v) => v.actualStart || v.scheduledStart || v.publishedAt;
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const watch = (id) => `https://www.youtube.com/watch?v=${id}`;

function fmtDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const PLAY = '<span class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';

function card(v) {
  const badge =
    v.status === 'live' ? '<span class="badge live">LIVE</span>' :
    v.status === 'upcoming' ? '<span class="badge upcoming">UPCOMING</span>' :
    v.duration ? `<span class="badge">${fmtDuration(v.duration)}</span>` : '';
  const tag = v.kind ? `<span class="kind-tag ${v.kind}">${v.kind}</span>` : '';
  const when = v.status === 'upcoming' && v.scheduledStart ? `Starts ${fmtDateTime(v.scheduledStart)}` : fmtDate(dateOf(v));
  return `<a class="card" href="${watch(v.id)}" target="_blank" rel="noopener">
    <div class="thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="">${tag}${badge}${PLAY}</div>
    <div class="info"><div class="t">${esc(v.title)}</div><div class="d">${when}</div></div>
  </a>`;
}

function matches(v) {
  if (state.query && !v.title.toLowerCase().includes(state.query)) return false;
  const kind = KINDS.find((k) => k.id === state.kind);
  if (kind && kind.k && v.kind !== kind.k) return false;
  return true;
}

function channelUrl() {
  const h = (state.data && state.data.channel && state.data.channel.handle) || '@CODLeague';
  return `https://www.youtube.com/${h}`;
}

function updateLiveLink(live) {
  const el = $('live-link');
  if (live.length) {
    el.href = watch(live[0].id);
    el.innerHTML = '<span class="live-ind"></span> Watch live';
    el.classList.add('is-live');
  } else {
    el.href = channelUrl();
    el.textContent = 'YouTube ↗';
    el.classList.remove('is-live');
  }
}

function heroHTML(v, isLive) {
  const eyebrow = isLive
    ? '<span class="live-chip"><span class="live-ind"></span> LIVE NOW</span>'
    : esc(v.tournament || 'Featured');
  const bits = [v.tournament, `${v.season} season`, fmtDate(dateOf(v))];
  if (v.duration && !isLive) bits.push(fmtDuration(v.duration));
  const meta = bits.filter(Boolean).map((b, i) => (i === 0 ? `<b>${esc(String(b))}</b>` : esc(String(b)))).join(' · ');
  const img = `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`;
  const fb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  return `
    <div class="hero-bg"><img src="${img}" alt="" onerror="this.onerror=null;this.src='${fb}'"></div>
    <div class="hero-body">
      <div class="hero-eyebrow">${eyebrow}</div>
      <h2>${esc(v.title)}</h2>
      <div class="hero-meta">${meta}</div>
      <a class="hero-cta" href="${watch(v.id)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        ${isLive ? 'Watch live' : 'Watch on YouTube'}
      </a>
    </div>`;
}

const ARROWS = (key) => `
  <button class="arrow left" data-scroll="-1" data-key="${key}" aria-label="Scroll left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
  <button class="arrow right" data-scroll="1" data-key="${key}" aria-label="Scroll right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>`;

function rowHTML(g) {
  const range = fmtDate(g.oldest) === fmtDate(g.newest) ? fmtDate(g.newest) : `${fmtDate(g.oldest)} – ${fmtDate(g.newest)}`;
  const isLive = g.vids.some((v) => v.status === 'live');
  const expanded = state.expanded.has(g.key);
  const shown = expanded ? g.vids : g.vids.slice(0, MAX_PER_ROW);
  const hidden = g.vids.length - shown.length;
  const more = hidden > 0
    ? `<div class="more" data-expand="${g.key}"><span class="big">+${hidden}</span><span>View all ${g.vids.length}</span></div>`
    : '';
  return `<section class="row" data-key="${g.key}">
    <div class="row-head">
      <div class="row-title">${isLive ? '<span class="live-dot"></span>' : ''}${esc(g.name)}</div>
      <div class="row-meta${isLive ? ' accent' : ''}">${range} · ${g.vids.length} video${g.vids.length === 1 ? '' : 's'}</div>
    </div>
    <div class="track-wrap">
      ${ARROWS(g.key)}
      <div class="track" data-track="${g.key}">${shown.map(card).join('')}${more}</div>
    </div>
  </section>`;
}

function buildGroups(videos) {
  const groups = new Map();
  for (const v of videos) {
    const key = v.tournament || 'Other videos';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  return [...groups.entries()]
    .map(([name, vids]) => {
      vids.sort((a, b) => dateOf(b).localeCompare(dateOf(a))); // newest first
      return { key: name.replace(/\s+/g, '-'), name, vids, oldest: dateOf(vids[vids.length - 1]), newest: dateOf(vids[0]) };
    })
    .sort((a, b) => (a.name === 'Other videos') - (b.name === 'Other videos') || b.newest.localeCompare(a.newest));
}

function render() {
  const all = state.data.videos.filter((v) => !v.hidden);
  const live = all.filter((v) => v.status === 'live');
  updateLiveLink(live);

  // Season tabs
  const seasons = [...new Set(all.map((v) => v.season))].sort((a, b) => b - a);
  if (!seasons.includes(state.season)) {
    // Default to the newest season that actually has match/broadcast content.
    state.season = seasons.find((s) => all.some((v) => v.season === s && v.status === 'none' && (v.kind === 'match' || v.kind === 'broadcast'))) || seasons[0];
  }
  $('seasons').innerHTML = seasons
    .map((s) => `<button role="tab" data-season="${s}" aria-selected="${s === state.season}">${s}</button>`)
    .join('');

  // Content-type chips with per-season counts
  const seasonVids = all.filter((v) => v.season === state.season && v.status === 'none' && (!state.query || v.title.toLowerCase().includes(state.query)));
  const counts = seasonVids.reduce((m, v) => ((m[v.kind] = (m[v.kind] || 0) + 1), m), {});
  // If the selected type has nothing in this season, fall back to All.
  const sel = KINDS.find((k) => k.id === state.kind);
  if (sel && sel.k && !counts[sel.k]) state.kind = 'all';
  $('kinds').innerHTML = KINDS
    .filter((k) => !k.k || counts[k.k])
    .map((k) => {
      const n = k.k ? counts[k.k] : seasonVids.length;
      return `<button data-kind="${k.id}" aria-pressed="${k.id === state.kind}">${k.label}<span class="k-count">${n}</span></button>`;
    })
    .join('');

  // Hero: live first, else newest match/broadcast of the season
  const hero = $('hero');
  if (!state.query) {
    const seasonAll = all.filter((v) => v.season === state.season && v.status === 'none');
    const featured = live[0]
      || seasonAll.filter((v) => v.kind === 'match' || v.kind === 'broadcast').sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0]
      || seasonAll.sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];
    if (featured) { hero.innerHTML = heroHTML(featured, featured.status === 'live'); hero.hidden = false; }
    else hero.hidden = true;
  } else hero.hidden = true;

  // Special rows: live + upcoming (across all seasons)
  const special = [];
  if (live.length) special.push({ key: 'live-now', name: 'Live now', vids: [...live], oldest: dateOf(live[0]), newest: dateOf(live[0]) });
  const upcoming = all.filter((v) => v.status === 'upcoming').sort((a, b) => (a.scheduledStart || '').localeCompare(b.scheduledStart || ''));
  if (upcoming.length) special.push({ key: 'upcoming', name: 'Upcoming streams', vids: upcoming, oldest: dateOf(upcoming[0]), newest: dateOf(upcoming[upcoming.length - 1]) });

  // Tournament rows for the selected season
  const seasonFiltered = all.filter((v) => v.season === state.season && v.status === 'none' && matches(v));
  const rows = [...special, ...buildGroups(seasonFiltered)];

  $('rows').innerHTML = rows.map(rowHTML).join('');
  $('loading').hidden = true;
  $('empty').hidden = rows.length > 0;
  $('updated').textContent = state.data.updatedAt ? `Updated ${new Date(state.data.updatedAt).toLocaleString()}` : '';

  wireRows();
}

/* Scroll arrows + reveal-on-scroll */
let observer;
function wireRows() {
  document.querySelectorAll('.track').forEach((track) => {
    const wrap = track.closest('.track-wrap');
    const upd = () => {
      const l = wrap.querySelector('.arrow.left'), r = wrap.querySelector('.arrow.right');
      if (l) l.disabled = track.scrollLeft < 8;
      if (r) r.disabled = track.scrollLeft > track.scrollWidth - track.clientWidth - 8;
    };
    track.addEventListener('scroll', upd, { passive: true });
    upd();
  });

  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); }
  }, { rootMargin: '0px 0px -6% 0px' });
  // Reveal rows already in view immediately; animate the rest on scroll.
  document.querySelectorAll('.row').forEach((r, i) => {
    if (i < 3 || r.getBoundingClientRect().top < window.innerHeight * 1.05) r.classList.add('in');
    else observer.observe(r);
  });
}

/* Events */
$('rows').addEventListener('click', (e) => {
  const arrow = e.target.closest('.arrow');
  if (arrow) {
    const track = document.querySelector(`[data-track="${CSS.escape(arrow.dataset.key)}"]`);
    track.scrollBy({ left: Number(arrow.dataset.scroll) * track.clientWidth * 0.9, behavior: 'smooth' });
    return;
  }
  const more = e.target.closest('.more');
  if (more) { state.expanded.add(more.dataset.expand); render(); }
});
$('seasons').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-season]');
  if (!b) return;
  state.season = Number(b.dataset.season);
  state.expanded.clear();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('kinds').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (!b) return;
  state.kind = b.dataset.kind;
  render();
});
$('search').addEventListener('input', (e) => {
  state.query = e.target.value.trim().toLowerCase();
  if (state.data) render();
});

async function load() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (state.data && data.updatedAt === state.data.updatedAt) return;
    state.data = data;
    render();
  } catch (err) {
    console.error('Failed to load videos', err);
    if (!state.data) { $('loading').hidden = true; $('empty').hidden = false; $('empty').textContent = 'Could not load video data.'; }
  }
}

load();
setInterval(load, REFRESH_MS);
