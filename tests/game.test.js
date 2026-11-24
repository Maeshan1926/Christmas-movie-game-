import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, picksOf } from './helpers.js';

test('family code is required and case-insensitive', async () => {
  const w = newWorld();
  const d = w.dev();
  assert.equal((await d.login('nope')).status, 401);
  assert.equal((await d.login('JINGLE bells')).status, 200);
  assert.equal((await d.call('GET', '/api/state', null, 'wrong')).status, 401);
  assert.equal((await d.state()).status, 200);
});

test('nightly selection: one movie per category, no duplicates, categories respected', async () => {
  const w = newWorld();
  const { body } = await w.dev().state();
  const { night } = body;
  assert.equal(night.night, '2026-12-01');
  for (const c of ['comedy', 'drama', 'stocking']) {
    assert.equal(night.picks[c].length, 1);
    const m = w.catalog.find((x) => x.id === night.picks[c][0]);
    assert.equal(m.category, c);
  }
  assert.equal(new Set(picksOf(night)).size, 3);
});

test('rerolls: one per category, keeps the original, never duplicates, max six options', async () => {
  const w = newWorld();
  const d = w.dev(7);
  const first = (await d.state()).body.night;
  for (const c of ['comedy', 'drama', 'stocking']) {
    const r = await d.reroll(c);
    assert.equal(r.status, 200);
    const picks = r.body.night.picks[c];
    assert.equal(picks.length, 2);
    assert.equal(picks[0], first.picks[c][0], 'original pick stays available');
    assert.notEqual(picks[0], picks[1]);
  }
  const again = await d.reroll('comedy');
  assert.equal(again.status, 409);
  const night = (await d.state()).body.night;
  const all = picksOf(night);
  assert.equal(all.length, 6);
  assert.equal(new Set(all).size, 6, 'no duplicates across categories');
});

test('refreshing (repeated state calls) never resets picks or rerolls', async () => {
  const w = newWorld();
  const d = w.dev();
  await d.state();
  await d.reroll('drama');
  const a = (await d.state()).body.night;
  const b = (await w.dev(999).state()).body.night; // brand-new "browser"
  assert.deepEqual(a.picks, b.picks);
  assert.equal(b.rerolls.drama, 1);
});

test('daily reset happens at midnight Pacific, not UTC', async () => {
  const w = newWorld({ start: '2026-12-01T23:59:00-08:00' });
  const d = w.dev();
  await d.reroll('comedy');
  const before = (await d.state()).body;
  assert.equal(before.today, '2026-12-01');
  assert.ok(before.nextResetInMs <= 60_000 && before.nextResetInMs > 0);
  // 08:00 UTC Dec 2 == midnight Pacific; at 07:59 UTC it must still be Dec 1.
  w.clock.set('2026-12-02T07:59:30Z');
  assert.equal((await d.state()).body.today, '2026-12-01');
  w.clock.set('2026-12-02T08:00:01Z');
  const after = (await d.state()).body;
  assert.equal(after.today, '2026-12-02');
  assert.equal(after.night.rerolls.comedy, 0);
  assert.equal(after.night.picks.comedy.length, 1);
  assert.equal((await d.reroll('comedy')).status, 200);
});

test('watched movies never come back in future nights until manually returned', async () => {
  const w = newWorld({ perCategory: 3 });
  const d = w.dev(3);
  const n1 = (await d.state()).body.night;
  const watchedId = n1.picks.comedy[0];
  assert.equal((await d.watched(watchedId)).status, 200);
  assert.equal((await d.watched(watchedId)).status, 409, 'cannot double-mark');
  for (let i = 0; i < 20; i += 1) {
    w.clock.advance(86_400_000);
    const { night } = (await d.state()).body;
    assert.ok(!picksOf(night).includes(watchedId), `night ${night.night} offered a watched movie`);
    const r = await d.reroll('comedy');
    if (r.status === 200) assert.ok(!picksOf(r.body.night).includes(watchedId));
  }
  // Return to rotation keeps history and makes it eligible again.
  const ret = (await d.returnToRotation(watchedId)).body;
  assert.equal(ret.watches.length, 1, 'history kept');
  assert.equal(ret.watches[0].returned, true);
  let seen = false;
  for (let i = 0; i < 20 && !seen; i += 1) {
    w.clock.advance(86_400_000);
    seen = picksOf((await d.state()).body.night).includes(watchedId);
  }
  assert.ok(seen, 'returned movie is eligible again');
});

