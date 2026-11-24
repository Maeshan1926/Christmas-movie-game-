import { esc, posterUrl, storage, sleep, reducedMotion } from '../util.js';
import { app, hundredWatchedIds } from '../store.js';
import { daysUntilChristmas, parseDay, formatDay } from '../shared/dates.js';
import { openMovie, posterImg, watchLink, markWatched, askConfirm } from '../components.js';
import { mutate } from '../store.js';
import { playDrumroll } from '../fx/sound.js';

// Illustrated fallback banner: a snowy village night under a big moon.
const HERO_SVG = `<svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1c2e"/><stop offset=".7" stop-color="#1b3a4a"/><stop offset="1" stop-color="#2c4f52"/></linearGradient>
    <radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6dc"/><stop offset=".7" stop-color="#f3dfa6"/><stop offset="1" stop-color="#f3dfa6" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf6b" stop-opacity=".9"/><stop offset="1" stop-color="#ffcf6b" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="225" fill="url(#sky)"/>
  <circle cx="318" cy="58" r="44" fill="url(#moon)"/><circle cx="318" cy="58" r="24" fill="#fff4d6"/>
  <g fill="#fff" opacity=".8"><circle cx="40" cy="30" r="1.2"/><circle cx="90" cy="60" r="1"/><circle cx="150" cy="22" r="1.4"/><circle cx="210" cy="48" r="1"/><circle cx="260" cy="18" r="1.2"/><circle cx="370" cy="120" r="1"/><circle cx="120" cy="96" r=".9"/><circle cx="20" cy="88" r="1"/></g>
  <path d="M0 160 Q80 120 170 150 T400 140 V225 H0Z" fill="#dfe8ea"/>
  <path d="M0 185 Q110 150 220 178 T400 170 V225 H0Z" fill="#f4f7f6"/>
  <g fill="#173b2b">
    <path d="M30 168 l14 -40 l14 40z M36 150 l8 -24 l8 24z"/><path d="M62 172 l10 -30 l10 30z"/>
    <path d="M330 162 l16 -46 l16 46z M337 140 l9 -26 l9 26z"/><path d="M362 168 l11 -32 l11 32z"/>
  </g>
  <g transform="translate(150 118)">
    <rect x="0" y="22" width="96" height="56" fill="#6b2a1e"/><path d="M-8 26 L48 -6 L104 26Z" fill="#f4f7f6"/><path d="M-4 26 L48 -2 L100 26Z" fill="#7d1224"/>
    <rect x="70" y="-4" width="10" height="20" fill="#4a1d15"/>
    <circle cx="48" cy="52" r="40" fill="url(#glow)"/>
    <rect x="12" y="38" width="20" height="18" fill="#ffcf6b"/><rect x="64" y="38" width="20" height="18" fill="#ffcf6b"/>
    <rect x="40" y="46" width="16" height="32" fill="#3a1610"/>
    <path d="M12 47 h20 M22 38 v18 M64 47 h20 M74 38 v18" stroke="#6b2a1e" stroke-width="2"/>
    <g fill="#ff3b4f"><circle cx="2" cy="26" r="2"/><circle cx="22" cy="17" r="2" fill="#ffd44d"/><circle cx="42" cy="6" r="2" fill="#3fe07a"/><circle cx="62" cy="9" r="2" fill="#4db8ff"/><circle cx="82" cy="17" r="2"/><circle cx="100" cy="26" r="2" fill="#ffd44d"/></g>
  </g>
  <g transform="translate(262 128)"><path d="M18 -26 l18 52 h-36z" fill="#1f4a34"/><path d="M18 -10 l14 36 h-28z" fill="#2e6b48"/>
    <g fill="#ffd44d"><circle cx="12" cy="6" r="1.8"/><circle cx="24" cy="12" r="1.8" fill="#ff3b4f"/><circle cx="16" cy="20" r="1.8" fill="#4db8ff"/></g>
    <polygon points="18,-32 20,-27 25,-27 21,-24 22,-19 18,-22 14,-19 15,-24 11,-27 16,-27" fill="#ffd77a"/></g>
</svg>`;

