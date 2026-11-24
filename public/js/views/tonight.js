import { esc, toast, confetti, sleep, storage, reducedMotion } from '../util.js';
import { app, mutate, watchedSet, flagsMap } from '../store.js';
import { CATEGORIES, REROLLS_PER_CATEGORY } from '../shared/config.js';
import { formatDay } from '../shared/dates.js';
import { overallRanks } from '../shared/pool.js';
import { movieCard, markWatched, openRatings, askConfirm } from '../components.js';
import { playDrumroll, playJingle, playPop } from '../fx/sound.js';

const CAT_COLOR = { comedy: 'var(--comedy)', drama: 'var(--drama)', stocking: 'var(--stocking)' };
let animateIds = new Set();

function revealedKey(night) { return `xmas-revealed-${night}`; }

function fmtCountdown(ms) {
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function renderTonight(el) {
  const s = app.state;
  const night = s.night;
  const revealed = storage(revealedKey(night.night)) === '1';
  const head = `<div class="stage-head">
      <div><div class="marquee">Tonight's Lineup · ${esc(formatDay(night.night, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
      <h1 class="section-title">Tonight's Movies</h1></div>
      <div class="reset-note">🎲 One reroll per category · New picks in ${fmtCountdown(s.nextResetInMs)} (midnight PT)</div>
    </div>
    ${app.catalogMeta?.source === 'demo' ? '<div class="banner">Demo catalog: posters, ratings and streaming data load once the site is built with a TMDB key.</div>' : ''}`;

  if (!revealed) {
    el.innerHTML = `${head}<section class="reveal-stage">
      <p class="subtle" style="font-size:18px;margin:0 0 30px">Three wrapped gifts. Three movies. One family decision.</p>
      <div class="gifts" id="gifts">
        ${CATEGORIES.map((c) => `<div class="gift" style="--gc:${CAT_COLOR[c.id]}"><div class="lid"></div><span class="bow">🎀</span><span class="tag">${c.emoji} ${esc(c.label)}</span></div>`).join('')}
      </div>
      <button class="btn btn-gold big-reveal" id="revealBtn">✨ Reveal Tonight's Movies</button>
    </section>`;
    el.querySelector('#revealBtn').addEventListener('click', () => reveal(el));
    return;
  }

  const watched = watchedSet();
  // Rank among movies still in play (not watched, not skipped), matching how the nightly top list is built.
  const flags = flagsMap();
  const size = app.state.poolSize || 100;
  const open = [...app.movies.values()].filter((m) => !watched.has(m.id) && !flags.get(m.id)?.excluded);
  const ranks = overallRanks(open);
  const rankBadge = (id) => {
    const r = ranks.get(id);
    if (!r) return null;
    const title = 'Ranked by audience score, weighted by number of votes, among movies you have not watched or skipped';
    if (r <= size) return { label: `🏆 #${r} of top ${size}`, title };
    if (flags.get(id)?.wishlist) return { label: '⭐ Wishlist pick', title: 'On your wishlist, so it always qualifies' };
    const c = app.movies.get(id)?.category;
    return { label: `🎄 Top ${c === 'stocking' ? 'stocking' : c} pick`, title: 'Among the best in its category; every category keeps at least 20 spots in the nightly list' };
  };
  const cols = CATEGORIES.map((c) => {
    const ids = night.picks[c.id] || [];
    const used = night.rerolls?.[c.id] || 0;
    const left = REROLLS_PER_CATEGORY - used;
    const cards = ids.map((id, i) => {
      const m = app.movies.get(id);
      if (!m) return '';
      const chosen = night.chosen === id;
      const isWatched = watched.has(id);
      const actions = isWatched
        ? `<button class="btn btn-gold btn-small" data-rate-movie="${id}">⭐ Family ratings</button>`
        : chosen
          ? `<a class="btn btn-red" data-start="${id}" href="${esc(app.movies.get(id)?.providers?.link || `https://www.themoviedb.org/movie/${id}/watch?locale=US`)}" target="_blank" rel="noopener">▶ Start Watching</a>
             <button class="btn btn-green" data-watched="${id}">✔ Mark as Watched</button>
             <button class="btn btn-ghost btn-small" style="color:var(--ink);border-color:#d8c9b0" data-unchoose>Change pick</button>`
          : `<button class="btn btn-gold" data-choose="${id}">🎄 We pick this one</button>
             <button class="btn btn-ghost btn-small" style="color:var(--ink);border-color:#d8c9b0" data-seen="${id}" title="Already seen it: skip it for good and get a new pick">👀 Seen it, swap it</button>`;
      const ribbon = chosen ? '<span class="ribbon">Tonight\'s Pick</span>' : isWatched ? '<span class="ribbon green">Watched</span>' : '';
      const anim = animateIds.has(id) ? 'flip-in' : '';
      return `${ids.length > 1 ? `<div class="option-label">${i === 0 ? 'Original pick' : 'Reroll'}</div>` : ''}
        ${movieCard(m, { actions, cls: `${chosen ? 'chosen' : ''} ${anim}`, ribbon, rank: rankBadge(id), delay: animateIds.size > 1 ? CATEGORIES.findIndex((x) => x.id === c.id) * 0.45 : 0 })}`;
    }).join('');
    return `<section class="cat-col" aria-labelledby="h-${c.id}">
      <div class="cat-head" style="--cc:${CAT_COLOR[c.id]}">
        <div><h2 id="h-${c.id}">${c.emoji} ${esc(c.label)}</h2><small>${esc(c.blurb)}</small></div>
        <button class="btn btn-small reroll" data-reroll="${c.id}" ${left <= 0 || !ids.length ? 'disabled' : ''} aria-label="Reroll ${esc(c.label)}, ${left} left">🎲 ${left > 0 ? `Reroll (${left})` : 'Used'}</button>
      </div>
      ${cards || '<div class="panel empty">This stocking is empty. Every movie here is watched or excluded.</div>'}
    </section>`;
  }).join('');
  el.innerHTML = `${head}<div class="lineup">${cols}</div>
    <p class="subtle" style="text-align:center;font-size:13px;margin-top:18px">Watched something outside the game? Mark it in the <a href="#library">Library</a>.</p>`;
  animateIds = new Set();

  el.onclick = async (e) => {
    const t = e.target.closest('button, a[data-start]');
    if (!t) return;
    try {
      if (t.dataset.reroll) {
        const c = t.dataset.reroll;
        const before = new Set(night.picks[c]);
        t.disabled = true;
        playDrumroll(0.9);
        await sleep(reducedMotion() ? 0 : 700);
        await mutate('/api/tonight/reroll', { category: c });
        app.state.night.picks[c].filter((x) => !before.has(x)).forEach((x) => animateIds.add(x));
        playPop();
        renderTonight(el);
      } else if (t.dataset.seen) {
        const id = Number(t.dataset.seen);
        const before = new Set(Object.values(night.picks).flat());
        t.disabled = true;
        await mutate('/api/tonight/seen', { tmdbId: id });
        Object.values(app.state.night.picks).flat().filter((x) => !before.has(x)).forEach((x) => animateIds.add(x));
        playPop();
        toast(`Skipped "${app.movies.get(id)?.title}". Here's a fresh one. Undo in the Library.`);
        renderTonight(el);
      } else if (t.dataset.choose) {
        await mutate('/api/tonight/choose', { tmdbId: Number(t.dataset.choose) });
        playJingle(); confetti(18);
        toast('🎄 Tonight\'s pick is locked in for the whole family');
      } else if (t.hasAttribute('data-unchoose')) {
        await mutate('/api/tonight/choose', { tmdbId: null });
      } else if (t.dataset.start) {
        const id = Number(t.dataset.start);
        await mutate('/api/tonight/choose', { tmdbId: id, start: true });
        toast('🍿 Enjoy the show! Tap “Mark as Watched” when the credits roll.');
      } else if (t.dataset.watched) {
        const id = Number(t.dataset.watched);
        if (!(await askConfirm(`Mark "${app.movies.get(id).title}" as watched? It leaves future nightly picks and hangs an ornament.`, { ok: 'Mark watched' }))) return;
        await markWatched(id);
      } else if (t.dataset.rateMovie) {
        openRatings(Number(t.dataset.rateMovie));
      }
    } catch (err) {
      toast(err.message, { error: true });
      renderTonight(el);
    }
  };
}

async function reveal(el) {
  const btn = el.querySelector('#revealBtn');
  btn.disabled = true;
  btn.textContent = '🥁 Drumroll...';
  const gifts = el.querySelector('#gifts');
  const quick = reducedMotion();
  playDrumroll(1.8);
  gifts.classList.add('shaking');
  await sleep(quick ? 0 : 1800);
  gifts.classList.remove('shaking');
  [...gifts.children].forEach((g, i) => setTimeout(() => g.classList.add('open'), quick ? 0 : i * 250));
  await sleep(quick ? 0 : 900);
  playJingle();
  confetti(50);
  storage(revealedKey(app.state.night.night), '1');
  Object.values(app.state.night.picks).flat().forEach((id) => animateIds.add(id));
  renderTonight(el);
}
