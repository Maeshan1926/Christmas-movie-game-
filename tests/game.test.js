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

test('nightly picks only come from the top-ranked pool, which refills as movies are watched', async () => {
  const { createApi } = await import('../netlify/lib/api.js');
  const { createMemoryStore } = await import('../netlify/lib/store-memory.js');
  const { seeded, makeClock } = await import('./helpers.js');
  // 40 movies per category; higher ids get better scores and more votes.
  const catalog = [];
  let id = 1;
  for (const category of ['comedy', 'drama', 'stocking']) {
    for (let i = 0; i < 40; i += 1) catalog.push({ id, title: `m${id}`, category, genres: [], score: 5 + i / 10, votes: 50 + i * 200, providers: null, id_rank: i }), (id += 1);
  }
  const store = createMemoryStore();
  const clock = makeClock('2026-12-01T19:00:00-08:00');
  const api = createApi({ store, getCatalog: async () => catalog, familyCode: 'x', now: clock.now, rng: seeded(9), poolSize: 30 });
  const call = async (method, path, body) => (await api(new Request(`http://l${path}`, { method, headers: { 'x-family-code': 'x' }, body: body && JSON.stringify(body) }))).json();
  const best = (c, n) => catalog.filter((m) => m.category === c).sort((a, b) => b.votes - a.votes).slice(0, n).map((m) => m.id);
  const allowed = new Set(['comedy', 'drama', 'stocking'].flatMap((c) => best(c, 10)));
  for (let d = 0; d < 6; d += 1) {
    const s = await call('GET', '/api/state');
    for (const pid of Object.values(s.night.picks).flat()) assert.ok(allowed.has(pid), `pick ${pid} outside top 30`);
    clock.advance(86_400_000);
  }
  // Watch the best comedy: the 11th-best comedy enters the pool.
  const top = best('comedy', 11);
  await call('POST', '/api/watched', { tmdbId: top[0] });
  const { nightlyPool } = await import('../public/js/shared/pool.js');
  const pool = nightlyPool(catalog, { watched: new Set([top[0]]), excluded: new Set(), wishlist: new Set(), size: 30 });
  assert.equal(pool.size, 30, 'pool refills to full size');
  assert.ok(!pool.has(top[0]), 'watched movie leaves the pool');
  // Wishlisted movies outside the top always qualify.
  const worst = catalog.find((m) => m.category === 'drama' && m.votes === 50).id;
  assert.ok(nightlyPool(catalog, { watched: new Set(), excluded: new Set(), wishlist: new Set([worst]), size: 30 }).has(worst));
});

test('"seen it" skips a movie for good and swaps in a new pick without using the reroll', async () => {
  const w = newWorld();
  const d = w.dev(4);
  const n1 = (await d.state()).body.night;
  const seenId = n1.picks.drama[0];
  const r = await d.call('POST', '/api/tonight/seen', { tmdbId: seenId });
  assert.equal(r.status, 200);
  const n2 = r.body.night;
  assert.equal(n2.picks.drama.length, 1);
  assert.notEqual(n2.picks.drama[0], seenId);
  assert.equal(n2.rerolls.drama, 0, 'reroll still available');
  assert.equal(new Set(picksOf(n2)).size, 3);
  assert.ok(r.body.flags.find((f) => f.tmdb_id === seenId).excluded);
  for (let i = 0; i < 10; i += 1) {
    w.clock.advance(86_400_000);
    assert.ok(!picksOf((await d.state()).body.night).includes(seenId));
  }
});

