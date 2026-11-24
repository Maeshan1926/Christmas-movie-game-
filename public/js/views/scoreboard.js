import { esc, posterUrl } from '../util.js';
import { app } from '../store.js';
import { summarize, seasonsWithData } from '../shared/stats.js';
import { formatDay, daysUntilChristmas } from '../shared/dates.js';
import { CATEGORIES, MEMBERS } from '../shared/config.js';
import { openMovie, openRatings } from '../components.js';

const CAT_COLOR = { comedy: 'var(--comedy)', drama: 'var(--drama)', stocking: 'var(--stocking)' };
let scope = null;

const stat = (k, v, s = '') => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

export function renderScoreboard(el) {
  const s = app.state;
  if (scope == null) scope = s.season;
  const seasons = seasonsWithData(s.watches, s.season);
  const sum = summarize({ movies: app.movies, watches: s.watches, ratings: s.ratings, scope, today: s.today });
  const maxCat = Math.max(1, ...Object.values(sum.byCategory));
  const critic = MEMBERS.map((m) => ({ ...m, avg: sum.memberAverages[m.id] })).filter((m) => m.avg != null);
  const toughest = critic.length > 1 ? critic.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;
  const unlocked = sum.achievements.filter((a) => a.unlocked).length;
  const hl = (x, label) => (x ? `<button class="linky" data-open="${x.id}" style="background:none;border:0;color:inherit;cursor:pointer;padding:0;font:inherit">${esc(x.movie.title)}</button><div class="s">${label} ${x.rating.avg}</div>` : '—');

  el.innerHTML = `<div class="stage-head"><div><div class="marquee">${scope === 'lifetime' ? 'Lifetime standings' : `Christmas ${scope} standings`}</div><h1 class="section-title">Family Scoreboard</h1></div>
      <div class="season-picker" role="group" aria-label="Season">${seasons.map((y) => `<button aria-pressed="${scope === y}" data-scope="${y}">${y}</button>`).join('')}<button aria-pressed="${scope === 'lifetime'}" data-scope="lifetime">Lifetime</button></div></div>
    <div class="stats">
      ${stat('Movies watched', sum.count)}
      ${stat('Hours of Christmas', sum.hours)}
      ${stat('Avg family rating', sum.avgFamily ?? '—')}
      ${stat('Night streak', sum.streak, `Best: ${sum.bestStreak}`)}
      ${stat('Days to Christmas', daysUntilChristmas(s.today))}
      ${stat('Achievements', `${unlocked}/${sum.achievements.length}`)}
    </div>
    <div class="board-grid">
      <section class="panel"><h3>🏆 Favorite Christmas Movies</h3>
        ${sum.leaderboard.length ? `<div class="table-scroll"><table class="lb"><thead><tr><th>#</th><th>Movie</th><th>Family</th>${MEMBERS.map((m) => `<th class="mem" title="${m.label}">${m.label[0]}</th>`).join('')}</tr></thead><tbody>
          ${sum.leaderboard.slice(0, 25).map((x, i) => `<tr><td class="rank">${i + 1}</td><td><button class="linky" data-open="${x.id}">${esc(x.movie.title)}</button> <small class="subtle">${x.movie.year || ''}</small></td><td class="avg">${x.rating.avg}</td>
          ${MEMBERS.map((m) => `<td class="mem">${x.rating.scores[m.id] ?? '·'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">Rate a movie to start the leaderboard.</div>'}
        <div class="stats" style="grid-template-columns:1fr 1fr;margin:14px 0 0">
          <div class="stat"><div class="k">Highest rated</div><div style="font-weight:800;margin-top:6px">${hl(sum.highest, 'Family score')}</div></div>
          <div class="stat"><div class="k">Lowest rated</div><div style="font-weight:800;margin-top:6px">${hl(sum.lowest, 'Family score')}</div></div>
        </div>
      </section>
      <section class="panel"><h3>🎁 Movies by Category</h3>
        <div class="bars">${CATEGORIES.map((c) => `<div class="bar" style="--cc:${CAT_COLOR[c.id]}"><span>${c.emoji} ${c.label}</span><div class="track"><div class="fill" style="width:${(sum.byCategory[c.id] / maxCat) * 100}%"></div></div><span>${sum.byCategory[c.id]}</span></div>`).join('')}</div>
        <h3 style="margin-top:18px">🎅 Family Critics</h3>
        <div class="members">${MEMBERS.map((m) => `<div class="member" style="--mc:${m.color}"><b>${m.label}</b><span>${sum.memberAverages[m.id] ?? '—'}</span> <small class="subtle">avg score</small></div>`).join('')}</div>
        ${toughest ? `<p class="subtle" style="margin:10px 0 0">Toughest critic: <b style="color:var(--cream)">${toughest.label}</b> (${toughest.avg} average)</p>` : ''}
      </section>
    </div>
    <section class="panel" style="margin-top:16px"><h3>⭐ Christmas Achievements</h3>
      <div class="ach-grid">${sum.achievements.map((a) => `<div class="ach ${a.unlocked ? 'on' : ''}" aria-label="${esc(a.name)}: ${a.unlocked ? 'unlocked' : 'locked'}">
        <div class="i" aria-hidden="true">${a.icon}</div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
        ${a.unlocked ? `<div style="font-size:12px;color:var(--gold-2);margin-top:4px">Unlocked ${formatDay(a.on, { month: 'short', day: 'numeric' })}</div>` : ''}</div>`).join('')}</div>
    </section>
    <section class="panel" style="margin-top:16px"><h3>📜 Watching History</h3>
      ${sum.entries.length ? `<div class="history">${[...sum.entries].reverse().map((e) => `<div class="hrow">
        ${e.movie?.poster ? `<img src="${posterUrl(e.movie.poster, 'w92')}" alt="" loading="lazy">` : '<span class="mini"></span>'}
        <div><button class="linky" data-open="${e.watch.tmdb_id}" style="background:none;border:0;color:var(--cream);font-weight:800;cursor:pointer;padding:0;text-align:left">${esc(e.movie?.title || 'Unknown movie')}</button>
          <div class="when">${formatDay(e.watch.watched_on, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${e.watch.source === 'nightly' ? '🎲 Nightly pick' : '✍️ Added manually'}${e.watch.returned ? ' · back in rotation' : ''}${e.movie?.runtime ? ` · ${e.movie.runtime} min` : ''}</div></div>
        <div style="text-align:right">${e.rating?.avg != null ? `<div class="fam">${e.rating.avg}</div>` : ''}<button class="btn btn-ghost btn-small" data-rate="${e.watch.tmdb_id}">Rate</button></div>
      </div>`).join('')}</div>` : '<div class="empty">Nothing watched yet this season. Tonight is the night. 🎬</div>'}
    </section>`;

  el.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope === 'lifetime' ? 'lifetime' : Number(b.dataset.scope);
    renderScoreboard(el);
  }));
  el.onclick = (e) => {
    const o = e.target.closest('[data-open]');
    if (o) openMovie(Number(o.dataset.open));
    const r = e.target.closest('[data-rate]');
    if (r) openRatings(Number(r.dataset.rate));
  };
}
