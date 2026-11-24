// Minimal TMDB client shared by the catalog builder and the server function.
// Supports a v3 API key (TMDB_API_KEY) or a v4 read access token (TMDB_READ_TOKEN).

const API = 'https://api.themoviedb.org/3';

export function tmdbConfigured(env = process.env) {
  return !!(env.TMDB_API_KEY || env.TMDB_READ_TOKEN);
}

export function createTmdb({ apiKey, readToken, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  async function get(path, params = {}, attempt = 0) {
    const u = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, String(v));
    if (apiKey && !readToken) u.searchParams.set('api_key', apiKey);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(u, {
        headers: { accept: 'application/json', ...(readToken ? { Authorization: `Bearer ${readToken}` } : {}) },
        signal: ctrl.signal,
      });
      if (res.status === 429 && attempt < 5) {
        const wait = Number(res.headers.get('retry-after') || 1) * 1000;
        await new Promise((r) => setTimeout(r, wait + 250 * attempt));
        return get(path, params, attempt + 1);
      }
      if (res.status === 404) return null;
      if (res.status === 401) throw new Error('TMDB rejected the key (401). In Netlify, set TMDB_READ_TOKEN to the API Read Access Token (starts with eyJ) or TMDB_API_KEY to the 32-character API Key, then redeploy. A regenerated key replaces the old one.');
      if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt < 2 && (err.name === 'AbortError' || /fetch failed|ECONNRESET/.test(String(err)))) {
        return get(path, params, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
  return { get };
}

/** Accepts either credential in either variable, trims stray whitespace and a pasted "Bearer " prefix. */
export function resolveTmdbAuth(env = process.env) {
  const clean = (v) => String(v || '').trim().replace(/^bearer\s+/i, '').replace(/^["']|["']$/g, '');
  const values = [clean(env.TMDB_READ_TOKEN), clean(env.TMDB_API_KEY)].filter(Boolean);
  const readToken = values.find((v) => v.startsWith('eyJ')) || null;
  const apiKey = values.find((v) => /^[0-9a-f]{32}$/i.test(v)) || null;
  if (!readToken && !apiKey && values.length) return { readToken: values[0], apiKey: null };
  return { readToken, apiKey: readToken ? null : apiKey };
}

export function tmdbFromEnv(env = process.env, opts = {}) {
  if (!tmdbConfigured(env)) return null;
  return createTmdb({ ...resolveTmdbAuth(env), ...opts });
}

const slim = (arr = []) => arr
  .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
  .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path || null }));

/** Normalize a TMDB watch/providers payload (whole response or the US entry). */
export function normalizeProviders(payload, asOf = new Date().toISOString()) {
  const us = payload?.results ? payload.results.US : payload;
  if (!us) return { flatrate: [], free: [], ads: [], rent: [], buy: [], link: null, asOf };
  return {
    flatrate: slim(us.flatrate), free: slim(us.free), ads: slim(us.ads),
    rent: slim(us.rent), buy: slim(us.buy), link: us.link || null, asOf,
  };
}

export function usCertification(releaseDates) {
  const us = releaseDates?.results?.find((r) => r.iso_3166_1 === 'US');
  if (!us) return null;
  const order = [3, 4, 5, 6, 2, 1];
  const sorted = [...us.release_dates].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return sorted.find((d) => d.certification)?.certification || null;
}

export function pickTrailer(videos) {
  const list = (videos?.results || []).filter((v) => v.site === 'YouTube');
  const score = (v) => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2) + (v.official ? 0 : 0.5) + (v.iso_639_1 === 'en' ? 0 : 0.25);
  const best = list.sort((a, b) => score(a) - score(b))[0];
  return best ? best.key : null;
}

export async function fetchProviders(tmdb, id) {
  const data = await tmdb.get(`/movie/${id}/watch/providers`);
  return normalizeProviders(data);
}
