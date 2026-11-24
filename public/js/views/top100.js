import { esc, posterUrl, toast, $ } from '../util.js';
import { app, api, mutate, allMovies, hundredMovies, hundredRank, hundredWatchedIds, flagsMap, firstWatch } from '../store.js';
import { ratingsByMovie } from '../shared/stats.js';
import { overallRanks } from '../shared/pool.js';
import { formatDay } from '../shared/dates.js';
import { openMovie, openModal, closeModal } from '../components.js';

const PAGE = 60;
const f = { scope: '100', q: '', status: 'all', genre: 'all', sort: 'rank' };
let shown = PAGE;
let observer = null;

function list() {
  const inScope = f.scope === '100' ? hundredMovies() : allMovies();
  const watched = f.scope === '100' ? hundredWatchedIds() : new Set((app.state.watches || []).map((w) => w.tmdb_id));
  const flags = flagsMap();
  const q = f.q.trim().toLowerCase();
  const ranks = f.scope === '100' ? null : overallRanks(inScope);
  const rankOf = (m) => (f.scope === '100' ? hundredRank(m.id) : ranks.get(m.id));
  const fam = ratingsByMovie(app.state.ratings || []);
  let out = inScope.filter((m) => {
    if (q && !`${m.title} ${m.originalTitle || ''} ${m.year || ''}`.toLowerCase().includes(q)) return false;
    if (f.status === 'watched' && !watched.has(m.id)) return false;
    if (f.status === 'unwatched' && watched.has(m.id)) return false;
    if (f.status === 'skipped' && !flags.get(m.id)?.excluded) return false;
    if (f.genre !== 'all' && !(m.genres || []).includes(f.genre)) return false;
    return true;
  });
  const sorters = {
    rank: (a, b) => rankOf(a) - rankOf(b),
    newest: (a, b) => (b.year || 0) - (a.year || 0) || rankOf(a) - rankOf(b),
    oldest: (a, b) => (a.year || 9999) - (b.year || 9999) || rankOf(a) - rankOf(b),
    rating: (a, b) => (b.score || 0) - (a.score || 0) || rankOf(a) - rankOf(b),
    family: (a, b) => (fam.get(b.id)?.avg ?? -1) - (fam.get(a.id)?.avg ?? -1) || rankOf(a) - rankOf(b),
  };
  out = out.sort(sorters[f.sort] || sorters.rank);
  return { out, watched, flags, rankOf };
}

function tile(m, { watched, flags, rankOf }) {
  const w = watched.has(m.id);
  const fw = w ? firstWatch(m.id) : null;
  const skipped = !w && flags.get(m.id)?.excluded;
  return `<button class="ptile ${w ? 'watched' : ''} ${skipped ? 'skipped' : ''}" data-open="${m.id}" aria-label="#${rankOf(m)} ${esc(m.title)}${w ? ', watched' : ''}">
    <div class="frame">${m.poster ? `<img src="${posterUrl(m.poster, 'w185')}" srcset="${posterUrl(m.poster, 'w185')} 185w, ${posterUrl(m.poster, 'w342')} 342w" sizes="(min-width:900px) 170px, 32vw" alt="" width="185" height="278" loading="lazy" decoding="async">` : `<div class="no-poster">${esc(m.title)}</div>`}
      <span class="num">${rankOf(m)}</span>${w ? '<span class="check" aria-hidden="true">✓</span>' : ''}</div>
    <div class="t">${esc(m.title)}</div>
    <div class="d ${w ? 'ok' : ''}">${w && fw ? `Watched ${formatDay(fw.watched_on, { month: 'short', day: 'numeric', year: '2-digit' })}` : skipped ? 'Skipped in picks' : m.year || ''}</div></button>`;
}

