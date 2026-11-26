import { esc, toast, confetti, sleep, storage, reducedMotion } from '../util.js';
import { app, mutate, watchedSet, hundredRank } from '../store.js';
import { CATEGORIES, REROLLS_PER_CATEGORY } from '../shared/config.js';
import { formatDay } from '../shared/dates.js';
import { posterImg, factsHtml, scoresHtml, streamingHtml, watchLink, markWatched, askConfirm, openMovie } from '../components.js';
import { playDrumroll, playJingle, playPop } from '../fx/sound.js';

let active = null;
let animateIds = new Set();

function pickCard(m, { label, chosen, watched, delay }) {
  const rank = hundredRank(m.id);
  const actions = watched
    ? `<button class="btn btn-ghost" data-open="${m.id}">Details and ratings</button>`
    : chosen
      ? `<a class="btn btn-red" href="${esc(watchLink(m))}" target="_blank" rel="noopener" data-start="${m.id}">▶ Start watching</a>
         <div class="row"><button class="btn btn-green" data-finished="${m.id}">✓ We finished it</button><button class="btn btn-ghost" data-unchoose>Change</button></div>`
      : `<button class="btn btn-gold" data-choose="${m.id}">🎄 Select this movie</button>
         <button class="btn btn-ghost btn-small" data-seen="${m.id}">👀 Seen it already, swap it</button>`;
  return `<article class="pick ${chosen ? 'chosen' : ''} ${watched ? 'watched' : ''} ${animateIds.has(m.id) ? 'flip-in' : ''}" style="--delay:${delay}s">
    <div class="pick-poster">${posterImg(m, { big: true })}<span class="tag">${esc(label)}</span>${rank ? `<span class="rank">#${rank}</span>` : ''}</div>
    <div class="pick-body">
      <h3>${esc(m.title)}</h3>${factsHtml(m)}
      ${m.overview ? `<p class="synopsis">${esc(m.overview)}</p>` : ''}
      ${scoresHtml(m)}${streamingHtml(m.providers)}
      <div class="pick-actions">${actions}</div>
    </div></article>`;
}

export function renderPicks(el) {
  const s = app.state;
  const night = s.night;
  const key = `xmas-revealed-${night.night}`;
  if (storage(key) !== '1') {
    Object.values(night.picks).flat().forEach((id) => animateIds.add(id));
    storage(key, '1');
    if (!reducedMotion()) { playJingle(); confetti(30); }
  }
  if (night.chosen) {
    const c = CATEGORIES.find((x) => (night.picks[x.id] || []).includes(night.chosen));
    if (c) active = c.id;
  }
  if (!CATEGORIES.some((c) => c.id === active)) active = CATEGORIES[0].id;
  const watched = watchedSet();
  const panels = CATEGORIES.map((c, ci) => {
    const ids = night.picks[c.id] || [];
    const left = REROLLS_PER_CATEGORY - (night.rerolls?.[c.id] || 0);
    const cards = ids.map((id, i) => {
      const m = app.movies.get(id);
      return m ? pickCard(m, { label: ids.length > 1 ? (i === 0 ? 'Original' : 'Reroll') : c.label, chosen: night.chosen === id, watched: watched.has(id), delay: ci * 0.35 + i * 0.1 }) : '';
    }).join('');
    return `<section class="cat-panel ${active === c.id ? 'active' : ''}" id="panel-${c.id}" role="tabpanel" aria-labelledby="tab-${c.id}" style="--cc:${c.color}">
      <div class="cat-title"><h2>${c.emoji} ${esc(c.label)}</h2><small>${esc(c.blurb)}</small></div>
      ${cards ? `<div class="options ${ids.length === 1 ? 'single' : ''}">${cards}</div>` : '<div class="empty-cat">Every movie in this category is watched or skipped.</div>'}
      ${ids.length ? `<button class="btn btn-ghost reroll" data-reroll="${c.id}" ${left <= 0 ? 'disabled' : ''}>🎲 ${left > 0 ? `Reroll ${esc(c.label)} (${left} left tonight)` : 'Reroll used. Both stay on the table'}</button>` : ''}
    </section>`;
  }).join('');

  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">${esc(formatDay(night.night, { weekday: 'long', month: 'long', day: 'numeric' }))}</div><h1 class="page-title">Tonight's Lineup</h1></div>
      <a href="#tonight" class="subtle" style="font-size:14px">‹ Home</a></div>
    ${app.catalogMeta?.source === 'demo' ? '<div class="banner">Demo catalog: posters, scores and streaming appear once the site builds with a TMDB key.</div>' : ''}
    <div class="seg" role="tablist" aria-label="Category">${CATEGORIES.map((c) => `<button role="tab" id="tab-${c.id}" aria-controls="panel-${c.id}" aria-selected="${active === c.id}" style="--cc:${c.color}" data-tab="${c.id}">${c.emoji} ${esc(c.label)}${(night.picks[c.id] || []).includes(night.chosen) ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
    <div class="lineup">${panels}</div>`;
  animateIds = new Set();

  el.onclick = async (e) => {
    const t = e.target.closest('button, a[data-start]');
    if (!t) return;
    try {
      if (t.dataset.tab) {
        active = t.dataset.tab;
        el.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === active)));
        el.querySelectorAll('.cat-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${active}`));
        const target = el.querySelector(`#panel-${active}`);
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 70, behavior: reducedMotion() ? 'auto' : 'smooth' });
      } else if (t.dataset.reroll) {
        const c = t.dataset.reroll;
        const before = new Set(night.picks[c]);
        t.disabled = true;
        playDrumroll(0.9);
        await sleep(reducedMotion() ? 0 : 600);
        await mutate('/api/tonight/reroll', { category: c });
        app.state.night.picks[c].filter((x) => !before.has(x)).forEach((x) => animateIds.add(x));
        playPop();
        renderPicks(el);
        el.querySelector(`#panel-${c} .options`)?.scrollTo({ left: 99999, behavior: reducedMotion() ? 'auto' : 'smooth' });
      } else if (t.dataset.seen) {
        const id = Number(t.dataset.seen);
        const before = new Set(Object.values(night.picks).flat());
        t.disabled = true;
        await mutate('/api/tonight/seen', { tmdbId: id });
        Object.values(app.state.night.picks).flat().filter((x) => !before.has(x)).forEach((x) => animateIds.add(x));
        playPop();
        toast('Swapped. That one stays out of future picks');
        renderPicks(el);
      } else if (t.dataset.choose) {
        const id = Number(t.dataset.choose);
        await mutate('/api/tonight/choose', { tmdbId: id });
        showChosen(id);
      } else if (t.hasAttribute('data-unchoose')) {
        await mutate('/api/tonight/choose', { tmdbId: null });
      } else if (t.dataset.start) {
        await mutate('/api/tonight/choose', { tmdbId: Number(t.dataset.start), start: true });
      } else if (t.dataset.finished) {
        const id = Number(t.dataset.finished);
        if (!(await askConfirm(`Did the family finish "${app.movies.get(id).title}"? It joins the tree and leaves future picks.`, { ok: 'We finished it' }))) return;
        await markWatched(id);
      } else if (t.dataset.open) {
        openMovie(Number(t.dataset.open));
      }
    } catch (err) {
      toast(err.message, { error: true });
      renderPicks(el);
    }
  };
}

