import { esc, posterHtml, fmtRuntime, trailerUrl, logoUrl, toast, confetti, $ } from './util.js';
import { app, api, mutate, watchedSet, flagsMap, activeWatch } from './store.js';
import { availability, includedServices, AVAILABILITY_LABEL } from './shared/streaming.js';
import { MEMBERS, categoryById } from './shared/config.js';
import { ratingsByMovie } from './shared/stats.js';
import { formatDay } from './shared/dates.js';
import { playDing, playPop, playTada } from './fx/sound.js';

export function streamingHtml(p) {
  const a = availability(p);
  const svcs = includedServices(p);
  const rentBuy = a === 'rent' || a === 'buy'
    ? [...new Map([...(p.rent || []), ...(p.buy || [])].map((x) => [x.name, x])).values()].slice(0, 6)
    : [];
  const list = (a === 'included' ? svcs : rentBuy).slice(0, 8);
  const logos = list.map((s) => (s.logo
    ? `<img src="${logoUrl(s.logo)}" alt="${esc(s.name)}" title="${esc(s.name)}" loading="lazy">`
    : `<span class="svc">${esc(s.name)}</span>`)).join('');
  const asOf = p?.asOf ? ` <span class="subtle" style="font-size:11px">as of ${esc(new Date(p.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>` : '';
  const text = a === 'included' ? `Streaming: ${svcs.map((s) => s.name).slice(0, 3).join(', ')}` : AVAILABILITY_LABEL[a];
  return `<div class="stream"><span class="label ${a}">${a === 'included' ? '✅ ' : a === 'rent' || a === 'buy' ? '💳 ' : ''}${esc(text)}</span>${a === 'rent' ? ' <span class="subtle">(also to buy)</span>' : ''}${asOf}
    ${logos ? `<div class="logos">${logos}</div>` : ''}</div>`;
}

export function metaChips(m) {
  const chips = [];
  if (m.year) chips.push(`<span class="chip">${m.year}</span>`);
  if (m.runtime) chips.push(`<span class="chip">⏱ ${fmtRuntime(m.runtime)}</span>`);
  chips.push(`<span class="chip cert" title="US age rating">${esc(m.cert || 'NR')}</span>`);
  if (m.score) chips.push(`<span class="chip score" title="TMDB audience score from ${m.votes} votes">★ ${m.score.toFixed(1)}/10</span>`);
  return chips.join('');
}

export function genreLine(m) {
  const g = (m.genres || []).slice(0, 3).join(' · ');
  return g ? `<div class="subtle" style="font-size:13px;font-weight:700;color:var(--ink-soft)">${esc(g)}</div>` : '';
}

/** A full movie card. `actions` is extra HTML appended at the bottom. */
export function movieCard(m, { actions = '', cls = '', ribbon = '', delay = 0, rank = null } = {}) {
  const watched = watchedSet().has(m.id);
  const fam = ratingsByMovie(app.state?.ratings || []).get(m.id);
  const t = trailerUrl(m);
  return `<article class="mcard ${cls} ${watched ? 'watched' : ''}" data-id="${m.id}" style="--delay:${delay}s">
    ${ribbon}
    <div>${posterHtml(m)}${watched ? '<span class="watched-stamp">Watched</span>' : ''}</div>
    <div>
      <h3>${esc(m.title)}</h3>
      ${genreLine(m)}
      <div class="meta">${rank ? `<span class="chip" style="background:#1c3b2c;color:#ffd77a" title="${esc(rank.title)}">${esc(rank.label)}</span>` : ''}${metaChips(m)}${fam?.avg != null ? `<span class="chip" style="background:#fde2e6;color:#9b0f26">🎄 Family ${fam.avg}</span>` : ''}</div>
      ${m.overview ? `<p class="synopsis">${esc(m.overview)}</p>` : '<p class="synopsis subtle">No synopsis on file.</p>'}
      ${streamingHtml(m.providers)}
      <div class="card-actions">
        <a class="link" href="${t.url}" target="_blank" rel="noopener">▶ ${t.exact ? 'Trailer' : 'Find trailer'}</a>
        ${m.providers?.link ? `<a class="link" href="${esc(m.providers.link)}" target="_blank" rel="noopener">📺 Where to watch</a>` : ''}
      </div>
    </div>
    ${actions ? `<div class="full card-actions">${actions}</div>` : ''}
  </article>`;
}