export function renderTop100(el, { keepScroll = false } = {}) {
  const total = app.state.hundred?.ids?.length || 0;
  const done = hundredWatchedIds().size;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const scopeMovies = f.scope === '100' ? hundredMovies() : allMovies();
  const genres = [...new Set(scopeMovies.flatMap((m) => m.genres || []))].sort();
  const active = document.activeElement?.id;
  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">${f.scope === '100' ? 'Ranked by audience love' : `All ${allMovies().length} Christmas movies`}</div>
      <h1 class="page-title">${f.scope === '100' ? 'The Christmas 100' : 'Christmas Library'}</h1></div></div>
    <div class="progress"><div class="nums"><span><b>${done}</b> of ${total} watched</span><span><b>${pct}%</b></span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Christmas 100 progress"><i style="width:${pct}%"></i></div></div>
    <div class="tools">
      <label class="sr-only" for="q">Search movies</label>
      <input class="search" id="q" type="search" placeholder="Search titles" value="${esc(f.q)}" autocomplete="off">
      <div class="chips" role="group" aria-label="Show">
        ${[['all', 'All'], ['unwatched', 'Unwatched'], ['watched', 'Watched'], ['skipped', 'Skipped']].map(([v, l]) => `<button class="chip-btn" data-status="${v}" aria-pressed="${f.status === v}">${l}</button>`).join('')}
      </div>
      <div class="selects">
        <label class="sr-only" for="genre">Genre</label>
        <select id="genre">${[['all', 'All genres'], ...genres.map((g) => [g, g])].map(([v, l]) => `<option value="${esc(v)}" ${f.genre === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <label class="sr-only" for="sort">Sort</label>
        <select id="sort">${[['rank', 'Sort: Rank'], ['newest', 'Sort: Newest'], ['oldest', 'Sort: Oldest'], ['rating', 'Sort: Audience rating'], ['family', 'Sort: Family rating']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
    </div>
    <div class="posters" id="grid"></div><div class="more-sentinel" id="more"></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px">
      <button class="btn btn-ghost btn-small" id="scope">${f.scope === '100' ? `Browse all ${allMovies().length} Christmas movies` : '‹ Back to the Christmas 100'}</button>
      ${f.scope === 'all' ? '<button class="btn btn-ghost btn-small" id="addMovie">➕ Add a movie we watched</button>' : ''}
    </div>`;
  if (!keepScroll) shown = PAGE;
  draw(el);
  const q = $('#q', el);
  q.addEventListener('input', () => { f.q = q.value; shown = PAGE; draw(el); });
  if (active === 'q') { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { f.status = b.dataset.status; renderTop100(el); }));
  $('#genre', el).addEventListener('change', (e) => { f.genre = e.target.value; shown = PAGE; draw(el); });
  $('#sort', el).addEventListener('change', (e) => { f.sort = e.target.value; shown = PAGE; draw(el); });
  $('#scope', el).addEventListener('click', () => { f.scope = f.scope === '100' ? 'all' : '100'; f.genre = 'all'; renderTop100(el); window.scrollTo(0, 0); });
  $('#addMovie', el)?.addEventListener('click', openAddMovie);
  $('#grid', el).addEventListener('click', (e) => { const t = e.target.closest('[data-open]'); if (t) openMovie(Number(t.dataset.open)); });
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) { shown += PAGE; draw(el, true); } }, { rootMargin: '800px' });
  observer.observe($('#more', el));
}

function draw(el, append = false) {
  const ctx = list();
  const grid = $('#grid', el);
  const start = append ? grid.querySelectorAll('.ptile').length : 0;
  const limit = f.scope === '100' ? ctx.out.length : shown;
  const html = ctx.out.slice(start, limit).map((m) => tile(m, ctx)).join('');
  if (append) grid.insertAdjacentHTML('beforeend', html);
  else grid.innerHTML = html || '<div class="empty" style="grid-column:1/-1">No movies match.</div>';
}

function openAddMovie() {
  if (!app.state.tmdbLive) { toast('Searching TMDB needs the TMDB key on the server.', { error: true }); return; }
  openModal('Add a movie we watched', `<input class="search" id="tsearch" type="search" placeholder="Movie title" style="color:var(--ink);background:#fff">
    <div id="tresults" style="display:grid;gap:8px"></div>`, {
    onMount: (body) => {
      let timer;
      const input = $('#tsearch', body);
      input.focus();
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const { results } = await api(`/api/search?q=${encodeURIComponent(input.value)}`);
            $('#tresults', body).innerHTML = results.map((r) => `<button class="btn btn-ghost" style="justify-content:flex-start;text-align:left" data-pick="${r.id}">${esc(r.title)} ${r.year ? `(${r.year})` : ''}${app.movies.has(r.id) ? ' · in library' : ''}</button>`).join('') || '<p>No matches.</p>';
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