test('the Christmas 100 is frozen once, keeps prior watches, survives catalog changes and new devices', async () => {
  const { createApi } = await import('../netlify/lib/api.js');
  const { createMemoryStore } = await import('../netlify/lib/store-memory.js');
  const { seeded, makeClock } = await import('./helpers.js');
  const catalog = [];
  let id = 1;
  for (const category of ['comedy', 'drama', 'stocking']) {
    for (let i = 0; i < 30; i += 1) catalog.push({ id, title: `m${id}`, category, genres: [], score: 5 + i / 10, votes: 50 + i * 200, providers: null }), (id += 1);
  }
  const store = createMemoryStore();
  // A movie watched before V2 that would not rank on its own.
  const lowRanked = catalog.find((m) => m.category === 'drama' && m.votes === 50).id;
  await store.addWatch({ tmdb_id: lowRanked, watched_on: '2026-11-20', source: 'manual' });
  const clock = makeClock('2026-12-01T19:00:00-08:00');
  const mk = (cat, seed) => createApi({ store, getCatalog: async () => cat, familyCode: 'x', now: clock.now, rng: seeded(seed), poolSize: 30 });
  const call = async (api, path, body) => (await api(new Request(`http://l${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-family-code': 'x' }, body: body && JSON.stringify(body) }))).json();

  const s1 = await call(mk(catalog, 1), '/api/state');
  assert.equal(s1.hundred.ids.length, 30);
  assert.ok(s1.hundred.ids.includes(lowRanked), 'earlier watch kept in the 100');
  for (const c of ['comedy', 'drama', 'stocking']) assert.ok(s1.hundred.ids.filter((x) => catalog.find((m) => m.id === x).category === c).length >= 6);

  // Watching movies does not change the list.
  await call(mk(catalog, 1), '/api/watched', { tmdbId: s1.hundred.ids[0] });
  // A later catalog build drops a movie and adds a better one: the 100 stays the same.
  const dropped = s1.hundred.ids[1];
  const newer = [...catalog.filter((m) => m.id !== dropped), { id: 999, title: 'New Hit', category: 'comedy', genres: [], score: 9.5, votes: 90000, providers: null }];
  const s2 = await call(mk(newer, 2), '/api/state');
  assert.deepEqual(s2.hundred.ids, s1.hundred.ids);
  assert.ok(s2.hundredExtra.some((m) => m.id === dropped), 'dropped movie served from the frozen copy');
  for (let d = 0; d < 8; d += 1) {
    clock.advance(86_400_000);
    const s = await call(mk(newer, 3 + d), '/api/state');
    for (const pid of Object.values(s.night.picks).flat()) assert.ok(s1.hundred.ids.includes(pid), 'picks come only from the 100');
    assert.ok(!Object.values(s.night.picks).flat().includes(s1.hundred.ids[0]), 'watched never suggested');
  }
});

test('family name and members come from configuration', async () => {
  const { createApi } = await import('../netlify/lib/api.js');
  const { createMemoryStore } = await import('../netlify/lib/store-memory.js');
  const { fixtureCatalog, makeClock } = await import('./helpers.js');
  const api = createApi({
    store: createMemoryStore(), getCatalog: async () => fixtureCatalog(), familyCode: 'x', now: makeClock('2026-12-01T19:00:00-08:00').now,
    family: { name: 'Wolanski', members: ['Jamie', 'Greg', 'Iris', 'Eloise'] },
  });
  const call = async (method, path, body) => api(new Request(`http://l${path}`, { method, headers: { 'x-family-code': 'x' }, body: body && JSON.stringify(body) }));
  const pub = await (await api(new Request('http://l/api/family'))).json();
  assert.deepEqual(pub, { name: 'Wolanski', hero: null });
  const st = await (await call('GET', '/api/state')).json();
  assert.deepEqual(st.family.members.map((m) => m.id), ['jamie', 'greg', 'iris', 'eloise']);
  assert.equal((await call('POST', '/api/rate', { tmdbId: 1, member: 'eloise', score: 9 })).status, 200);
  assert.equal((await call('POST', '/api/rate', { tmdbId: 1, member: 'dad', score: 9 })).status, 400);
  // Default site stays the Trunk family with the built-in banner.
  const trunk = createApi({ store: createMemoryStore(), getCatalog: async () => fixtureCatalog(), familyCode: 'x' });
  assert.deepEqual(await (await trunk(new Request('http://l/api/family'))).json(), { name: 'Trunk', hero: 'builtin' });
});

test('age-rating limit: PG-13 family never sees R, unrated horror, or an old unrestricted list', async () => {
  const { createApi } = await import('../netlify/lib/api.js');
  const { createMemoryStore } = await import('../netlify/lib/store-memory.js');
  const { allowedByRating } = await import('../public/js/shared/ratings.js');
  const { makeClock, seeded } = await import('./helpers.js');
  assert.ok(allowedByRating({ cert: 'PG-13' }, 'PG-13'));
  assert.ok(allowedByRating({ cert: 'TV-14' }, 'pg13'));
  assert.ok(!allowedByRating({ cert: 'R' }, 'PG-13'));
  assert.ok(!allowedByRating({ cert: 'TV-MA' }, 'PG-13'));
  assert.ok(allowedByRating({ cert: null, genres: ['Romance'] }, 'PG-13'));
  assert.ok(!allowedByRating({ cert: 'NR', genres: ['Horror'] }, 'PG-13'));
  assert.ok(allowedByRating({ cert: 'R' }, null));

  const certs = ['G', 'PG', 'PG-13', 'R', null];
  const catalog = [];
  let id = 1;
  for (const category of ['comedy', 'drama', 'stocking']) {
    for (let i = 0; i < 40; i += 1) {
      catalog.push({ id, title: `m${id}`, category, genres: i % 7 === 0 ? ['Horror'] : [], cert: certs[i % 5], score: 5 + (i % 10) / 2, votes: 100 + i * 150, providers: null });
      id += 1;
    }
  }
  const store = createMemoryStore();
  const clock = makeClock('2026-12-01T19:00:00-08:00');
  const call = async (api, path) => (await api(new Request(`http://l${path}`, { headers: { 'x-family-code': 'x' } }))).json();
  // First visit without a limit freezes an unrestricted 100 and a lineup...
  const open = await call(createApi({ store, getCatalog: async () => catalog, familyCode: 'x', now: clock.now, rng: seeded(3), poolSize: 30 }), '/api/state');
  assert.ok(open.hundred.ids.some((x) => catalog.find((m) => m.id === x).cert === 'R'));
  // ...then the site sets PG-13: the 100 and tonight's lineup rebuild under the rule.
  const kid = createApi({ store, getCatalog: async () => catalog, familyCode: 'x', now: clock.now, rng: seeded(4), poolSize: 30, family: { name: 'Wolanski', members: ['Jamie'], maxRating: 'PG-13' } });
  const st = await call(kid, '/api/state');
  const ok = (x) => allowedByRating(catalog.find((m) => m.id === x), 'PG-13');
  assert.ok(st.hundred.ids.every(ok), 'every movie in the 100 is PG-13 or under');
  assert.ok(Object.values(st.night.picks).flat().every(ok), 'tonight redrawn within the limit');
  for (let d = 0; d < 5; d += 1) {
    clock.advance(86_400_000);
    assert.ok(Object.values((await call(kid, '/api/state')).night.picks).flat().every(ok));
  }
});

test('kids category set: Kids, Comedy, Traditional, each pick fits its category and the limit', async () => {
  const { createApi } = await import('../netlify/lib/api.js');
  const { createMemoryStore } = await import('../netlify/lib/store-memory.js');
  const { categoryFor } = await import('../public/js/shared/config.js');
  const { makeClock, seeded } = await import('./helpers.js');
  assert.equal(categoryFor({ genres: ['Animation', 'Family'], year: 2019 }, 'kids'), 'kids');
  assert.equal(categoryFor({ genres: ['Comedy', 'Family'], year: 1990 }, 'kids'), 'kids');
  assert.equal(categoryFor({ genres: ['Comedy'], year: 1989 }, 'kids'), 'comedy');
  assert.equal(categoryFor({ genres: ['Drama'], year: 1946 }, 'kids'), 'classic');
  assert.equal(categoryFor({ genres: ['Comedy', 'Romance'], year: 1945 }, 'kids'), 'classic');
  const pool = [['Animation', 'Family'], ['Comedy'], ['Drama', 'Romance'], ['Horror']];
  const catalog = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1, title: `m${i + 1}`, category: 'drama', genres: pool[i % 4], year: 1950 + (i % 70), cert: i % 4 === 3 ? 'R' : 'PG', score: 6 + (i % 10) / 5, votes: 200 + i * 40, providers: null,
  }));
  const api = createApi({ store: createMemoryStore(), getCatalog: async () => catalog, familyCode: 'x', now: makeClock('2026-12-01T19:00:00-08:00').now, rng: seeded(2), poolSize: 30, family: { name: 'Wolanski', members: ['Jamie'], maxRating: 'PG-13', categories: 'kids' } });
  const s = await (await api(new Request('http://l/api/state', { headers: { 'x-family-code': 'x' } }))).json();
  assert.deepEqual(Object.keys(s.night.picks), ['kids', 'comedy', 'classic']);
  assert.equal(s.family.categories, 'kids');
  for (const [cat, ids] of Object.entries(s.night.picks)) {
    for (const id of ids) {
      const m = catalog.find((x) => x.id === id);
      assert.equal(categoryFor(m, 'kids'), cat);
      assert.notEqual(m.cert, 'R');
    }
  }
  const r = await api(new Request('http://l/api/tonight/reroll', { method: 'POST', headers: { 'x-family-code': 'x' }, body: JSON.stringify({ category: 'kids' }) }));
  assert.equal(r.status, 200);
});
