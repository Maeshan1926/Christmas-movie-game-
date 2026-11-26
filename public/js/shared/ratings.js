// Age-rating limits per family (FAMILY_MAX_RATING). US MPA and TV ratings map onto one scale.
const SCALE = { G: 0, PG: 1, 'PG-13': 2, R: 3, 'NC-17': 4 };
const TV = { 'TV-Y': 0, 'TV-Y7': 0, 'TV-G': 0, 'TV-PG': 1, 'TV-14': 2, 'TV-MA': 3 };

export function normalizeMaxRating(v) {
  const s = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s || s === 'ANY' || s === 'NONE') return null;
  const key = s === 'PG13' ? 'PG-13' : s === 'NC17' ? 'NC-17' : s;
  return key in SCALE ? key : null;
}

export function ratingLevel(cert) {
  const c = String(cert || '').trim().toUpperCase();
  if (c in SCALE) return SCALE[c];
  if (c in TV) return TV[c];
  return null; // unrated
}

/**
 * True when a movie fits the family's limit. Unrated titles (common for TV movies) are allowed
 * unless they are horror, so a "PG-13" family never gets an unrated slasher.
 */
export function allowedByRating(m, max) {
  const limit = normalizeMaxRating(max);
  if (limit == null) return true;
  const lvl = ratingLevel(m?.cert);
  if (lvl == null) return !((m?.genres || []).includes('Horror') || (m?.tags || []).includes('horror'));
  return lvl <= SCALE[limit];
}
