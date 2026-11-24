// Pure statistics and achievement logic shared by the UI and the test suite.
import { MEMBER_IDS, CATEGORY_IDS, ACHIEVEMENTS } from './config.js';
import { seasonOf, addDays, diffDays } from './dates.js';

export function isHorror(m) {
  return !!m && ((m.genres || []).includes('Horror') || (m.tags || []).includes('horror'));
}
export function isAction(m) {
  return !!m && ((m.genres || []).includes('Action') || (m.tags || []).includes('action'));
}
export function isAnimated(m) {
  return !!m && ((m.genres || []).includes('Animation') || (m.tags || []).includes('animated'));
}

/** Movie ids currently marked watched (lifetime, ignoring entries returned to rotation). */
export function activeWatchedIds(watches) {
  return new Set(watches.filter((w) => !w.returned).map((w) => w.tmdb_id));
}

/** Map tmdb_id -> { scores: {member: score}, avg, count } */
export function ratingsByMovie(ratings) {
  const out = new Map();
  for (const r of ratings) {
    if (r.score == null) continue;
    const e = out.get(r.tmdb_id) || { scores: {}, avg: null, count: 0 };
    e.scores[r.member] = Number(r.score);
    out.set(r.tmdb_id, e);
  }
  for (const e of out.values()) {
    const vals = Object.values(e.scores);
    e.count = vals.length;
    e.avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }
  return out;
}

export function streaks(days, today) {
  const set = new Set(days);
  const sorted = [...set].sort();
  let best = 0; let run = 0; let prev = null;
  for (const d of sorted) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) { current += 1; cursor = addDays(cursor, -1); }
  return { current, best };
}

/**
 * Summarize a scope of watches.
 * @param {object} p
 * @param {Map<number,object>} p.movies catalog by id
 * @param {Array} p.watches all watch rows
 * @param {Array} p.ratings all rating rows
 * @param {number|'lifetime'} p.scope season year or 'lifetime'
 * @param {string} p.today Pacific date
 */
export function summarize({ movies, watches, ratings, scope, today }) {
  const scoped = watches
    .filter((w) => scope === 'lifetime' || seasonOf(w.watched_on) === scope)
    .sort((a, b) => (a.watched_on === b.watched_on ? a.id - b.id : a.watched_on < b.watched_on ? -1 : 1));
  const rmap = ratingsByMovie(ratings);
  const byCategory = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0]));
  let minutes = 0;
  const entries = scoped.map((w) => {
    const m = movies.get(w.tmdb_id) || null;
    if (m) { byCategory[m.category] = (byCategory[m.category] || 0) + 1; minutes += m.runtime || 0; }
    const r = rmap.get(w.tmdb_id) || null;
    return { watch: w, movie: m, rating: r };
  });
  const uniqueIds = [...new Set(scoped.map((w) => w.tmdb_id))];
  const rated = uniqueIds
    .map((id) => ({ id, movie: movies.get(id), rating: rmap.get(id) }))
    .filter((x) => x.rating && x.rating.avg != null && x.movie);
  const leaderboard = [...rated].sort((a, b) => b.rating.avg - a.rating.avg || b.rating.count - a.rating.count || a.movie.title.localeCompare(b.movie.title));
  const avgFamily = rated.length ? Math.round((rated.reduce((s, x) => s + x.rating.avg, 0) / rated.length) * 10) / 10 : null;
  const memberAverages = Object.fromEntries(MEMBER_IDS.map((mid) => {
    const vals = uniqueIds.map((id) => rmap.get(id)?.scores[mid]).filter((v) => v != null);
    return [mid, vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null];
  }));
  const st = streaks(scoped.map((w) => w.watched_on), today);
  const summary = {
    count: scoped.length,
    uniqueCount: uniqueIds.length,
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
    byCategory,
    avgFamily,
    memberAverages,
    highest: leaderboard[0] || null,
    lowest: leaderboard.length > 1 ? leaderboard[leaderboard.length - 1] : null,
    leaderboard,
    streak: st.current,
    bestStreak: st.best,
    entries,
  };
  summary.achievements = achievements(summary, rmap);
  return summary;
}

/** Returns [{...achievement, unlocked, on (date unlocked), movieId}] */
export function achievements(summary, rmap) {
  const e = summary.entries;
  const at = (i) => (e[i] ? { on: e[i].watch.watched_on, movieId: e[i].watch.tmdb_id } : null);
  const firstWhere = (fn) => {
    const x = e.find((en) => fn(en.movie, en));
    return x ? { on: x.watch.watched_on, movieId: x.watch.tmdb_id } : null;
  };
  const familyFav = () => {
    for (const en of e) {
      const r = rmap.get(en.watch.tmdb_id);
      if (r && MEMBER_IDS.every((m) => r.scores[m] != null && r.scores[m] >= 9)) return { on: en.watch.watched_on, movieId: en.watch.tmdb_id };
    }
    return null;
  };
  const streakHit = (n) => {
    const days = [...new Set(e.map((x) => x.watch.watched_on))].sort();
    let run = 0; let prev = null;
    for (const d of days) {
      run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
      if (run >= n) return { on: d, movieId: e.find((x) => x.watch.watched_on === d).watch.tmdb_id };
      prev = d;
    }
    return null;
  };
  const allCats = () => {
    const seen = new Set();
    for (const en of e) {
      if (en.movie) seen.add(en.movie.category);
      if (CATEGORY_IDS.every((c) => seen.has(c))) return { on: en.watch.watched_on, movieId: en.watch.tmdb_id };
    }
    return null;
  };
  const results = {
    'first-snow': at(0),
    'ho-ho-hollywood': at(4),
    marathon: at(9),
    'ghost-past': firstWhere((m) => m && m.year && m.year < 1980),
    'naughty-list': firstWhere((m) => isHorror(m)),
    yippee: firstWhere((m) => isAction(m)),
    'family-favorite': familyFav(),
    royalty: at(24),
    'twelve-nights': streakHit(12),
    'eve-tradition': firstWhere((m, en) => en.watch.watched_on.slice(5) === '12-24'),
    'full-stocking': allCats(),
    'toon-town': firstWhere((m) => isAnimated(m)),
  };
  return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: !!results[a.id], ...(results[a.id] || {}) }));
}

export function seasonsWithData(watches, currentSeason) {
  const s = new Set(watches.map((w) => seasonOf(w.watched_on)));
  s.add(currentSeason);
  return [...s].sort((a, b) => b - a);
}
