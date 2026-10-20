# CDL VOD Archive

A static site listing every Call of Duty League broadcast on the official YouTube
channel, grouped by **season → tournament**, with a **Live now** and **Upcoming**
section. A GitHub Action refreshes the data every 15 minutes and redeploys to
GitHub Pages; open pages also re-check for new data every 2 minutes.

## How it works

```
GitHub Actions (every 15 min)
  └─ scripts/update.mjs ── YouTube Data API v3 ──▶ site/data/videos.json (committed)
       └─ deploy site/ to GitHub Pages
Browser
  └─ site/app.js loads data/videos.json, groups by season/tournament
```

- **Videos** come from the channel's uploads playlist, which includes past VODs,
  current live streams and scheduled (upcoming) streams.
- **Incremental:** each run reads only the newest page(s) until it hits known
  videos, then re-checks anything that was live/upcoming so it becomes a VOD
  with its full length. A normal run costs ~3 API quota units (free limit: 10,000/day).
- **Tournaments** are derived from titles (`scripts/classify.mjs`): Kickoff,
  Major N Qualifiers, Major N Tournament, Championship, older "Stage N" events.
  Anything unmatched shows under "Other videos".

## Setup

1. **Get a YouTube API key:** [Google Cloud Console](https://console.cloud.google.com/)
   → create a project → enable *YouTube Data API v3* → Credentials → *Create API key*
   (restrict it to the YouTube Data API).
2. **Push this repo to GitHub.**
3. **Add the key:** repo *Settings → Secrets and variables → Actions → New repository secret*,
   name `YT_API_KEY`.
4. **Enable Pages:** *Settings → Pages → Source: GitHub Actions*.
5. **First backfill:** *Actions → Update videos and deploy → Run workflow*, tick
   *full sync*. After that the schedule keeps it current.

Optional: set a repository **variable** `CHANNEL_HANDLE` to use a channel other than `@CODLeague` (the official Call of Duty League channel).

## Fixing misclassified videos

Edit `site/data/overrides.json`, keyed by YouTube video ID:

```json
{
  "dQw4w9WgXcQ": { "tournament": "Major 3 Tournament", "season": 2026 },
  "abc123xyz00": { "hidden": true }
}
```

To change the rules for every video, edit `scripts/classify.mjs`; each run re-classifies everything.

## Run locally

```sh
YT_API_KEY=... node scripts/update.mjs      # FULL_SYNC=1 to read the whole channel
python3 -m http.server -d site 8080         # open http://localhost:8080
```

Node 22+, no dependencies.