/* ---------- Modal ---------- */
let lastFocus = null;
export function openModal(title, bodyHtml, { onMount } = {}) {
  lastFocus = document.activeElement;
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-close>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><h2 id="modal-title">${title}</h2><button class="close" data-close aria-label="Close">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>
    </div></div>`;
  const backdrop = root.firstElementChild;
  backdrop.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeModal(); });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const f = [...backdrop.querySelectorAll('button, a[href], input, select, [tabindex="0"]')].filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.body.style.overflow = 'hidden';
  backdrop.querySelector('.close').focus();
  onMount?.(backdrop.querySelector('.modal-body'));
  return backdrop;
}
export function closeModal() {
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}
export const modalOpen = () => !!$('#modal-root').firstElementChild;

/* ---------- In-page confirm (native confirm() is blocked in some frames) ---------- */
export function askConfirm(message, { ok = 'Yes', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const root = $('#confirm-root');
    const prev = document.activeElement;
    root.innerHTML = `<div class="modal-backdrop confirm-layer">
      <div class="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-msg">
        <p id="confirm-msg" style="font-size:17px;font-weight:700;margin:4px 0 16px">${esc(message)}</p>
        <div class="card-actions" style="justify-content:flex-end">
          <button class="btn btn-ghost" data-ans="0">${esc(cancel)}</button>
          <button class="btn ${danger ? 'btn-red' : 'btn-green'}" data-ans="1">${esc(ok)}</button>
        </div></div></div>`;
    const layer = root.firstElementChild;
    const done = (v) => { root.innerHTML = ''; prev?.focus?.(); resolve(v); };
    layer.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ans]');
      if (b) done(b.dataset.ans === '1'); else if (e.target === layer) done(false);
    });
    layer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
    layer.querySelector('[data-ans="1"]').focus();
  });
}

/* ---------- Ratings ---------- */
export function ratingEditorHtml(id) {
  const fam = ratingsByMovie(app.state?.ratings || []).get(id);
  const rows = MEMBERS.map((mem) => {
    const cur = fam?.scores[mem.id];
    const btns = Array.from({ length: 10 }, (_, i) => i + 1)
      .map((n) => `<button type="button" data-rate="${mem.id}" data-score="${n}" aria-pressed="${cur === n}" aria-label="${mem.label} rates ${n} out of 10">${n}</button>`).join('');
    return `<div class="rate-row" style="--mc:${mem.color}"><span class="who">${mem.label}</span><div class="score-btns" role="group" aria-label="${mem.label}'s score">${btns}</div></div>`;
  }).join('');
  return `<div class="ratings" data-movie="${id}">${rows}
    <div class="rate-avg">${fam?.avg != null ? `Family score: ${fam.avg} / 10` : 'Tap a number for each person. Ratings are optional.'}</div></div>`;
}

export function bindRatingEditor(container, id, rerender) {
  container.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    const member = b.dataset.rate;
    const score = Number(b.dataset.score);
    const cur = ratingsByMovie(app.state.ratings).get(id)?.scores[member];
    try {
      await mutate('/api/rate', { tmdbId: id, member, score: cur === score ? null : score });
      playPop();
      const fam = ratingsByMovie(app.state.ratings).get(id);
      if (fam && fam.count === 4 && Object.values(fam.scores).every((s) => s >= 9)) { confetti(30); playTada(); toast('⭐ Family Favorite unlocked!'); }
      rerender();
    } catch (err) { toast(err.message, { error: true }); }
  });
}

export function openRatings(id, { title } = {}) {
  const m = app.movies.get(id);
  const draw = (body) => {
    body.innerHTML = `<p style="margin-top:0;font-weight:700">${esc(m.title)}${m.year ? ` (${m.year})` : ''}</p>${ratingEditorHtml(id)}
      <div class="card-actions" style="justify-content:center"><button class="btn btn-red" data-close>Done</button></div>`;
  };
  openModal(title || 'Family Ratings', '', {
    onMount: (body) => { draw(body); bindRatingEditor(body, id, () => draw(body)); },
  });
}

/* ---------- Mark watched ---------- */
export async function markWatched(id, date) {
  try {
    await mutate('/api/watched', { tmdbId: id, date });
    playDing();
    confetti(36);
    toast('🎄 New ornament on the tree!');
    openRatings(id, { title: 'How was it? Rate it!' });
  } catch (err) { toast(err.message, { error: true }); }
}

/* ---------- Movie detail modal (library, tree, scoreboard) ---------- */
export function openMovie(id) {
  const m = app.movies.get(id);
  if (!m) return;
  let pickedDate = app.state.today;
  const draw = (body) => {
    const w = activeWatch(id);
    const f = flagsMap().get(id) || {};
    const history = (app.state.watches || []).filter((x) => x.tmdb_id === id);
    const cat = categoryById[m.category];
    body.innerHTML = `${movieCard(m)}
      <p class="subtle" style="color:var(--ink-soft);font-size:13px;margin:8px 0 0">${cat.emoji} ${cat.label}${m.curated ? '' : ' · found via TMDB Christmas keywords'}${(m.tags || []).includes('hallmark') ? ' · Hallmark' : ''}</p>
      <div class="section"><h4>Watching</h4>
        ${w ? `<p style="margin:0 0 8px">✅ Watched ${formatDay(w.watched_on)}${w.source === 'nightly' ? ' (nightly pick)' : ''}</p>
          <div class="card-actions"><button class="btn btn-ghost btn-small" data-act="return">↩ Put back in rotation</button></div>`
        : `<div class="card-actions" style="align-items:center"><label for="wdate" class="sr-only">Date watched</label>
          <input type="date" id="wdate" value="${pickedDate}" max="${app.state.today}">
          <button class="btn btn-green btn-small" data-act="watched">✔ Mark as watched</button></div>`}
        ${history.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700">Watch history (${history.length})</summary>
          ${history.map((h) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <span>${formatDay(h.watched_on)}${h.returned ? ' · back in rotation' : ''}</span>
            <button class="btn btn-ghost btn-small" data-del="${h.id}" aria-label="Delete the ${formatDay(h.watched_on)} entry">Delete entry</button></div>`).join('')}
        </details>` : ''}
      </div>
      ${w || history.length ? `<div class="section"><h4>Family ratings</h4>${ratingEditorHtml(id)}</div>` : ''}
      <div class="section"><h4>Lists</h4><div class="card-actions">
        <button class="btn ${f.wishlist ? 'btn-gold' : 'btn-ghost'} btn-small" data-act="wish" aria-pressed="${!!f.wishlist}">${f.wishlist ? '⭐ On wishlist' : '☆ Add to wishlist'}</button>
        <button class="btn ${f.excluded ? 'btn-red' : 'btn-ghost'} btn-small" data-act="exclude" aria-pressed="${!!f.excluded}">${f.excluded ? '🚫 Excluded from picks' : '🚫 Never pick this'}</button>
      </div><p class="subtle" style="color:var(--ink-soft);font-size:12px;margin:6px 0 0">Wishlist movies show up more often in nightly picks. Excluded movies never appear.</p></div>`;
  };
  openModal(esc(m.title), '', {
    onMount: (body) => {
      draw(body);
      bindRatingEditor(body, id, () => draw(body));
      body.addEventListener('input', (e) => { if (e.target.id === 'wdate') pickedDate = e.target.value; });
      body.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        const del = e.target.closest('[data-del]')?.dataset.del;
        try {
          if (act === 'watched') { const day = $('#wdate', body)?.value || pickedDate; closeModal(); await markWatched(id, day); return; }
          if (act === 'return') {
            if (!(await askConfirm('Put this movie back into the nightly rotation? Its ornament and history stay.', { ok: 'Put back' }))) return;
            await mutate('/api/watched/return', { tmdbId: id }); toast('Back in rotation');
          }
          if (act === 'wish') { await mutate('/api/flag', { tmdbId: id, wishlist: !(flagsMap().get(id)?.wishlist) }); playPop(); }
          if (act === 'exclude') { await mutate('/api/flag', { tmdbId: id, excluded: !(flagsMap().get(id)?.excluded) }); playPop(); }
          if (del) {
            if (!(await askConfirm('Delete this watch entry? Use this only to fix a mistake. The ornament comes off the tree.', { ok: 'Delete', danger: true }))) return;
            await mutate('/api/watched/delete', { watchId: Number(del) }); toast('Entry deleted');
          }
          if (act || del) draw(body);
        } catch (err) { toast(err.message, { error: true }); }
      });
      // Pull fresh streaming info for this movie.
      api(`/api/providers?id=${id}`).then((r) => {
        if (r.providers) { m.providers = r.providers; if (modalOpen()) draw(body); }
      }).catch(() => {});
    },
  });
}
