// Turns a video title + publish date into { season, tournament }.
// CDL titles are fairly consistent ("CDL Major II Qualifiers | Day 1",
// "Call of Duty League Championship 2025 ..."), so regexes get us most of the
// way. Anything they miss can be fixed in site/data/overrides.json.

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const toNum = (s) => ROMAN[s.toLowerCase()] ?? Number(s);

// The CDL season starts around Nov/Dec and is named after the year it ends in.
export function seasonFor(title, publishedAt) {
  const m = title.match(/\b(20[2-3]\d)\b/);
  if (m) return Number(m[1]);
  const d = new Date(publishedAt);
  return d.getUTCMonth() >= 10 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

export function tournamentFor(title) {
  const major = title.match(/\bmajor\s*(\d|iv|v|i{1,3})\b/i);
  const stage = title.match(/\bstage\s*(\d)\b/i);
  const qual = /qualif/i.test(title);

  if (/\bchamp(ionship|ionships|s)?\b/i.test(title)) return 'Championship';
  if (major) return `Major ${toNum(major[1])} ${qual ? 'Qualifiers' : 'Tournament'}`;
  if (stage) return /\bmajor\b/i.test(title) ? `Stage ${stage[1]} Major` : `Stage ${stage[1]}`;
  if (/kick-?off|launch weekend/i.test(title)) return 'Kickoff';
  if (/\bminor\b/i.test(title)) return 'Minor';
  if (qual) return 'Qualifiers';
  return null;
}

export function classify(title, publishedAt) {
  return { season: seasonFor(title, publishedAt), tournament: tournamentFor(title) };
}
