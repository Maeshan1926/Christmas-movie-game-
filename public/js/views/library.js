import { esc, posterHtml, toast, $ } from '../util.js';
import { app, allMovies, api, mutate, watchedSet, flagsMap } from '../store.js';
import { CATEGORIES } from '../shared/config.js';
import { allServiceNames, availability } from '../shared/streaming.js';
import { ratingsByMovie } from '../shared/stats.js';
import { nightlyPool, rankScore } from '../shared/pool.js';
import { openMovie, openModal, closeModal } from '../components.js';

const PAGE = 60;
const f = { q: '', status: 'all', category: 'all', genre: 'all', service: 'all', decade: 'all', runtime: 'all', cert: 'all', fam: 'all', sort: 'title' };
let shown = PAGE;
let observer = null;
let sortMode = false;

function options(list, cur) {
  return list.map(([v, label]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function facets(movies) {
  const genres = new Set(); const services = new Map(); const decades = new Set(); const certs = new Set();
  for (const m of movies) {
    (m.genres || []).forEach((g) => genres.add(g));
    allServiceNames(m.providers).forEach((s) => services.set(s, (services.get(s) || 0) + 1));
    if (m.year) decades.add(Math.floor(m.year / 10) * 10);
    certs.add(m.cert || 'NR');
  }
  return {
    genres: [...genres].sort(),
    services: [...services.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    decades: [...decades].sort((a, b) => a - b),
    certs: [...certs].sort(),
  };
}

function rotation(movies) {
  const flags = [...flagsMap().values()];
  return nightlyPool(movies, {
    watched: watchedSet(),
    excluded: new Set(flags.filter((x) => x.excluded).map((x) => x.tmdb_id)),
    wishlist: new Set(flags.filter((x) => x.wishlist).map((x) => x.tmdb_id)),
    size: app.state.poolSize || 100,
  });
}

function apply(movies) {
  const watched = watchedSet(); const flags = flagsMap(); const fam = ratingsByMovie(app.state.ratings);
  const pool = f.status === 'rotation' ? rotation(movies) : null;
  const q = f.q.trim().toLowerCase();
  let out = movies.filter((m) => {
    if (q && !`${m.title} ${m.originalTitle || ''} ${m.year || ''}`.toLowerCase().includes(q)) return false;
    const fl = flags.get(m.id) || {};
    if (f.status === 'watched' && !watched.has(m.id)) return false;
    if (f.status === 'unwatched' && (watched.has(m.id) || fl.excluded)) return false;
    if (f.status === 'wishlist' && !fl.wishlist) return false;
    if (f.status === 'excluded' && !fl.excluded) return false;
    if (f.status === 'streaming' && availability(m.providers) !== 'included') return false;
    if (pool && !pool.has(m.id)) return false;
    if (f.category !== 'all' && m.category !== f.category) return false;
    if (f.genre !== 'all' && !(m.genres || []).includes(f.genre)) return false;
    if (f.service !== 'all' && !allServiceNames(m.providers).includes(f.service)) return false;
    if (f.decade !== 'all' && Math.floor((m.year || 0) / 10) * 10 !== Number(f.decade)) return false;
    if (f.cert !== 'all' && (m.cert || 'NR') !== f.cert) return false;
    if (f.runtime !== 'all') {
      const r = m.runtime || 0;
      if (f.runtime === 'short' && !(r && r < 90)) return false;
      if (f.runtime === 'mid' && !(r >= 90 && r <= 120)) return false;
      if (f.runtime === 'long' && !(r > 120)) return false;
    }
    if (f.fam !== 'all') {
      const avg = fam.get(m.id)?.avg;
      if (f.fam === 'unrated' && avg != null) return false;
      if (f.fam !== 'unrated' && !(avg != null && avg >= Number(f.fam))) return false;
    }
    return true;
  });
  const famAvg = (m) => fam.get(m.id)?.avg ?? -1;
  const rated = movies.filter((m) => m.votes > 0);
  const mean = rated.length ? rated.reduce((s, m) => s + (m.score || 0), 0) / rated.length : 6;
  const sorters = {
    title: (a, b) => a.title.localeCompare(b.title),
    newest: (a, b) => (b.year || 0) - (a.year || 0),
    oldest: (a, b) => (a.year || 9999) - (b.year || 9999),
    score: (a, b) => (b.score || 0) - (a.score || 0),
    family: (a, b) => famAvg(b) - famAvg(a) || a.title.localeCompare(b.title),
    runtime: (a, b) => (a.runtime || 999) - (b.runtime || 999),
    rank: (a, b) => rankScore(b, mean) - rankScore(a, mean),
  };
  out = out.sort(sorters[f.sort] || sorters.title);
  return out;
}

export function renderLibrary(el, { keepScroll = false } = {}) {
  const movies = allMovies();
  const fc = facets(movies);
  const active = document.activeElement?.id;
  el.innerHTML = `<div class="stage-head"><div><div class="marquee">${movies.length} Christmas movies</div><h1 class="section-title">Christmas Movie Library</h1></div>
      <div class="card-actions"><button class="btn ${sortMode ? 'btn-gold' : 'btn-ghost'} btn-small" id="sortMode" aria-pressed="${sortMode}">${sortMode ? '✓ Done marking' : '👀 Mark ones we\'ve seen'}</button>
      <button class="btn btn-ghost btn-small" id="addMovie">➕ Add a movie we watched</button></div></div>
    ${sortMode ? `<div class="banner">Tap every movie your family has already seen. Tapped movies leave the nightly picks. Tap again to undo. Showing the nightly top ${app.state.poolSize || 100} first.</div>` : ''}
    <div class="lib-tools">
      <label class="sr-only" for="q">Search movies</label>
      <input class="search" id="q" type="search" placeholder="🔎 Search titles..." value="${esc(f.q)}" autocomplete="off">
      <div class="filters">
        <label>Status<select data-f="status">${options([['all', 'All'], ['rotation', `Nightly top ${app.state.poolSize || 100}`], ['unwatched', 'Unwatched'], ['watched', 'Watched'], ['wishlist', 'Wishlist'], ['excluded', 'Seen before / skipped'], ['streaming', 'Included streaming']], f.status)}</select></label>
        <label>Category<select data-f="category">${options([['all', 'All'], ...CATEGORIES.map((c) => [c.id, `${c.emoji} ${c.label}`])], f.category)}</select></label>
        <label>Genre<select data-f="genre">${options([['all', 'All'], ...fc.genres.map((g) => [g, g])], f.genre)}</select></label>
        <label>Service<select data-f="service">${options([['all', 'Any'], ...fc.services.map((s) => [s, s])], f.service)}</select></label>
        <label>Decade<select data-f="decade">${options([['all', 'Any'], ...fc.decades.map((d) => [d, `${d}s`])], f.decade)}</select></label>
        <label>Runtime<select data-f="runtime">${options([['all', 'Any'], ['short', 'Under 90 min'], ['mid', '90 to 120 min'], ['long', 'Over 2 hours']], f.runtime)}</select></label>
        <label>Age rating<select data-f="cert">${options([['all', 'Any'], ...fc.certs.map((c) => [c, c])], f.cert)}</select></label>
        <label>Family rating<select data-f="fam">${options([['all', 'Any'], ['9', '9+'], ['8', '8+'], ['6', '6+'], ['unrated', 'Not rated yet']], f.fam)}</select></label>
      </div>
      <div class="lib-count"><span id="count"></span>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px">Sort
          <select data-f="sort" style="padding:6px;border-radius:8px;background:#12261d;color:var(--cream);border:1px solid rgba(255,255,255,.2)">${options([['title', 'A to Z'], ['newest', 'Newest'], ['oldest', 'Oldest'], ['score', 'Audience score'], ['family', 'Family rating'], ['runtime', 'Shortest'], ['rank', 'Top ranked']], f.sort)}</select></label>
        <button class="btn btn-ghost btn-small" id="clearF">Clear filters</button></div>
    </div>
    <div class="grid" id="grid"></div><div class="more-sentinel" id="more"></div>`;
  if (!keepScroll) shown = PAGE;
  drawGrid(el);
  const q = $('#q', el);
  q.addEventListener('input', () => { f.q = q.value; shown = PAGE; drawGrid(el); });
  if (active === 'q') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value; shown = PAGE; drawGrid(el); }));
  $('#clearF', el).addEventListener('click', () => { Object.assign(f, { q: '', status: 'all', category: 'all', genre: 'all', service: 'all', decade: 'all', runtime: 'all', cert: 'all', fam: 'all' }); renderLibrary(el); });
  $('#grid', el).addEventListener('click', async (e) => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    const id = Number(t.dataset.open);
    if (!sortMode) { openMovie(id); return; }
    const on = !(flagsMap().get(id)?.excluded);
    t.classList.toggle('dim', on);
    try { await mutate('/api/flag', { tmdbId: id, excluded: on }); } catch (err) { t.classList.toggle('dim', !on); toast(err.message, { error: true }); }
  });
  $('#sortMode', el).addEventListener('click', () => {
    sortMode = !sortMode;
    if (sortMode) { f.status = 'all'; f.sort = 'rank'; }
    renderLibrary(el);
  });
  $('#addMovie', el).addEventListener('click', openAddMovie);
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => {
    if (entries.some((x) => x.isIntersecting)) { shown += PAGE; drawGrid(el, true); }
  }, { rootMargin: '600px' });
  observer.observe($('#more', el));
}

