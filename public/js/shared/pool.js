// The nightly rotation: the best-rated unwatched movies, ranked by a weighted audience score.
import { CATEGORY_IDS } from './config.js';

export const DEFAULT_POOL_SIZE = 100;
const PRIOR_VOTES = 500; // votes needed before a movie's own average dominates

/** IMDb-style weighted rating: pulls low-vote movies toward the catalog average. */
export function rankScore(m, mean) {
  const v = m.votes || 0;
  const r = m.score || 0;
  return (v / (v + PRIOR_VOTES)) * r + (PRIOR_VOTES / (v + PRIOR_VOTES)) * mean;
}

/** Rank (1 = best) of every movie in the catalog by weighted audience score. */
export function overallRanks(catalog) {
  const rated = catalog.filter((m) => m.votes > 0);
  const mean = rated.length ? rated.reduce((s, m) => s + (m.score || 0), 0) / rated.length : 6;
  const sorted = [...catalog].sort((a, b) => rankScore(b, mean) - rankScore(a, mean) || a.title.localeCompare(b.title));
  return new Map(sorted.map((m, i) => [m.id, i + 1]));
}

/**
 * Ids of movies eligible for nightly picks.
 * @param {object[]} catalog
 * @param {{watched:Set, excluded:Set, wishlist:Set, size?:number}} opts
 */
export function nightlyPool(catalog, { watched, excluded, wishlist, size = DEFAULT_POOL_SIZE }) {
  const open = catalog.filter((m) => !watched.has(m.id) && !excluded.has(m.id));
  const rated = catalog.filter((m) => m.votes > 0);
  const mean = rated.length ? rated.reduce((s, m) => s + (m.score || 0), 0) / rated.length : 6;
  const ranked = [...open].sort((a, b) => rankScore(b, mean) - rankScore(a, mean) || a.title.localeCompare(b.title));
  const pool = new Set();
  const floor = Math.floor(size * 0.2);
  for (const c of CATEGORY_IDS) ranked.filter((m) => m.category === c).slice(0, floor).forEach((m) => pool.add(m.id));
  for (const m of ranked) { if (pool.size >= size) break; pool.add(m.id); }
  for (const m of open) if (wishlist.has(m.id)) pool.add(m.id);
  return pool;
}
