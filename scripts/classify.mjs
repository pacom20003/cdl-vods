// Turns a video into { season, tournament, kind }.
// CDL titles are fairly consistent ("CDL Major II Qualifiers | Day 1",
// "Call of Duty League Championship 2025 ..."), so regexes get us most of the
// way. Anything they miss can be fixed in site/data/overrides.json.

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const toNum = (s) => ROMAN[s.toLowerCase()] ?? Number(s);

// ---------------------------------------------------------------------------
// Season
//
// The franchised CDL season is named after the year it ENDS in, but content
// (preseason, roster reveals, Kickoff/qualifiers) starts in the fall of the
// prior year — sometimes October, sometimes November/December. So a fixed
// "Nov/Dec -> next year" rule is wrong. Instead we bucket by publish date
// against an explicit, editable table of season-start cutovers.
//
// Each `start` is the offseason -> new-season cutover we assign to that season
// (set to mid-October so fall preseason rolls into the upcoming season). The
// comment is the official competition start date for reference; nudge a `start`
// here if a video lands in the wrong season.
const SEASON_STARTS = [
  { season: 2020, start: '2019-10-01' }, // inaugural season began Jan 24, 2020
  { season: 2021, start: '2020-10-01' }, // Kickoff Classic ~Feb 2021
  { season: 2022, start: '2021-10-01' }, // Kickoff Classic Jan 21, 2022
  { season: 2023, start: '2022-10-01' }, // season began Dec 2, 2022
  { season: 2024, start: '2023-10-01' }, // season began Dec 8, 2023
  { season: 2025, start: '2024-10-01' }, // season began Dec 6, 2024
  { season: 2026, start: '2025-10-01' }, // season began Dec 5, 2025
  { season: 2027, start: '2026-10-01' }, // season began Dec 4, 2026
];

export function seasonFor(title, publishedAt) {
  const iso = (publishedAt || '').slice(0, 10);
  for (let i = SEASON_STARTS.length - 1; i >= 0; i--) {
    if (iso >= SEASON_STARTS[i].start) return SEASON_STARTS[i].season;
  }
  // Pre-franchise content (CWL / MLG era): group by calendar year.
  return new Date(publishedAt).getUTCFullYear();
}

// ---------------------------------------------------------------------------
// Tournament
export function tournamentFor(title) {
  const major = title.match(/\bmajor\s*(\d|iv|v|i{1,3})\b/i);
  const stage = title.match(/\bstage\s*(\d|iv|v|i{1,3})\b/i);
  const qual = /qualif/i.test(title);

  // EWC multiplayer broadcasts carried on the CDL channel get their own row.
  if (/esports world cup|\bewc\b/i.test(title)) return 'Esports World Cup';
  if (/\bchamp(ionship|ionships|s)?\b/i.test(title)) return 'Championship';
  if (major) return `Major ${toNum(major[1])} ${qual ? 'Qualifiers' : 'Tournament'}`;
  if (stage) return /\bmajor\b/i.test(title) ? `Stage ${toNum(stage[1])} Major` : `Stage ${toNum(stage[1])}`;
  if (/\bhome series\b/i.test(title)) return 'Home Series';
  if (/opening weekend/i.test(title)) return 'Opening Weekend';
  if (/kick-?off|launch weekend/i.test(title)) return 'Kickoff';
  if (/\bminor\b/i.test(title)) return 'Minor';
  if (qual) return 'Qualifiers';
  return null;
}

// ---------------------------------------------------------------------------
// Content type
//
// Distinguishes real competition footage from highlights, shows and Shorts so
// the site can filter and lead with matches. Signals: duration, the `stream`
// flag (it was a live broadcast), team-vs-team titles, and show/segment words.
// Note: the YouTube API can't definitively flag a Short, so <=60s is a proxy.
const SHOW_RE = new RegExp(
  '\\b(' +
  [
    'the scope', 'esports? report', 'contesting the point', 'comms check',
    "mic'?d up", 'press conference', 'interview', 'post.?game', 'top \\d+',
    'play of the game', "fans'? choice", 'listen.?in', 'breakdown', 'preview',
    'recap', 'cast off', 'blackout after dark', 'best of', 'all.?access',
    'trailer', 'announcement', 'reveal', 'teaser', 'road to',
    'behind the scenes', 'moments', 'funniest', 'highlights?', 'power ranking',
  ].join('|') +
  ')\\b', 'i');
const MATCH_RE = /\bvs\.?\b|@\w+\s+vs/i;

export function kindFor(title, duration = 0, stream = false) {
  if (duration && duration <= 60) return 'short';
  if (SHOW_RE.test(title)) return 'show';
  if (MATCH_RE.test(title) && duration >= 600) return 'match';
  if (stream || duration >= 7200 || /\bday\s*\d+\b|alpha stream|bravo stream/i.test(title)) return 'broadcast';
  if (duration >= 2700) return 'broadcast';
  return 'clip';
}

// ---------------------------------------------------------------------------
export function classify(v) {
  const date = v.actualStart || v.publishedAt;
  return {
    season: seasonFor(v.title, date),
    tournament: tournamentFor(v.title),
    kind: kindFor(v.title, v.duration || 0, !!v.stream),
  };
}
