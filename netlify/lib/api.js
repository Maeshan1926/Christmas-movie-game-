// The family API. A Web-standard (Request) => Response handler shared by Netlify and the dev server.
import crypto from 'node:crypto';
import { CATEGORY_IDS, MEMBER_IDS, PROVIDER_TTL_HOURS } from '../../public/js/shared/config.js';
import { pacificDate, seasonOf, msUntilPacificMidnight } from '../../public/js/shared/dates.js';
import { activeWatchedIds } from '../../public/js/shared/stats.js';
import { generateNight, rerollPatch, allPicked, RuleError, RECENT_NIGHTS_TO_AVOID } from './selection.js';
import { fetchProviders } from './tmdb.js';
import { nightlyPool, DEFAULT_POOL_SIZE } from '../../public/js/shared/pool.js';
import { buildMovieRecord, DETAIL_APPEND } from './movie-record.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function codeMatches(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash('sha256').update(String(given).trim().toLowerCase()).digest();
  const b = crypto.createHash('sha256').update(String(expected).trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(a, b);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Turn setup failures into a message the family can act on. Only shown after the family code checks out. */
export function diagnose(err) {
  const m = String(err?.message || err);
  if (/PGRST205|Could not find the table|relation .* does not exist/i.test(m)) {
    return 'Setup: the Supabase tables are missing. In Supabase, open SQL Editor, paste supabase/schema.sql from the repo and click Run.';
  }
  if (/Supabase .*\((401|403)\)/.test(m)) {
    const detail = (m.match(/"message":"([^"]{0,140})/) || [])[1] || m.slice(-140);
    return `Setup: Supabase rejected the key. SUPABASE_SERVICE_ROLE_KEY must be the secret or service_role key from this same project, not the publishable or anon key. Supabase said: ${detail}`;
  }
  if (/ENOTFOUND|fetch failed|Invalid URL|getaddrinfo/i.test(m)) {
    return 'Setup: the server cannot reach SUPABASE_URL. It should look like https://abcdefgh.supabase.co with nothing after .co.';
  }
  if (/catalog not found/i.test(m)) return 'Setup: the movie catalog is missing from the server bundle. Redeploy the site.';
  return `The elves dropped something: ${m.slice(0, 240)}`;
}

/**
 * @param {object} deps
 * @param {object} deps.store         storage adapter (memory or Supabase)
 * @param {() => Promise<object[]>} deps.getCatalog  base catalog movies
 * @param {string} deps.familyCode    private family access code
 * @param {object|null} deps.tmdb     TMDB client or null
 * @param {() => Date} [deps.now]
 * @param {() => number} [deps.rng]
 */
