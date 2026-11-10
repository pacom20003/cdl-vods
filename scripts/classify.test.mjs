// Unit tests for the pure classification logic in classify.mjs.
// Run with: node --test scripts/   (Node 22+, no dependencies)
//
// These lock in the tricky real-world titles that have caused regressions:
// season cutovers, tournament disambiguation, the Launch Invitational vs
// Championship case, the EWC Warzone exclusion, and content-kind detection.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seconds, seasonFor, tournamentFor, ewcTitleKeep, kindFor, classify,
} from './classify.mjs';

// ---------------------------------------------------------------------------
test('seconds() parses ISO 8601 durations', () => {
  assert.equal(seconds('PT1H2M3S'), 3723);
  assert.equal(seconds('PT45M'), 2700);
  assert.equal(seconds('PT60S'), 60);
  assert.equal(seconds('P1DT2H'), 93600);
  assert.equal(seconds(''), 0);
  assert.equal(seconds(), 0);
});

// ---------------------------------------------------------------------------
test('seasonFor() buckets by the fall cutover, not the calendar year', () => {
  // Season is named after the year it ENDS; content starts the prior fall.
  assert.equal(seasonFor('x', '2024-12-08'), 2025); // after 2024-10-01 cutover
  assert.equal(seasonFor('x', '2024-09-15'), 2024); // before the cutover
  assert.equal(seasonFor('x', '2025-12-05'), 2026);
  assert.equal(seasonFor('x', '2026-11-14'), 2027);
  assert.equal(seasonFor('x', '2022-12-02'), 2023);
});

test('seasonFor() falls back to calendar year for pre-franchise content', () => {
  assert.equal(seasonFor('MLG Winter Invitational', '2015-03-01'), 2015);
  assert.equal(seasonFor('CWL Championship', '2018-08-19'), 2018);
});

// ---------------------------------------------------------------------------
test('tournamentFor() classifies Majors and Qualifiers with roman numerals', () => {
  assert.equal(tournamentFor('CDL Major II Qualifiers | Day 1'), 'Major 2 Qualifiers');
  assert.equal(
    tournamentFor('@LAThieves vs @FaZeVegas | Major IV Tournament Monster Matchup | Grand Finals'),
    'Major 4 Tournament',
  );
  assert.equal(tournamentFor('@A vs @B | Major III Qualifiers Monster Matchup | Week 1'), 'Major 3 Qualifiers');
});

test('tournamentFor() classifies the real CDL Championship', () => {
  assert.equal(tournamentFor('Call of Duty League Championship Weekend | Day 1'), 'Championship');
  assert.equal(tournamentFor('@OpTicTexas vs @C9COD | CDL Champs Monster Matchup | Grand Finals'), 'Championship');
});

test('tournamentFor() keeps the Launch Invitational out of the Championship row', () => {
  // Regression: this title's "Championship Sunday" day label used to match the
  // Championship rule. It is its own preseason event.
  assert.equal(tournamentFor('Monster Energy Launch Invitational | Championship Sunday'), 'Launch Invitational');
  assert.equal(tournamentFor('$75K Monster Energy Launch Invitational | Black Ops 7 | Day 1'), 'Launch Invitational');
  assert.equal(
    tournamentFor('@OpTicTexas vs Still Orgless | Monster Energy Launch Invitational | Grand Finals'),
    'Launch Invitational',
  );
});

test('tournamentFor() leaves unrelated (non-Launch) invitationals unclassified', () => {
  // Old MLG/CWL-era invitationals should stay under "Other videos", not get
  // swept into a catch-all row.
  assert.equal(tournamentFor('MLG Winter Invitational - Finals'), null);
  assert.equal(tournamentFor('Official CWL PlayStation Experience Invitational Trailer'), null);
});

test('tournamentFor() classifies other event types', () => {
  assert.equal(tournamentFor('EWC 2025 Call of Duty | Grand Finals'), 'Esports World Cup');
  assert.equal(tournamentFor('Esports World Cup 2024 | Day 2'), 'Esports World Cup');
  assert.equal(tournamentFor('@A vs @B | Minor II Tournament | Grand Finals'), 'Minor');
  assert.equal(tournamentFor('Stage 2 | Day 1'), 'Stage 2');
  assert.equal(tournamentFor('Stage 2 Major | Day 1'), 'Stage 2 Major');
  assert.equal(tournamentFor('Opening Weekend 2024 Monster Matchup | Day 2'), 'Opening Weekend');
  assert.equal(tournamentFor('Kickoff Classic | Day 1'), 'Kickoff');
  assert.equal(tournamentFor('CDL Launch Weekend | Day 1'), 'Kickoff');
  assert.equal(tournamentFor('Some random highlights video'), null);
});

// ---------------------------------------------------------------------------
test('ewcTitleKeep() keeps EWC CoD multiplayer and drops Warzone/WRS/qualifiers', () => {
  assert.equal(ewcTitleKeep('EWC 2025 Call of Duty | Day 1'), true);
  assert.equal(ewcTitleKeep('Esports World Cup | Call of Duty Black Ops 6 | Day 2'), true);

  assert.equal(ewcTitleKeep('EWC Call of Duty Warzone | Finals'), false);     // Warzone
  assert.equal(ewcTitleKeep('EWC COD:WRS Grand Finals'), false);             // Warzone Ranked Series
  assert.equal(ewcTitleKeep('EWC Call of Duty Qualifiers | Day 1'), false);  // qualifiers
  assert.equal(ewcTitleKeep('EWC Valorant | Grand Finals'), false);          // not CoD
  assert.equal(ewcTitleKeep('Call of Duty League Major | Day 1'), false);    // not EWC
});

// ---------------------------------------------------------------------------
test('kindFor() distinguishes matches, broadcasts, shows, shorts and clips', () => {
  assert.equal(kindFor('@OpTic vs @FaZe | Grand Finals', 1200, false), 'match'); // vs + >=10min
  assert.equal(kindFor('@OpTic vs @FaZe | Clip', 120, false), 'clip');           // vs but too short
  assert.equal(kindFor('Insane play', 45, false), 'short');                      // <=60s
  assert.equal(kindFor('The Scope | Episode 1', 800, false), 'show');            // show keyword
  assert.equal(kindFor('Post-Game Interview', 400, false), 'show');
  assert.equal(kindFor('CDL Major | Day 1', 5400, false), 'broadcast');          // "Day 1" pattern
  assert.equal(kindFor('Full stream', 8000, true), 'broadcast');                 // stream flag
  assert.equal(kindFor('Long VOD', 3000, false), 'broadcast');                   // >=45min
  assert.equal(kindFor('Random moment', 300, false), 'clip');
});

// ---------------------------------------------------------------------------
test('classify() combines the three and prefers actualStart for the season', () => {
  const v = {
    title: 'Monster Energy Launch Invitational | Championship Sunday',
    publishedAt: '2026-11-20T00:00:00Z',
    actualStart: '2026-11-20T00:00:00Z',
    duration: 9000,
    stream: true,
  };
  assert.deepEqual(classify(v), { season: 2027, tournament: 'Launch Invitational', kind: 'broadcast' });

  // actualStart (if present) wins over publishedAt for the season bucket.
  const v2 = {
    title: 'CDL Major II Qualifiers | Day 1',
    publishedAt: '2024-11-01T00:00:00Z', // would be 2025
    actualStart: '2024-09-01T00:00:00Z', // but the broadcast aired in 2024
    duration: 7200,
  };
  assert.equal(classify(v2).season, 2024);
});
