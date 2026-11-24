import { esc, posterUrl, toast } from '../util.js';
import { app, mutate } from '../store.js';
import { summarize } from '../shared/stats.js';
import { seasonOf, formatDay } from '../shared/dates.js';
import { MEMBERS } from '../shared/config.js';
import { openMovie, openRatings, askConfirm } from '../components.js';

const thumb = (m) => (m?.poster ? `<img src="${posterUrl(m.poster, 'w92')}" alt="" width="44" height="66" loading="lazy">` : '<span class="mini"></span>');

export function renderMemories(el) {
  const s = app.state;
  const life = summarize({ movies: app.movies, watches: s.watches, ratings: s.ratings, scope: 'lifetime', today: s.today });
  const season = summarize({ movies: app.movies, watches: s.watches, ratings: s.ratings, scope: s.season, today: s.today });
  const seasons = [...new Set(s.watches.map((w) => seasonOf(w.watched_on)))].sort((a, b) => b - a);
  const unlocked = season.achievements.filter((a) => a.unlocked).length;

  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">Every Christmas, kept forever</div><h1 class="page-title">Our Christmas Memories</h1></div></div>
    <div class="stat-strip">
      <div class="ticket"><b>${life.count}</b><span>Movies watched</span></div>
      <div class="ticket"><b>${life.hours}</b><span>Hours together</span></div>
      <div class="ticket"><b>${season.count}</b><span>This Christmas</span></div>
      <div class="ticket"><b>${life.avgFamily ?? '–'}</b><span>Avg family score</span></div>
    </div>

    <section class="mem-section"><h2>Family favorites</h2>
      ${life.leaderboard.length ? `<div class="top-rated">${life.leaderboard.slice(0, 10).map((x, i) => `<button class="trow" data-open="${x.id}">
        <span class="n">${i + 1}</span>${thumb(x.movie)}
        <span><b>${esc(x.movie.title)}</b><small>${MEMBERS.map((m) => (x.rating.scores[m.id] != null ? `${m.label[0]} ${x.rating.scores[m.id]}` : '')).filter(Boolean).join(' · ')}</small></span>
        <span class="fam">${x.rating.avg}</span></button>`).join('')}</div>`
      : '<p class="subtle">Rate a movie after you watch it and your favorites land here. Ratings are optional.</p>'}
    </section>

    <section class="mem-section"><h2>Christmas seasons</h2>
      ${seasons.length ? seasons.map((yr, idx) => {
        const sum = summarize({ movies: app.movies, watches: s.watches, ratings: s.ratings, scope: yr, today: s.today });
        return `<details class="season" ${idx === 0 ? 'open' : ''}><summary><b>Christmas ${yr}</b><span class="subtle">${sum.count} movie${sum.count === 1 ? '' : 's'} · ${sum.hours} hrs</span></summary>
          <div class="season-list">${[...sum.entries].reverse().map((e) => `<div class="hrow">
            ${thumb(e.movie)}
            <div style="min-width:0"><button class="link-btn" style="color:var(--cream);text-decoration:none;text-align:left" data-open="${e.watch.tmdb_id}">${esc(e.movie?.title || 'Unknown movie')}</button>
              <div class="when">${formatDay(e.watch.watched_on, { weekday: 'short', month: 'short', day: 'numeric' })}${e.watch.returned ? ' · back in rotation' : ''}</div></div>
            <div class="acts">${e.rating?.avg != null ? `<span class="fam">${e.rating.avg}</span>` : ''}
              <button class="btn btn-ghost btn-small" data-rate="${e.watch.tmdb_id}" aria-label="Rate ${esc(e.movie?.title || '')}">Rate</button>
              ${!e.watch.returned ? `<button class="btn btn-ghost btn-small" data-replay="${e.watch.tmdb_id}" aria-label="Watch ${esc(e.movie?.title || '')} again" title="Watch again">🔁</button>` : ''}</div>
          </div>`).join('')}</div></details>`;
      }).join('') : '<p class="subtle">No memories yet. Tonight starts the first one.</p>'}
    </section>

    <section class="mem-section"><h2>This season's badges <span class="subtle" style="font-family:var(--body);font-size:14px">${unlocked}/${season.achievements.length}</span></h2>
      <div class="badges">${season.achievements.map((a) => `<div class="badge ${a.unlocked ? 'on' : ''}" title="${esc(a.desc)}"><div class="i" aria-hidden="true">${a.icon}</div><b>${esc(a.name)}</b><small class="subtle">${esc(a.desc)}</small></div>`).join('')}</div>
    </section>`;

  el.onclick = async (e) => {
    const o = e.target.closest('[data-open]');
    if (o) return openMovie(Number(o.dataset.open));
    const r = e.target.closest('[data-rate]');
    if (r) return openRatings(Number(r.dataset.rate));
    const p = e.target.closest('[data-replay]');
    if (p) {
      const id = Number(p.dataset.replay);
      if (!(await askConfirm(`Watch "${app.movies.get(id)?.title}" again? It goes back into the nightly picks. Its memory and ornament stay.`, { ok: 'Watch again' }))) return;
      try { await mutate('/api/watched/return', { tmdbId: id }); toast('Back in the nightly picks'); } catch (err) { toast(err.message, { error: true }); }
    }
  };
}