test('only "mark as watched" removes a movie; choosing or starting does not', async () => {
  const w = newWorld({ perCategory: 2 });
  const d = w.dev(5);
  const n1 = (await d.state()).body.night;
  const id = n1.picks.drama[0];
  const ch = await d.choose(id, true);
  assert.equal(ch.body.night.chosen, id);
  assert.ok(ch.body.night.started_at);
  assert.equal(ch.body.watches.length, 0);
  assert.equal((await d.choose(123456)).status, 400, 'cannot choose a movie outside tonight');
});

test('excluded movies are never selected; wishlist is allowed', async () => {
  const w = newWorld({ perCategory: 3 });
  const d = w.dev(11);
  const excludedIds = w.catalog.filter((m) => m.category === 'stocking').slice(0, 2).map((m) => m.id);
  for (const id of excludedIds) await d.flag(id, { excluded: true });
  await d.flag(1, { wishlist: true });
  for (let i = 0; i < 15; i += 1) {
    w.clock.advance(86_400_000);
    const { night } = (await d.state()).body;
    for (const id of excludedIds) assert.ok(!picksOf(night).includes(id));
  }
  const st = (await d.state()).body;
  assert.ok(st.flags.find((f) => f.tmdb_id === 1).wishlist);
});

test('category that runs dry reports clearly instead of duplicating', async () => {
  const w = newWorld({ perCategory: 1 });
  const d = w.dev();
  await d.state();
  const r = await d.reroll('comedy');
  assert.equal(r.status, 409);
  assert.match(r.body.error, /No more unwatched/);
});

test('ratings: per member 1-10, optional, removable, validated', async () => {
  const w = newWorld();
  const d = w.dev();
  await d.watched(1);
  assert.equal((await d.rate(1, 'dad', 9)).status, 200);
  assert.equal((await d.rate(1, 'sienna', 10)).status, 200);
  assert.equal((await d.rate(1, 'sienna', 11)).status, 400);
  assert.equal((await d.rate(1, 'grinch', 5)).status, 400);
  assert.equal((await d.rate(1, 'lincoln', 7)).status, 200);
  const st = (await d.rate(1, 'lincoln', null)).body;
  assert.deepEqual(st.ratings.map((r) => r.member).sort(), ['dad', 'sienna']);
});

test('manual watches accept past dates, reject future dates', async () => {
  const w = newWorld();
  const d = w.dev();
  assert.equal((await d.watched(2, '2026-11-20')).status, 200);
  assert.equal((await d.watched(3, '2026-12-31')).status, 400);
  const st = (await d.state()).body;
  assert.equal(st.watches[0].source, 'manual');
  assert.equal(st.watches[0].watched_on, '2026-11-20');
});

test('cross-device sync: two devices see the same night, rerolls and ratings', async () => {
  const w = newWorld();
  const phone = w.dev(1);
  const ipad = w.dev(2);
  const [a, b] = await Promise.all([phone.state(), ipad.state()]);
  assert.deepEqual(a.body.night.picks, b.body.night.picks, 'simultaneous first load converges on one night');
  await phone.reroll('stocking');
  const fromIpad = await ipad.reroll('stocking');
  assert.equal(fromIpad.status, 409, 'reroll allowance is shared');
  const id = a.body.night.picks.comedy[0];
  await ipad.watched(id);
  await phone.rate(id, 'mommy', 8);
  const s = (await ipad.state()).body;
  assert.equal(s.night.picks.stocking.length, 2);
  assert.equal(s.watches[0].tmdb_id, id);
  assert.equal(s.watches[0].source, 'nightly');
  assert.equal(s.ratings[0].score, 8);
});

test('concurrent rerolls of the same category from two devices only apply once', async () => {
  const w = newWorld();
  const a = w.dev(1); const b = w.dev(2);
  await a.state();
  const results = await Promise.all([a.reroll('drama'), b.reroll('drama')]);
  const ok = results.filter((r) => r.status === 200).length;
  assert.equal(ok, 1);
  const night = (await a.state()).body.night;
  assert.equal(night.picks.drama.length, 2);
  assert.equal(night.rerolls.drama, 1);
});

test('recently offered movies are avoided when the pool allows', async () => {
  const w = newWorld({ perCategory: 20 });
  const d = w.dev(17);
  const seen = [];
  for (let i = 0; i < 7; i += 1) {
    seen.push(...picksOf((await d.state()).body.night));
    w.clock.advance(86_400_000);
  }
  assert.equal(new Set(seen).size, seen.length, 'no repeats within two weeks when the pool is big enough');
});
