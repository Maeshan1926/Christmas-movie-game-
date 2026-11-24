import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, streaks } from '../public/js/shared/stats.js';
import { pacificDate, seasonOf, daysUntilChristmas, msUntilPacificMidnight, addDays } from '../public/js/shared/dates.js';
import { availability } from '../public/js/shared/streaming.js';
import { normalize, isMatch, parseCurated } from '../scripts/build-catalog.mjs';
import { categorize, spoilerSafe } from '../netlify/lib/movie-record.js';
import { fixtureCatalog } from './helpers.js';

test('dates: Pacific day, seasons, countdown', () => {
  assert.equal(pacificDate(new Date('2026-12-25T07:59:00Z')), '2026-12-24');
  assert.equal(pacificDate(new Date('2026-12-25T08:00:00Z')), '2026-12-25');
  assert.equal(seasonOf('2026-12-10'), 2026);
  assert.equal(seasonOf('2027-01-02'), 2026);
  assert.equal(seasonOf('2027-08-01'), 2027);
  assert.equal(daysUntilChristmas('2026-11-24'), 31);
  assert.equal(daysUntilChristmas('2026-12-25'), 0);
  assert.equal(daysUntilChristmas('2026-12-26'), 364);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  // DST end day (Nov 1, 2026) is 25 hours long.
  const ms = msUntilPacificMidnight(new Date('2026-11-01T07:00:00Z')); // 00:00 PDT
  assert.equal(ms, 25 * 3600 * 1000);
});

test('streaks count consecutive nights', () => {
  assert.deepEqual(streaks(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-05'], '2026-12-06'), { current: 1, best: 3 });
  assert.deepEqual(streaks(['2026-12-04', '2026-12-05', '2026-12-06'], '2026-12-06'), { current: 3, best: 3 });
  assert.equal(streaks(['2026-12-01'], '2026-12-06').current, 0);
});

test('summary: totals, hours, categories, leaderboard, achievements', () => {
  const movies = new Map(fixtureCatalog(6).map((m) => [m.id, m]));
  const watches = [
    { id: 1, tmdb_id: 1, watched_on: '2026-12-01' },
    { id: 2, tmdb_id: 7, watched_on: '2026-12-02' },
    { id: 3, tmdb_id: 13, watched_on: '2026-12-03' },
    { id: 4, tmdb_id: 14, watched_on: '2026-12-24' },
    { id: 5, tmdb_id: 2, watched_on: '2025-12-20' },
  ];
  const ratings = [
    ...['dad', 'mommy', 'lincoln', 'sienna'].map((member) => ({ tmdb_id: 7, member, score: 9 })),
    { tmdb_id: 1, member: 'dad', score: 4 },
    { tmdb_id: 1, member: 'sienna', score: 6 },
  ];
  const s = summarize({ movies, watches, ratings, scope: 2026, today: '2026-12-24' });
  assert.equal(s.count, 4);
  assert.equal(s.minutes, 90 + 90 + 90 + 91);
  assert.deepEqual(s.byCategory, { comedy: 1, drama: 1, stocking: 2 });
  assert.equal(s.highest.id, 7);
  assert.equal(s.lowest.id, 1);
  assert.equal(s.avgFamily, 7);
  assert.equal(s.streak, 1);
  assert.equal(s.bestStreak, 3);
  const got = Object.fromEntries(s.achievements.map((a) => [a.id, a.unlocked]));
  assert.equal(got['first-snow'], true);
  assert.equal(got['ho-ho-hollywood'], false);
  assert.equal(got['ghost-past'], true); // fixture years start at 1976
  assert.equal(got['family-favorite'], true);
  assert.equal(got['eve-tradition'], true);
  assert.equal(got['full-stocking'], true);
  assert.equal(got.yippee, true); // id 13 is Action
  assert.equal(got['naughty-list'], true); // id 14 is Horror
  const life = summarize({ movies, watches, ratings, scope: 'lifetime', today: '2026-12-24' });
  assert.equal(life.count, 5);
});

test('availability buckets', () => {
  assert.equal(availability(null), 'unknown');
  assert.equal(availability({ flatrate: [{ id: 8 }] }), 'included');
  assert.equal(availability({ free: [{ id: 73 }] }), 'included');
  assert.equal(availability({ rent: [{ id: 2 }], buy: [{ id: 2 }] }), 'rent');
  assert.equal(availability({ buy: [{ id: 2 }] }), 'buy');
  assert.equal(availability({ flatrate: [], rent: [], buy: [] }), 'none');
});

test('catalog title matching is strict on title and year', () => {
  assert.equal(normalize("Dr. Seuss' How the Grinch Stole Christmas"), normalize('How the Grinch Stole Christmas'));
  assert.ok(isMatch({ title: 'Die Hard', year: 1988 }, { title: 'Die Hard', release_date: '1988-07-15' }));
  assert.ok(!isMatch({ title: 'Die Hard', year: 1988 }, { title: 'Die Hard 2', release_date: '1990-07-02' }));
  assert.ok(!isMatch({ title: 'Jack Frost', year: 1998 }, { title: 'Jack Frost', release_date: '1979-12-05' }));
  assert.ok(isMatch({ title: 'Joyeux Noel', year: 2005 }, { title: 'Joyeux Noël', release_date: '2005-11-09' }));
  const parsed = parseCurated('# c\nElf | 2003 | c |\nElf | 2003 | c |\nKrampus | 2015 | s | horror\n');
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[1].tags, ['horror']);
});

test('categorize and spoiler-safe synopsis', () => {
  assert.equal(categorize(['Comedy', 'Fantasy']), 'comedy');
  assert.equal(categorize(['Action', 'Thriller']), 'stocking');
  assert.equal(categorize(['Animation', 'Comedy', 'Family']), 'stocking');
  assert.equal(categorize(['Romance', 'Drama']), 'drama');
  assert.equal(categorize(['Action'], 'c'), 'comedy');
  const long = 'One. Two two two two two two two two two two two two two two two two two two two two two two two two two. Three three three three three three three three three three three three three three three three three three three. Four.';
  assert.ok(spoilerSafe(long).length <= 280);
  assert.ok(!spoilerSafe(long).includes('Four'));
});

test('TMDB credentials are accepted in either variable and cleaned up', async () => {
  const { resolveTmdbAuth } = await import('../netlify/lib/tmdb.js');
  const fakeKey = '0123456789abcdef0123456789abcdef';
  assert.deepEqual(resolveTmdbAuth({ TMDB_READ_TOKEN: fakeKey }), { readToken: null, apiKey: fakeKey });
  assert.deepEqual(resolveTmdbAuth({ TMDB_API_KEY: ' Bearer eyJfake.token ' }), { readToken: 'eyJfake.token', apiKey: null });
  assert.deepEqual(resolveTmdbAuth({ TMDB_READ_TOKEN: '"eyJfake"\n' }), { readToken: 'eyJfake', apiKey: null });
});

test('setup errors become actionable messages', async () => {
  const { diagnose } = await import('../netlify/lib/api.js');
  assert.match(diagnose(new Error('Supabase GET nights failed (404): {"code":"PGRST205"}')), /schema\.sql/);
  assert.match(diagnose(new Error('Supabase GET nights failed (401): Invalid API key')), /service_role/);
  assert.match(diagnose(new TypeError('fetch failed')), /SUPABASE_URL/);
});