function drawGrid(el, append = false) {
  const list = apply(allMovies());
  const watched = watchedSet(); const flags = flagsMap(); const fam = ratingsByMovie(app.state.ratings);
  const grid = $('#grid', el);
  $('#count', el).textContent = `${list.length} movie${list.length === 1 ? '' : 's'}`;
  const start = append ? grid.children.length : 0;
  const slice = list.slice(start, shown);
  const html = slice.map((m) => {
    const fl = flags.get(m.id) || {};
    const w = watched.has(m.id);
    const avg = fam.get(m.id)?.avg;
    return `<button class="tile ${fl.excluded ? 'dim' : ''}" data-open="${m.id}" aria-label="${esc(m.title)} ${m.year || ''}${w ? ', watched' : ''}">
      ${posterHtml(m, { size: 'w185' })}
      ${w ? `<span class="badge">✔ ${avg != null ? avg : 'Watched'}</span>` : fl.excluded ? '<span class="badge ex">Seen / skipped</span>' : ''}
      ${fl.wishlist ? '<span class="badge wish">⭐</span>' : ''}
      <div class="t">${esc(m.title)}</div><div class="y">${m.year || ''}${m.runtime ? ` · ${m.runtime}m` : ''}</div></button>`;
  }).join('');
  if (append) grid.insertAdjacentHTML('beforeend', html); else grid.innerHTML = html || '<div class="empty" style="grid-column:1/-1">No movies match those filters.</div>';
}

