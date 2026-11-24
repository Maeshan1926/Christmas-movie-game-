// Shared configuration used by the browser app, the server functions and the catalog builder.

export const APP_NAME = 'The Trunk Family Christmas Movie Challenge';

export const CATEGORIES = [
  { id: 'comedy', label: 'Comedy', emoji: '🎅', blurb: 'Christmas comedies, rom-coms and family laughs' },
  { id: 'drama', label: 'Drama', emoji: '🎄', blurb: 'Heartwarmers, romance, classics and big feelings' },
  { id: 'stocking', label: 'Mystery Stocking', emoji: '🎁', blurb: 'Action, animation, horror, fantasy, adventure or mystery' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const REROLLS_PER_CATEGORY = 1;

export const MEMBERS = [
  { id: 'dad', label: 'Dad', color: '#2f7d4f' },
  { id: 'mommy', label: 'Mommy', color: '#c0392b' },
  { id: 'lincoln', label: 'Lincoln', color: '#2c6fbb' },
  { id: 'sienna', label: 'Sienna', color: '#b8860b' },
];
export const MEMBER_IDS = MEMBERS.map((m) => m.id);

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