export function createApi({ store, getCatalog, familyCode, tmdb = null, now = () => new Date(), rng = Math.random, poolSize = DEFAULT_POOL_SIZE }) {
  async function fullCatalog() {
    const base = await getCatalog();
    const custom = store.listCustomMovies ? await store.listCustomMovies() : [];
    if (!custom.length) return base;
    const ids = new Set(base.map((m) => m.id));
    return [...base, ...custom.filter((m) => !ids.has(m.id))];
  }

  async function selectionContext(today) {
    const [catalog, watches, flags, recentNights] = await Promise.all([
      fullCatalog(), store.listWatches(), store.listFlags(), store.recentNights(today, RECENT_NIGHTS_TO_AVOID),
    ]);
    const watched = activeWatchedIds(watches);
    const excluded = new Set(flags.filter((f) => f.excluded).map((f) => f.tmdb_id));
    const wishlist = new Set(flags.filter((f) => f.wishlist).map((f) => f.tmdb_id));
    return {
      catalog,
      watched,
      excluded,
      wishlist,
      pool: poolSize > 0 ? nightlyPool(catalog, { watched, excluded, wishlist, size: poolSize }) : null,
      recent: new Set(recentNights.flatMap((n) => CATEGORY_IDS.flatMap((c) => n.picks?.[c] || []))),
      rng,
    };
  }

  async function ensureNight(today) {
    const existing = await store.getNight(today);
    if (existing) return existing;
    const night = generateNight(today, await selectionContext(today));
    // insertNight never overwrites: if another device won the race, we get its night back.
    return store.insertNight(night);
  }

  async function freshProviders(ids) {
    if (!ids.length) return {};
    const rows = await store.getProviders(ids);
    const out = {};
    const stale = [];
    const ttl = PROVIDER_TTL_HOURS * 3600 * 1000;
    for (const id of ids) {
      const row = rows.find((r) => r.tmdb_id === id);
      if (row) out[id] = row.providers;
      if (!row || now().getTime() - new Date(row.fetched_at).getTime() > ttl) stale.push(id);
    }
    if (tmdb && stale.length) {
      const results = await Promise.allSettled(stale.map(async (id) => {
        const p = await fetchProviders(tmdb, id);
        out[id] = p;
        await store.putProviders(id, p);
      }));
      results.forEach((r) => { if (r.status === 'rejected') console.warn('provider refresh failed', r.reason?.message); });
    }
    return out;
  }

  async function state() {
    const n = now();
    const today = pacificDate(n);
    const night = await ensureNight(today);
    const [watches, ratings, flags, custom] = await Promise.all([
      store.listWatches(), store.listRatings(), store.listFlags(),
      store.listCustomMovies ? store.listCustomMovies() : [],
    ]);
    let providers = {};
    try {
      providers = await freshProviders([...allPicked(night)]);
    } catch (err) {
      console.warn('providers unavailable', err.message);
    }
    return {
      today,
      season: seasonOf(today),
      serverTime: n.toISOString(),
      nextResetInMs: msUntilPacificMidnight(n),
      night,
      watches,
      ratings,
      flags,
      customMovies: custom,
      providers,
      tmdbLive: !!tmdb,
      poolSize,
      storage: store.kind,
    };
  }

  async function mutateNight(today, fn) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const night = await ensureNight(today);
      const patch = await fn(night);
      const updated = await store.updateNight(today, night.version, patch);
      if (updated) return updated;
    }
    throw new RuleError('Another device changed tonight at the same moment. Try again.');
  }

  async function catalogIds() {
    return new Set((await fullCatalog()).map((m) => m.id));
  }

  const routes = {
    'POST /api/login': async (_req, body) => (codeMatches(body.code, familyCode)
      ? json(200, { ok: true })
      : json(401, { error: 'That family code is not on the nice list.' })),

    'GET /api/state': async () => json(200, await state()),

    'POST /api/tonight/reroll': async (_req, body) => {
      const today = pacificDate(now());
      await mutateNight(today, async (night) => rerollPatch(night, body.category, await selectionContext(today)));
      return json(200, await state());
    },

    'POST /api/tonight/choose': async (_req, body) => {
      const today = pacificDate(now());
      const id = body.tmdbId == null ? null : Number(body.tmdbId);
      await mutateNight(today, async (night) => {
        if (id != null && !allPicked(night).has(id)) throw new RuleError('That movie is not in tonight\'s lineup.', 400);
        return { chosen: id, started_at: body.start && id != null ? now().toISOString() : night.started_at };
      });
      return json(200, await state());
    },

    'POST /api/watched': async (_req, body) => {
      const id = Number(body.tmdbId);
      if (!(await catalogIds()).has(id)) throw new RuleError('Unknown movie.', 400);
      const today = pacificDate(now());
      const day = body.date || today;
      if (!DAY_RE.test(day) || day > today) throw new RuleError('Pick a valid date that is not in the future.', 400);
      const watches = await store.listWatches();
      if (activeWatchedIds(watches).has(id)) throw new RuleError('Already marked as watched.');
      const night = await store.getNight(today);
      const source = night && day === today && allPicked(night).has(id) ? 'nightly' : 'manual';
      await store.addWatch({ tmdb_id: id, watched_on: day, source });
      return json(200, await state());
    },

    'POST /api/watched/return': async (_req, body) => {
      await store.returnToRotation(Number(body.tmdbId));
      return json(200, await state());
    },

    'POST /api/watched/delete': async (_req, body) => {
      await store.deleteWatch(Number(body.watchId));
      return json(200, await state());
    },

    'POST /api/rate': async (_req, body) => {
      const id = Number(body.tmdbId);
      if (!MEMBER_IDS.includes(body.member)) throw new RuleError('Unknown family member.', 400);
      const score = body.score == null || body.score === '' ? null : Number(body.score);
      if (score != null && (!Number.isInteger(score) || score < 1 || score > 10)) throw new RuleError('Scores run 1 to 10.', 400);
      if (!(await catalogIds()).has(id)) throw new RuleError('Unknown movie.', 400);
      await store.setRating(id, body.member, score);
      return json(200, await state());
    },

    'POST /api/flag': async (_req, body) => {
      const id = Number(body.tmdbId);
      if (!(await catalogIds()).has(id)) throw new RuleError('Unknown movie.', 400);
      const patch = {};
      if (typeof body.excluded === 'boolean') patch.excluded = body.excluded;
      if (typeof body.wishlist === 'boolean') patch.wishlist = body.wishlist;
      await store.setFlag(id, patch);
      return json(200, await state());
    },

    'GET /api/providers': async (req) => {
      const id = Number(new URL(req.url).searchParams.get('id'));
      if (!id) throw new RuleError('Missing id', 400);
      const p = await freshProviders([id]);
      return json(200, { id, providers: p[id] || null, live: !!tmdb });
    },

    'GET /api/search': async (req) => {
      if (!tmdb) throw new RuleError('Movie search needs a TMDB key on the server.', 503);
      const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100);
      if (q.length < 2) return json(200, { results: [] });
      const data = await tmdb.get('/search/movie', { query: q, include_adult: false, language: 'en-US' });
      const results = (data?.results || []).slice(0, 12).map((r) => ({
        id: r.id, title: r.title, year: r.release_date ? Number(r.release_date.slice(0, 4)) : null, poster: r.poster_path,
      }));
      return json(200, { results });
    },

    'POST /api/custom-movie': async (_req, body) => {
      if (!tmdb) throw new RuleError('Adding movies needs a TMDB key on the server.', 503);
      const id = Number(body.tmdbId);
      if ((await catalogIds()).has(id)) return json(200, { ok: true, existing: true, state: await state() });
      const d = await tmdb.get(`/movie/${id}`, { append_to_response: DETAIL_APPEND, language: 'en-US' });
      if (!d) throw new RuleError('TMDB has no movie with that id.', 404);
      const movie = buildMovieRecord(d, { tags: ['family-added'] });
      await store.addCustomMovie(movie);
      return json(200, { ok: true, movie, state: await state() });
    },
  };

  return async function handle(req) {
    const url = new URL(req.url);
    const key = `${req.method} ${url.pathname.replace(/\/$/, '')}`;
    if (key === 'GET /api/health') return json(200, { ok: true, storage: store.kind, tmdb: !!tmdb });
    const route = routes[key];
    if (!route) return json(404, { error: 'Not found' });
    if (key !== 'POST /api/login' && !codeMatches(req.headers.get('x-family-code'), familyCode)) {
      return json(401, { error: 'Family code required.' });
    }
    let body = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }
    try {
      return await route(req, body);
    } catch (err) {
      if (err instanceof RuleError) return json(err.status, { error: err.message });
      console.error(err);
      return json(500, { error: diagnose(err) });
    }
  };
}
