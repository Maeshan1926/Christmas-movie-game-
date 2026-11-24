import { createApi } from '../netlify/lib/api.js';
import { createMemoryStore } from '../netlify/lib/store-memory.js';

const cats = ['comedy', 'drama', 'stocking'];

export function fixtureCatalog(perCategory = 6) {
  const movies = [];
  let id = 1;
  for (const c of cats) {
    for (let i = 0; i < perCategory; i += 1) {
      movies.push({
        id, title: `${c} movie ${i}`, year: 1975 + id, genres: c === 'stocking' ? (i % 2 ? ['Horror'] : ['Action']) : [c === 'comedy' ? 'Comedy' : 'Drama'],
        category: c, tags: [], runtime: 90 + i, cert: 'PG', score: 7, votes: 500, overview: '', poster: null,
        providers: i % 3 === 0 ? { flatrate: [{ id: 8, name: 'Netflix' }], free: [], ads: [], rent: [], buy: [] } : { flatrate: [], free: [], ads: [], rent: [{ id: 2, name: 'Apple TV' }], buy: [] },
      });
      id += 1;
    }
  }
  return movies;
}

/** Seeded PRNG (mulberry32) so tests are deterministic. */
export function seeded(seed = 42) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeClock(iso) {
  let t = new Date(iso).getTime();
  return { now: () => new Date(t), set: (s) => { t = new Date(s).getTime(); }, advance: (ms) => { t += ms; } };
}

/** A "device": an API instance sharing a store with others. */
export function device({ store, catalog, clock, seed = 1 }) {
  const api = createApi({ store, getCatalog: async () => catalog, familyCode: 'Jingle Bells', now: clock.now, rng: seeded(seed) });
  const call = async (method, path, body, code = 'jingle bells') => {
    const res = await api(new Request(`http://local${path}`, {
      method, headers: { 'content-type': 'application/json', 'x-family-code': code }, body: body ? JSON.stringify(body) : undefined,
    }));
    return { status: res.status, body: await res.json() };
  };
  return {
    state: () => call('GET', '/api/state'),
    reroll: (category) => call('POST', '/api/tonight/reroll', { category }),
    choose: (tmdbId, start = false) => call('POST', '/api/tonight/choose', { tmdbId, start }),
    watched: (tmdbId, date) => call('POST', '/api/watched', { tmdbId, date }),
    returnToRotation: (tmdbId) => call('POST', '/api/watched/return', { tmdbId }),
    deleteWatch: (watchId) => call('POST', '/api/watched/delete', { watchId }),
    rate: (tmdbId, member, score) => call('POST', '/api/rate', { tmdbId, member, score }),
    flag: (tmdbId, patch) => call('POST', '/api/flag', { tmdbId, ...patch }),
    login: (code) => call('POST', '/api/login', { code }),
    call,
  };
}

export function newWorld({ perCategory = 6, start = '2026-12-01T19:00:00-08:00' } = {}) {
  const store = createMemoryStore();
  const catalog = fixtureCatalog(perCategory);
  const clock = makeClock(start);
  return { store, catalog, clock, dev: (seed) => device({ store, catalog, clock, seed }) };
}

export const picksOf = (night) => Object.values(night.picks).flat();