/** Festive full-screen confirmation once the family picks. */
export function showChosen(id) {
  const m = app.movies.get(id);
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="confirm-screen" role="dialog" aria-modal="true" aria-labelledby="chosen-title">
    <div class="eyebrow">Tonight's feature presentation</div>
    ${m.poster ? `<img class="poster-xl" src="https://image.tmdb.org/t/p/w500${m.poster}" alt="${esc(m.title)} poster">` : `<div class="poster-xl" style="display:grid;place-items:center;font-family:var(--marquee);font-size:24px;padding:16px">${esc(m.title)}</div>`}
    <h2 id="chosen-title">${esc(m.title)}</h2>
    <p class="subtle">Grab the blankets and the cocoa. It's locked in on every device.</p>
    <div class="actions">
      <a class="btn btn-red" href="${esc(watchLink(m))}" target="_blank" rel="noopener" id="cStart">▶ Start watching</a>
      <button class="btn btn-ghost" id="cBack">Back to the lineup</button>
    </div>
    <p class="subtle" style="font-size:13px">When the credits roll, tap “We finished it” to hang the ornament.</p>
  </div>`;
  document.body.style.overflow = 'hidden';
  const close = () => { root.innerHTML = ''; document.body.style.overflow = ''; window.dispatchEvent(new Event('xmas:closed')); };
  root.querySelector('#cBack').addEventListener('click', close);
  root.querySelector('#cStart').addEventListener('click', () => { mutate('/api/tonight/choose', { tmdbId: id, start: true }).catch(() => {}); close(); });
  root.querySelector('#cBack').focus();
  playJingle();
  confetti(60);
}