function openAddMovie() {
  if (!app.state.tmdbLive) {
    openModal('Add a movie', '<p>Searching all of TMDB needs the TMDB key on the server. Every movie in the library can be marked watched from its card.</p>');
    return;
  }
  openModal('Add a movie we watched', `<p style="margin-top:0">Search TMDB for any movie, then mark it watched.</p>
    <input class="search" id="tsearch" type="search" placeholder="Movie title" style="color:var(--ink);background:#fff;border-color:var(--gold)">
    <div id="tresults" style="margin-top:10px;display:grid;gap:8px"></div>`, {
    onMount: (body) => {
      let timer;
      const input = $('#tsearch', body);
      input.focus();
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const { results } = await api(`/api/search?q=${encodeURIComponent(input.value)}`);
            $('#tresults', body).innerHTML = results.map((r) => `<button class="btn btn-ghost" style="justify-content:flex-start;text-align:left" data-pick="${r.id}">${esc(r.title)} ${r.year ? `(${r.year})` : ''}${app.movies.has(r.id) ? ' · in library' : ''}</button>`).join('') || '<p class="subtle">No matches.</p>';
          } catch (err) { toast(err.message, { error: true }); }
        }, 350);
      });
      body.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        const id = Number(b.dataset.pick);
        try {
          if (!app.movies.has(id)) await mutate('/api/custom-movie', { tmdbId: id });
          closeModal();
          openMovie(id);
        } catch (err) { toast(err.message, { error: true }); }
      });
    },
  });
}
