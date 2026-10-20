// Pulls videos from the CDL YouTube channel and writes site/data/videos.json.
//
// Uses the YouTube Data API v3 (needs YT_API_KEY). Cost per run is tiny:
// the uploads playlist is read page by page (1 quota unit each) and only until
// we hit videos we already have, then videos.list (1 unit per 50 videos)
// refreshes new videos plus anything that was live/upcoming last time.
//
// Env:
//   YT_API_KEY      required
//   CHANNEL_HANDLE  default "@CDL"
//   FULL_SYNC=1     re-read the whole uploads playlist (backfill / repair)
//   API_BASE        override for testing

import { readFile, writeFile } from 'node:fs/promises';
import { classify } from './classify.mjs';

const KEY = process.env.YT_API_KEY;
const HANDLE = process.env.CHANNEL_HANDLE || '@CDL';
const FULL_SYNC = process.env.FULL_SYNC === '1' || process.env.FULL_SYNC === 'true';
const API = process.env.API_BASE || 'https://www.googleapis.com/youtube/v3';
const DATA = new URL('../site/data/videos.json', import.meta.url);
const OVERRIDES = new URL('../site/data/overrides.json', import.meta.url);

if (!KEY) {
  console.error('YT_API_KEY is not set');
  process.exit(1);
}

async function api(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return fallback;
  }
}

// ISO 8601 duration ("PT2H13M5S") -> seconds
function seconds(iso = '') {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

async function main() {
  const existing = await readJson(DATA, { videos: [] });
  const overrides = await readJson(OVERRIDES, {});
  const byId = new Map(existing.videos.map((v) => [v.id, v]));

  const ch = await api('channels', { part: 'snippet,contentDetails', forHandle: HANDLE });
  const channel = ch.items?.[0];
  if (!channel) throw new Error(`No channel found for handle ${HANDLE}`);
  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  console.log(`Channel: ${channel.snippet.title} (${channel.id})`);

  // 1. Walk the uploads playlist (newest first) until we reach known videos.
  const seen = new Set();
  let pageToken;
  let pages = 0;
  do {
    const page = await api('playlistItems', {
      part: 'contentDetails',
      playlistId: uploads,
      maxResults: 50,
      ...(pageToken && { pageToken }),
    });
    pages++;
    const ids = page.items.map((i) => i.contentDetails.videoId);
    ids.forEach((id) => seen.add(id));
    const reachedKnown = ids.some((id) => byId.has(id));
    pageToken = page.nextPageToken;
    if (reachedKnown && !FULL_SYNC) break;
  } while (pageToken);
  console.log(`Read ${pages} playlist page(s), ${seen.size} video id(s)`);

  // 2. Fetch details for new videos and anything whose live state may have changed.
  const toFetch = new Set([...seen].filter((id) => !byId.has(id)));
  for (const v of existing.videos) if (v.status !== 'none') toFetch.add(v.id);
  if (FULL_SYNC) seen.forEach((id) => toFetch.add(id));

  const fetched = new Set();
  const ids = [...toFetch];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await api('videos', {
      part: 'snippet,contentDetails,liveStreamingDetails',
      id: ids.slice(i, i + 50).join(','),
      maxResults: 50,
    });
    for (const item of res.items) {
      const live = item.liveStreamingDetails || {};
      fetched.add(item.id);
      byId.set(item.id, {
        id: item.id,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        status: item.snippet.liveBroadcastContent, // "live" | "upcoming" | "none"
        duration: seconds(item.contentDetails.duration),
        ...(live.scheduledStartTime && { scheduledStart: live.scheduledStartTime }),
        ...(live.actualStartTime && { actualStart: live.actualStartTime }),
        ...(live.actualStartTime || live.scheduledStartTime ? { stream: true } : {}),
      });
    }
  }
  // Fetched-but-missing means deleted, private or a cancelled stream.
  for (const id of toFetch) if (!fetched.has(id)) byId.delete(id);
  console.log(`Refreshed ${fetched.size} video(s), dropped ${toFetch.size - fetched.size}`);

  // 3. Classify (always re-run so rule/override changes apply to old videos).
  const videos = [...byId.values()]
    .map((v) => {
      const o = overrides[v.id] || {};
      return { ...v, ...classify(v.title, v.actualStart || v.publishedAt), ...o };
    })
    .sort((a, b) => (b.actualStart || b.publishedAt).localeCompare(a.actualStart || a.publishedAt));

  const out = {
    channel: { id: channel.id, title: channel.snippet.title, handle: HANDLE },
    videos,
  };
  const before = JSON.stringify({ channel: existing.channel, videos: existing.videos });
  if (JSON.stringify(out) === before) {
    console.log('No changes');
    return;
  }
  await writeFile(DATA, JSON.stringify({ updatedAt: new Date().toISOString(), ...out }, null, 1) + '\n');
  console.log(`Wrote ${videos.length} videos (${videos.filter((v) => v.status === 'live').length} live)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