export function renderHome(el) {
  const s = app.state;
  const total = s.hundred?.ids?.length || 100;
  const done = hundredWatchedIds().size;
  const pct = Math.round((done / total) * 100);
  const d = daysUntilChristmas(s.today);
  const { m, d: day } = parseDay(s.today);
  const chosen = s.night?.chosen ? app.movies.get(s.night.chosen) : null;
  const chosenWatched = chosen && (s.watches || []).some((w) => w.tmdb_id === chosen.id && w.watched_on === s.today);
  const last = [...(s.watches || [])].sort((a, b) => (a.watched_on === b.watched_on ? b.id - a.id : a.watched_on < b.watched_on ? 1 : -1))[0];
  const lastMovie = last ? app.movies.get(last.tmdb_id) : null;
  const C = 2 * Math.PI * 36;

  el.innerHTML = `<div class="home-wrap">
    <div class="hero" id="hero">
      ${HERO_SVG}
      <picture><source type="image/webp" srcset="/img/hero-900.webp 900w, /img/hero.webp 1672w" sizes="(min-width: 1100px) 1068px, 100vw">
        <img src="/img/hero.jpg" alt="The Trunk Family Christmas Movies: a cozy living room with a lit tree, fireplace and stockings" width="1672" height="941" fetchpriority="high"
          onload="this.closest('.hero').classList.add('has-art')" onerror="this.closest('picture').remove()"></picture>
      <div class="hero-brand"><span class="brand-small">The Trunk Family</span><span class="brand-big">Christmas Movies</span></div>
    </div>

    ${chosen && !chosenWatched ? `
    <div class="advent-frame" style="cursor:default">
      <div style="width:62px;flex:none">${posterImg(chosen, { size: 'w185', cls: '' }).replace('<img ', '<img style="width:62px;height:93px;object-fit:cover;border-radius:8px" ')}</div>
      <div class="advent-copy" style="flex:1;min-width:0"><span>Tonight's movie</span><b style="font-size:20px">${esc(chosen.title)}</b>
        <div class="actions-row" style="margin-top:8px"><a class="btn btn-gold btn-small" href="${esc(watchLink(chosen))}" target="_blank" rel="noopener" data-start="${chosen.id}">▶ Watch</a>
        <button class="btn btn-green btn-small" data-finished="${chosen.id}">✓ We finished</button>
        <a class="btn btn-ghost btn-small" href="#picks">See all tonight's picks</a></div></div>
    </div>` : `
    <button class="advent" id="pickBtn" aria-label="Pick tonight's movie">
      <div class="advent-frame">
        <div class="advent-num">${m === 12 && day <= 25 ? day : '🎁'}<small>${m === 12 && day <= 25 ? 'DEC' : ''}</small></div>
        <div class="advent-copy"><b>Pick Tonight's Movie</b><span>${chosenWatched ? 'Tonight is done. Peek at the lineup' : 'Open tonight\'s door'}</span></div>
      </div>
    </button>`}

    <div class="home-row">
      <div class="ring" role="img" aria-label="${done} of ${total} movies watched">
        <svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="36" fill="none" stroke="rgba(251,236,211,.12)" stroke-width="8"/>
        <circle cx="42" cy="42" r="36" fill="none" stroke="#4f9e45" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * done) / total} ${C}"/></svg>
        <div class="lbl"><div><b>${done}</b><small>of ${total}</small></div></div>
      </div>
      <div class="progress-copy"><span class="eyebrow">The Christmas 100</span><b>${pct}% watched</b>
        <a href="#top100" class="subtle" style="font-size:13px">See the list</a></div>
      <div class="countdown" aria-label="${d} days until Christmas">${d === 0 ? '<b>🎄</b><small>Merry Christmas</small>' : `<b>${d}</b><small>${d === 1 ? 'sleep left' : 'sleeps left'}</small>`}</div>
    </div>

    ${lastMovie ? `<button class="last-watched" data-open="${lastMovie.id}">
      ${lastMovie.poster ? `<img src="${posterUrl(lastMovie.poster, 'w92')}" alt="" width="44" height="66" loading="lazy">` : '<span class="mini"></span>'}
      <span><small>Last watched · ${formatDay(last.watched_on, { month: 'short', day: 'numeric' })}</small><b>${esc(lastMovie.title)}</b></span><span aria-hidden="true">›</span></button>` : ''}
  </div>`;

  el.querySelector('#pickBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('opening');
    playDrumroll(0.8);
    await sleep(reducedMotion() ? 0 : 650);
    location.hash = '#picks';
  });
  el.querySelector('[data-open]')?.addEventListener('click', (e) => openMovie(Number(e.currentTarget.dataset.open)));
  el.querySelector('[data-start]')?.addEventListener('click', (e) => { mutate('/api/tonight/choose', { tmdbId: Number(e.currentTarget.dataset.start), start: true }).catch(() => {}); });
  el.querySelector('[data-finished]')?.addEventListener('click', async (e) => {
    const id = Number(e.currentTarget.dataset.finished);
    if (!(await askConfirm(`Did the family finish "${app.movies.get(id).title}"? It joins the tree and leaves future picks.`, { ok: 'We finished it' }))) return;
    await markWatched(id);
  });
  storage('xmas-home-seen', s.today);
}
