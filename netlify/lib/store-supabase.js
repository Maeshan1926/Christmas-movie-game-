// Supabase store over PostgREST using the service-role key (server side only).

export function createSupabaseStore({ url, key, fetchImpl = fetch }) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  // Legacy service_role keys are JWTs and also go in Authorization. New sb_secret_ keys go in apikey only.
  const headers = key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function req(method, pathAndQuery, body, prefer) {
    const res = await fetchImpl(`${base}/${pathAndQuery}`, {
      method,
      headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${method} ${pathAndQuery.split('?')[0]} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const enc = encodeURIComponent;

  return {
    kind: 'supabase',
    async getNight(day) {
      const rows = await req('GET', `nights?night=eq.${enc(day)}&select=*`);
      return rows[0] || null;
    },
    async insertNight(night) {
      await req('POST', 'nights?on_conflict=night', night, 'resolution=ignore-duplicates,return=minimal');
      return this.getNight(night.night);
    },
    async updateNight(day, version, patch) {
      const rows = await req('PATCH', `nights?night=eq.${enc(day)}&version=eq.${version}`,
        { ...patch, version: version + 1 }, 'return=representation');
      return rows[0] || null;
    },
    async recentNights(beforeDay, n) {
      return req('GET', `nights?night=lt.${enc(beforeDay)}&order=night.desc&limit=${n}&select=night,picks`);
    },
    async listWatches() { return req('GET', 'watches?select=*&order=watched_on.asc,id.asc'); },
    async addWatch(w) {
      const rows = await req('POST', 'watches', w, 'return=representation');
      return rows[0];
    },
    async returnToRotation(tmdbId) {
      await req('PATCH', `watches?tmdb_id=eq.${tmdbId}&returned=eq.false`, { returned: true }, 'return=minimal');
    },
    async deleteWatch(id) { await req('DELETE', `watches?id=eq.${id}`, undefined, 'return=minimal'); },
    async listRatings() { return req('GET', 'ratings?select=tmdb_id,member,score,updated_at'); },
    async setRating(tmdbId, member, score) {
      if (score == null) {
        await req('DELETE', `ratings?tmdb_id=eq.${tmdbId}&member=eq.${enc(member)}`, undefined, 'return=minimal');
      } else {
        await req('POST', 'ratings?on_conflict=tmdb_id,member',
          { tmdb_id: tmdbId, member, score, updated_at: new Date().toISOString() },
          'resolution=merge-duplicates,return=minimal');
      }
    },
    async listFlags() { return req('GET', 'movie_flags?select=tmdb_id,excluded,wishlist'); },
    async setFlag(tmdbId, patch) {
      const cur = (await req('GET', `movie_flags?tmdb_id=eq.${tmdbId}&select=*`))[0] || { excluded: false, wishlist: false };
      await req('POST', 'movie_flags?on_conflict=tmdb_id',
        { tmdb_id: tmdbId, excluded: cur.excluded, wishlist: cur.wishlist, ...patch, updated_at: new Date().toISOString() },
        'resolution=merge-duplicates,return=minimal');
    },
    async listCustomMovies() {
      const rows = await req('GET', 'custom_movies?select=movie&tmdb_id=gt.0');
      return rows.map((r) => r.movie);
    },
    async addCustomMovie(movie) {
      await req('POST', 'custom_movies?on_conflict=tmdb_id', { tmdb_id: movie.id, movie },
        'resolution=merge-duplicates,return=minimal');
    },
    // App settings live in custom_movies under negative ids, so no schema change is needed.
    async getSetting(id) {
      const rows = await req('GET', `custom_movies?tmdb_id=eq.${id}&select=movie`);
      return rows[0]?.movie ?? null;
    },
    async putSettingIfAbsent(id, value) {
      await req('POST', 'custom_movies?on_conflict=tmdb_id', { tmdb_id: id, movie: value }, 'resolution=ignore-duplicates,return=minimal');
    },
    async putSetting(id, value) {
      await req('POST', 'custom_movies?on_conflict=tmdb_id', { tmdb_id: id, movie: value }, 'resolution=merge-duplicates,return=minimal');
    },
    async getProviders(ids) {
      if (!ids.length) return [];
      return req('GET', `provider_cache?tmdb_id=in.(${ids.join(',')})&select=*`);
    },
    async putProviders(tmdbId, providers) {
      await req('POST', 'provider_cache?on_conflict=tmdb_id',
        { tmdb_id: tmdbId, providers, fetched_at: new Date().toISOString() },
        'resolution=merge-duplicates,return=minimal');
    },
  };
}
