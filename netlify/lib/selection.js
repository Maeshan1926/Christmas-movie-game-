// Nightly selection rules. Pure functions: all randomness comes from `rng`.
import { CATEGORY_IDS, REROLLS_PER_CATEGORY } from '../../public/js/shared/config.js';
import { availability, onSubscribedService } from '../../public/js/shared/streaming.js';

export const RECENT_NIGHTS_TO_AVOID = 14;

export function movieWeight(m, { wishlist }) {
  const a = availability(m.providers);
  let w = a === 'included' ? (onSubscribedService(m.providers) ? 5 : 3) : a === 'rent' || a === 'buy' ? 1.2 : 0.5;
  if (wishlist.has(m.id)) w *= 3;
  if ((m.score || 0) >= 7 && (m.votes || 0) >= 100) w *= 1.3;
  return w;
}

function weightedPick(items, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Pick one movie for a category.
 * @param {object} ctx { catalog: Movie[], watched:Set, excluded:Set, wishlist:Set, taken:Set, recent:Set, rng }
 */
export function pickForCategory(category, ctx) {
  const base = ctx.catalog.filter((m) => m.category === category
    && !ctx.watched.has(m.id) && !ctx.excluded.has(m.id) && !ctx.taken.has(m.id)
    && (!ctx.pool || ctx.pool.has(m.id)));
  if (!base.length) return null;
  const fresh = base.filter((m) => !ctx.recent.has(m.id));
  const pool = fresh.length ? fresh : base;
  return weightedPick(pool, pool.map((m) => movieWeight(m, ctx)), ctx.rng).id;
}

export function allPicked(night) {
  return new Set(CATEGORY_IDS.flatMap((c) => night.picks[c] || []).filter((x) => x != null));
}

export function generateNight(day, ctx) {
  const taken = new Set();
  const picks = {};
  for (const c of CATEGORY_IDS) {
    const id = pickForCategory(c, { ...ctx, taken });
    picks[c] = id == null ? [] : [id];
    if (id != null) taken.add(id);
  }
  return {
    night: day,
    picks,
    rerolls: Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0])),
    chosen: null,
    started_at: null,
    version: 1,
  };
}

export class RuleError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

/** Returns the patch for a reroll, or throws RuleError. */
/** Swap one of tonight's movies for a fresh pick without using the reroll (family has seen it). */
export function replacePatch(night, tmdbId, ctx) {
  const category = CATEGORY_IDS.find((c) => (night.picks[c] || []).includes(tmdbId));
  if (!category) throw new RuleError('That movie is not in tonight\'s lineup.', 400);
  const taken = allPicked(night);
  const id = pickForCategory(category, { ...ctx, taken });
  const list = night.picks[category].map((x) => (x === tmdbId ? id : x)).filter((x) => x != null);
  return {
    picks: { ...night.picks, [category]: list },
    chosen: night.chosen === tmdbId ? null : night.chosen,
    replacedWith: id,
  };
}

export function rerollPatch(night, category, ctx) {
  if (!CATEGORY_IDS.includes(category)) throw new RuleError('Unknown category', 400);
  const used = night.rerolls?.[category] || 0;
  if (used >= REROLLS_PER_CATEGORY) throw new RuleError('That stocking has already been rerolled tonight. New rerolls arrive at midnight Pacific.');
  const taken = allPicked(night);
  const id = pickForCategory(category, { ...ctx, taken });
  if (id == null) throw new RuleError('No more unwatched movies left in this category.');
  return {
    picks: { ...night.picks, [category]: [...(night.picks[category] || []), id] },
    rerolls: { ...night.rerolls, [category]: used + 1 },
  };
}
