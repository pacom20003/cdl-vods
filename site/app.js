const DATA_URL = 'data/videos.json';
const REFRESH_MS = 2 * 60 * 1000;
const FULL_BROADCAST_SECS = 45 * 60;

const state = { data: null, season: null, query: '', fullOnly: false };
const $ = (id) => document.getElementById(id);

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateOf = (v) => v.actualStart || v.scheduledStart || v.publishedAt;
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function fmtDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function card(v) {
  const badge =
    v.status === 'live' ? '<span class="badge live">LIVE</span>' :
    v.status === 'upcoming' ? '<span class="badge upcoming">UPCOMING</span>' :
    v.duration ? `<span class="badge">${fmtDuration(v.duration)}</span>` : '';
  const when = v.status === 'upcoming' && v.scheduledStart ? `Starts ${fmtDateTime(v.scheduledStart)}` : fmtDate(dateOf(v));
  return `<a class="card" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
    <div class="thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="">${badge}</div>
    <div class="info"><div class="t">${esc(v.title)}</div><div class="d">${when}</div></div>
  </a>`;
}

function matches(v) {
  if (state.query && !v.title.toLowerCase().includes(state.query)) return false;
  if (state.fullOnly && !(v.stream || v.duration >= FULL_BROADCAST_SECS)) return false;
  return true;
}

function render() {
  const videos = state.data.videos.filter((v) => !v.hidden);

  const live = videos.filter((v) => v.status === 'live');
  $('live').hidden = !live.length;
  $('live-grid').innerHTML = live.map(card).join('');

  const upcoming = videos.filter((v) => v.status === 'upcoming')
    .sort((a, b) => (a.scheduledStart || '').localeCompare(b.scheduledStart || ''));
  $('upcoming').hidden = !upcoming.length;
  $('upcoming-grid').innerHTML = upcoming.map(card).join('');

  // Season tabs
  const seasons = [...new Set(videos.map((v) => v.season))].sort((a, b) => b - a);
  if (!seasons.includes(state.season)) state.season = seasons[0];
  $('seasons').innerHTML = seasons
    .map((s) => `<button role="tab" data-season="${s}" aria-selected="${s === state.season}">${s} season</button>`)
    .join('');

  // Tournaments within the season, newest event first; untagged videos last.
  const groups = new Map();
  for (const v of videos) {
    if (v.season !== state.season || v.status === 'upcoming' || !matches(v)) continue;
    const key = v.tournament || 'Other videos';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  const ordered = [...groups.entries()]
    .map(([name, vids]) => {
      vids.sort((a, b) => dateOf(a).localeCompare(dateOf(b))); // chronological within an event
      return { name, vids, start: dateOf(vids[0]), end: dateOf(vids[vids.length - 1]) };
    })
    .sort((a, b) => (a.name === 'Other videos') - (b.name === 'Other videos') || b.start.localeCompare(a.start));

  const openAll = !!state.query;
  $('tournaments').innerHTML = ordered
    .map((g, i) => {
      const range = fmtDate(g.start) === fmtDate(g.end) ? fmtDate(g.start) : `${fmtDate(g.start)} – ${fmtDate(g.end)}`;
      const isLive = g.vids.some((v) => v.status === 'live');
      return `<details class="tournament" ${openAll || i === 0 || isLive ? 'open' : ''}>
        <summary><span class="title">${esc(g.name)}${isLive ? ' 🔴' : ''}</span>
          <span class="meta">${range} · ${g.vids.length} video${g.vids.length === 1 ? '' : 's'}</span></summary>
        <div class="grid">${g.vids.map(card).join('')}</div>
      </details>`;
    })
    .join('');
  $('empty').hidden = ordered.length > 0;

  $('updated').textContent = state.data.updatedAt ? `Last updated ${new Date(state.data.updatedAt).toLocaleString()}` : '';
}

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
    if (!state.data) $('tournaments').innerHTML = '<p class="muted">Could not load video data.</p>';
  }
}

$('seasons').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-season]');
  if (!b) return;
  state.season = Number(b.dataset.season);
  render();
});
$('search').addEventListener('input', (e) => {
  state.query = e.target.value.trim().toLowerCase();
  if (state.data) render();
});
$('full-only').addEventListener('change', (e) => {
  state.fullOnly = e.target.checked;
  if (state.data) render();
});

load();
setInterval(load, REFRESH_MS);
