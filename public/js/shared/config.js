// Shared configuration used by the browser app, the server functions and the catalog builder.

// Each deployed site sets its own family through FAMILY_NAME and FAMILY_MEMBERS (see README).
export const DEFAULT_FAMILY_NAME = 'Trunk';
export const DEFAULT_MEMBER_NAMES = ['Dad', 'Mommy', 'Lincoln', 'Sienna'];

// Category sets. A site picks one with FAMILY_CATEGORIES (default or kids).
export const CATEGORY_PRESETS = {
  default: [
    { id: 'comedy', label: 'Comedy', emoji: '🎅', color: '#c42c1a', blurb: 'Comedies, rom-coms and family laughs' },
    { id: 'drama', label: 'Drama', emoji: '🎄', color: '#4f8a3c', blurb: 'Heartwarmers, classics and big feelings' },
    { id: 'stocking', label: 'Wild Card', emoji: '✨', color: '#8a6bd8', blurb: 'Action, animation, horror, fantasy, adventure or mystery' },
  ],
  kids: [
    { id: 'kids', label: 'Kids', emoji: '🧸', color: '#2c8fc4', blurb: 'Animated and family favorites' },
    { id: 'comedy', label: 'Comedy', emoji: '🎅', color: '#c42c1a', blurb: 'Christmas comedies and rom-coms' },
    { id: 'classic', label: 'Traditional', emoji: '🎄', color: '#4f8a3c', blurb: 'Classics, carols and heartwarmers' },
  ],
};
export function normalizePreset(v) { return CATEGORY_PRESETS[String(v || '').trim().toLowerCase()] ? String(v).trim().toLowerCase() : 'default'; }

/** Category a movie belongs to under a preset. Default keeps the catalog's own category. */
export function categoryFor(m, preset = 'default') {
  if (preset !== 'kids') return m.category;
  const g = m.genres || [];
  const horror = g.includes('Horror') || (m.tags || []).includes('horror');
  if (!horror && (g.includes('Animation') || g.includes('Family') || (m.tags || []).includes('animated'))) return 'kids';
  if (g.includes('Comedy') && (m.year || 0) >= 1980) return 'comedy';
  return 'classic';
}

// Mutated in place by setFamily so every importer sees the current family's categories.
export const CATEGORIES = CATEGORY_PRESETS.default.map((c) => ({ ...c }));
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const REROLLS_PER_CATEGORY = 1;

const MEMBER_COLORS = ['#2f7d4f', '#c0392b', '#2c6fbb', '#b8860b', '#8e44ad', '#d35400', '#16a085', '#7f8c8d'];

/** Stable id for a member name: "Dad" -> "dad", "Mary Ann" -> "mary-ann". Ratings are stored by this id. */
export function memberId(name) {
  return String(name).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildMembers(names) {
  const clean = (names || []).map((n) => String(n).trim()).filter(Boolean);
  const list = clean.length ? clean : DEFAULT_MEMBER_NAMES;
  return list.slice(0, 8).map((label, i) => ({ id: memberId(label), label, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }));
}

// Mutated in place by setFamily so every importer sees the current family.
export const MEMBERS = buildMembers(DEFAULT_MEMBER_NAMES);
export const MEMBER_IDS = MEMBERS.map((m) => m.id);
export const FAMILY = { name: DEFAULT_FAMILY_NAME, hero: null, maxRating: null, categories: 'default' };

export function setFamily({ name, members, hero } = {}) {
  if (name) FAMILY.name = name;
  FAMILY.hero = hero || null;
  const opts = arguments[0] || {};
  if ('maxRating' in opts) FAMILY.maxRating = opts.maxRating || null;
  if ('categories' in opts) {
    FAMILY.categories = normalizePreset(opts.categories);
    const next = CATEGORY_PRESETS[FAMILY.categories].map((c) => ({ ...c }));
    CATEGORIES.splice(0, CATEGORIES.length, ...next);
    CATEGORY_IDS.splice(0, CATEGORY_IDS.length, ...next.map((c) => c.id));
    Object.keys(categoryById).forEach((k) => delete categoryById[k]);
    next.forEach((c) => { categoryById[c.id] = c; });
  }
  if (members?.length) {
    const next = members[0]?.id ? members : buildMembers(members);
    MEMBERS.splice(0, MEMBERS.length, ...next);
    MEMBER_IDS.splice(0, MEMBER_IDS.length, ...next.map((m) => m.id));
  }
}

// Services the family subscribes to. TMDB/JustWatch provider ids (US).
// "Included" means the movie streams on any flatrate, free or ad-supported service;
// titles on these named services rank first in nightly picks.
export const SUBSCRIBED_PROVIDERS = {
  8: 'Netflix',
  9: 'Amazon Prime Video',
  119: 'Amazon Prime Video',
  337: 'Disney Plus',
  15: 'Hulu',
  1899: 'Max',
  384: 'HBO Max',
  350: 'Apple TV+',
  2: 'Apple TV',
  531: 'Paramount Plus',
  386: 'Peacock',
  387: 'Peacock Premium',
  43: 'Starz',
  37: 'Showtime',
  526: 'AMC+',
  283: 'Crunchyroll',
  73: 'Tubi',
  300: 'Pluto TV',
  207: 'The Roku Channel',
  613: 'Freevee',
  457: 'VIX',
  1771: 'Netflix with Ads',
  1796: 'Netflix Standard with Ads',
  2303: 'Paramount Plus Premium',
  2616: 'Paramount Plus Essential',
  151: 'BritBox',
  99: 'Shudder',
  257: 'fuboTV',
  1853: 'Paramount Plus Apple TV Channel',
};

// Achievements. Unlock rules live in stats.js -> achievements().
export const ACHIEVEMENTS = [
  { id: 'first-snow', icon: '❄️', name: 'First Snow', desc: 'Watch your first movie' },
  { id: 'ho-ho-hollywood', icon: '🎬', name: 'Ho Ho Hollywood', desc: 'Watch five movies' },
  { id: 'marathon', icon: '🏃', name: 'Christmas Marathon', desc: 'Watch ten movies' },
  { id: 'ghost-past', icon: '👻', name: 'Ghost of Christmas Past', desc: 'Watch a movie released before 1980' },
  { id: 'naughty-list', icon: '😈', name: 'Naughty List', desc: 'Watch a Christmas horror movie' },
  { id: 'yippee', icon: '💥', name: 'Yippee Ki Yay', desc: 'Watch a Christmas action movie' },
  { id: 'family-favorite', icon: '⭐', name: 'Family Favorite', desc: 'Everyone rates a movie nine or higher' },
  { id: 'royalty', icon: '👑', name: 'Christmas Royalty', desc: 'Watch 25 movies' },
  { id: 'twelve-nights', icon: '🕯️', name: 'Twelve Nights', desc: 'Watch movies twelve nights in a row' },
  { id: 'eve-tradition', icon: '🌟', name: 'Christmas Eve Tradition', desc: 'Watch a movie on December 24' },
  { id: 'full-stocking', icon: '🧦', name: 'Full Stocking', desc: 'Watch a movie from every category' },
  { id: 'toon-town', icon: '🦌', name: 'Toon Town', desc: 'Watch an animated Christmas movie' },
];

export const PROVIDER_TTL_HOURS = 72;
