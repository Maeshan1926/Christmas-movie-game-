// Turns a TMDB movie details payload into the compact record the app uses.
import { normalizeProviders, usCertification, pickTrailer } from './tmdb.js';

const HINT = { c: 'comedy', d: 'drama', s: 'stocking' };
const STOCKING_FIRST = ['Horror', 'Action', 'Animation', 'Thriller', 'Crime', 'Mystery', 'Science Fiction', 'Western', 'War'];

export const STOCKING_GENRES = [...STOCKING_FIRST, 'Fantasy', 'Adventure'];

/**
 * Comedy and Drama hints are trusted. The Mystery Stocking only takes movies TMDB files under
 * action, animation, horror, fantasy, adventure, mystery, thriller, crime, sci-fi, western or war.
 */
export function categorize(genres, hint) {
  if (hint === 'c' || hint === 'd') return HINT[hint];
  const stockingGenre = genres.some((g) => STOCKING_GENRES.includes(g));
  if (hint === 's' && (stockingGenre || !genres.length)) return 'stocking';
  if (genres.some((g) => STOCKING_FIRST.includes(g))) return 'stocking';
  if (genres.includes('Comedy')) return 'comedy';
  if (stockingGenre) return 'stocking';
  return 'drama';
}

const XMAS_RE = /\b(christmas|xmas|santa(?! (fe|barbara|monica|clarita|sangre|cruz|maria|rosa|ana))|krampus|nativity|yule|north pole|reindeer|scrooge|nutcracker|mistletoe|grinch|advent calendar|jingle|noel|noël|sinterklaas|kerst|weihnacht|navidad|natale|jul|joulu)/i;

/** True when TMDB tags the movie with a Christmas keyword or its title names Christmas. */
export function isChristmasMovie(d) {
  const kws = (d.keywords?.keywords || d.keywords?.results || []).map((k) => k.name);
  if (kws.some((k) => XMAS_RE.test(k))) return true;
  return [d.title, d.original_title].some((t) => t && XMAS_RE.test(t));
}

const GENRE_TAGS = { Horror: 'horror', Action: 'action', Animation: 'animated', Mystery: 'mystery', Romance: 'romance', Fantasy: 'fantasy', Music: 'musical' };

/** Keep the synopsis short so it stays spoiler-light: at most two sentences / ~280 chars. */
export function spoilerSafe(overview) {
  if (!overview) return '';
  const sentences = overview.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [overview];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 280 && out) break;
    out += s;
    if (out.length > 160) break;
  }
  return out.trim();
}

export function buildMovieRecord(d, { hint, tags = [], curated = false } = {}) {
  const genres = (d.genres || []).map((g) => g.name);
  const allTags = new Set(tags);
  for (const g of genres) if (GENRE_TAGS[g]) allTags.add(GENRE_TAGS[g]);
  if (d.original_language && d.original_language !== 'en') allTags.add('intl');
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : null;
  if (year && year < 1970) allTags.add('classic');
  return {
    id: d.id,
    title: d.title,
    originalTitle: d.original_title !== d.title ? d.original_title : undefined,
    year,
    date: d.release_date || null,
    genres,
    category: categorize(genres, hint),
    tags: [...allTags],
    runtime: d.runtime || null,
    cert: usCertification(d.release_dates),
    score: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    votes: d.vote_count || 0,
    overview: spoilerSafe(d.overview),
    poster: d.poster_path || null,
    backdrop: d.backdrop_path || null,
    trailer: pickTrailer(d.videos),
    lang: d.original_language || null,
    providers: normalizeProviders(d['watch/providers']),
    curated,
  };
}

export const DETAIL_APPEND = 'release_dates,videos,watch/providers,keywords';
