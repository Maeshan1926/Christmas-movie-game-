// In-memory store used for tests and local development. Optional JSON file persistence.
import fs from 'node:fs';
import path from 'node:path';

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

export function createMemoryStore({ file } = {}) {
  let db = { nights: {}, watches: [], ratings: [], flags: {}, providers: {}, custom: {}, seq: 1 };
  if (file && fs.existsSync(file)) {
    try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* start fresh */ }
  }
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  };

  return {
    kind: 'memory',
    async getNight(day) { return clone(db.nights[day] || null); },
    async insertNight(night) {
      if (!db.nights[night.night]) { db.nights[night.night] = clone(night); save(); }
      return clone(db.nights[night.night]);
    },
    async updateNight(day, version, patch) {
      const cur = db.nights[day];
      if (!cur || cur.version !== version) return null;
      db.nights[day] = { ...cur, ...clone(patch), version: version + 1 };
      save();
      return clone(db.nights[day]);
    },
    async recentNights(beforeDay, n) {
      return clone(Object.values(db.nights).filter((x) => x.night < beforeDay)
        .sort((a, b) => (a.night < b.night ? 1 : -1)).slice(0, n));
    },
    async listWatches() { return clone(db.watches); },
    async addWatch(w) {
      const row = { id: db.seq++, returned: false, created_at: new Date().toISOString(), ...w };
      db.watches.push(row); save(); return clone(row);
    },
    async returnToRotation(tmdbId) {
      db.watches.forEach((w) => { if (w.tmdb_id === tmdbId) w.returned = true; }); save();
    },
    async deleteWatch(id) { db.watches = db.watches.filter((w) => w.id !== id); save(); },
    async listRatings() { return clone(db.ratings); },
    async setRating(tmdbId, member, score) {
      db.ratings = db.ratings.filter((r) => !(r.tmdb_id === tmdbId && r.member === member));
      if (score != null) db.ratings.push({ tmdb_id: tmdbId, member, score, updated_at: new Date().toISOString() });
      save();
    },
    async listFlags() { return clone(Object.values(db.flags)); },
    async setFlag(tmdbId, patch) {
      db.flags[tmdbId] = { tmdb_id: tmdbId, excluded: false, wishlist: false, ...db.flags[tmdbId], ...patch };
      save();
    },
    async listCustomMovies() { return clone(Object.values(db.custom || {}).map((r) => r.movie)); },
    async addCustomMovie(movie) { db.custom = db.custom || {}; db.custom[movie.id] = { movie }; save(); },
    async getProviders(ids) { return clone(ids.map((id) => db.providers[id]).filter(Boolean)); },
    async putProviders(tmdbId, providers) {
      db.providers[tmdbId] = { tmdb_id: tmdbId, providers, fetched_at: new Date().toISOString() }; save();
    },
  };
}
