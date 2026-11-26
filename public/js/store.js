// Client state: the static catalog plus the shared family state from the server.
import { storage } from './util.js';
import { setFamily, FAMILY, categoryFor } from './shared/config.js';
import { allowedByRating } from './shared/ratings.js';

const listeners = new Set();
export const app = {
  code: storage('xmas-family-code'),
  catalog: [],
  catalogMeta: null,
  movies: new Map(),
  state: null,
  lastJson: '',
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(changed) { listeners.forEach((fn) => fn(changed)); }

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-family-code': app.code || '' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data;
}

export async function loadCatalog() {
  const res = await fetch('/data/catalog.json');
  if (!res.ok) throw new Error('Movie catalog missing. Run the build.');
  const data = await res.json();
  app.catalogMeta = { source: data.source, generatedAt: data.generatedAt, count: data.count };
  app.catalog = data.movies;
  indexMovies();
}

function indexMovies() {
  // Movies above the family's age-rating limit never show, except ones they already watched or added.
  const watchedIds = new Set((app.state?.watches || []).map((w) => w.tmdb_id));
  const remap = (m) => (FAMILY.categories === 'default' ? m : { ...m, category: categoryFor(m, FAMILY.categories) });
  app.movies = new Map(app.catalog.filter((m) => allowedByRating(m, FAMILY.maxRating) || watchedIds.has(m.id)).map(remap)
    .filter((m) => m.category || watchedIds.has(m.id)).map((m) => [m.id, m]));
  for (const m of app.state?.customMovies || []) if (!app.movies.has(m.id)) app.movies.set(m.id, remap(m));
  for (const m of app.state?.hundredExtra || []) if (m && !app.movies.has(m.id)) app.movies.set(m.id, remap(m));
}

/** The frozen Christmas 100 in rank order, as movie records. */
export function hundredMovies() {
  return (app.state?.hundred?.ids || []).map((id) => app.movies.get(id)).filter(Boolean);
}
export function hundredRank(id) {
  const i = (app.state?.hundred?.ids || []).indexOf(id);
  return i < 0 ? null : i + 1;
}
/** Movies in the 100 that the family has ever finished (replays included). */
export function hundredWatchedIds() {
  const ids = new Set(app.state?.hundred?.ids || []);
  return new Set((app.state?.watches || []).filter((w) => ids.has(w.tmdb_id)).map((w) => w.tmdb_id));
}
export function firstWatch(id) {
  return (app.state?.watches || []).filter((w) => w.tmdb_id === id).sort((a, b) => (a.watched_on < b.watched_on ? -1 : 1))[0] || null;
}

export function allMovies() { return [...app.movies.values()]; }

export function setState(s) {
  const json = JSON.stringify({ ...s, serverTime: 0, nextResetInMs: 0 });
  const changed = json !== app.lastJson;
  app.state = s;
  app.lastJson = json;
  if (s.family) setFamily(s.family);
  indexMovies();
  // Fresh provider data for tonight's picks overrides the build-time snapshot.
  for (const [id, p] of Object.entries(s.providers || {})) {
    const m = app.movies.get(Number(id));
    if (m && p) m.providers = p;
  }
  scheduleMidnight(s.nextResetInMs);
  emit(changed);
}

export async function refresh() {
  setState(await api('/api/state'));
}

export async function mutate(path, body) {
  const s = await api(path, { method: 'POST', body });
  setState(s.state || s);
  return s;
}

let midnightTimer;
function scheduleMidnight(ms) {
  clearTimeout(midnightTimer);
  if (ms > 0 && ms < 26 * 3600 * 1000) midnightTimer = setTimeout(() => refresh().catch(() => {}), ms + 3000);
}

let pollTimer;
export function startPolling() {
  const tick = () => { if (!document.hidden) refresh().catch(() => {}); };
  clearInterval(pollTimer);
  pollTimer = setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('focus', tick);
}

// Derived helpers
export function watchedSet() {
  return new Set((app.state?.watches || []).filter((w) => !w.returned).map((w) => w.tmdb_id));
}
export function flagsMap() {
  return new Map((app.state?.flags || []).map((f) => [f.tmdb_id, f]));
}
export function activeWatch(id) {
  return (app.state?.watches || []).find((w) => w.tmdb_id === id && !w.returned) || null;
}
