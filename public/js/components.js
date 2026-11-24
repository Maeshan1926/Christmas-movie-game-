import { esc, fmtRuntime, trailerUrl, logoUrl, posterUrl, toast, confetti, reducedMotion, $ } from './util.js';
import { app, api, mutate, flagsMap, activeWatch, hundredRank, hundredWatchedIds } from './store.js';
import { availability, includedServices } from './shared/streaming.js';
import { MEMBERS, categoryById } from './shared/config.js';
import { ratingsByMovie } from './shared/stats.js';
import { formatDay } from './shared/dates.js';
import { playDing, playPop, playTada } from './fx/sound.js';

/* ---------- Posters ---------- */
export function posterImg(m, { size = 'w342', big = false, eager = false, cls = '' } = {}) {
  if (!m?.poster) return `<div class="no-poster ${cls}" role="img" aria-label="${esc(m?.title)} poster">${esc(m?.title)}</div>`;
  const src = posterUrl(m.poster, size);
  const srcset = big ? ` srcset="${posterUrl(m.poster, 'w342')} 342w, ${posterUrl(m.poster, 'w500')} 500w, ${posterUrl(m.poster, 'w780')} 780w" sizes="(min-width: 900px) 340px, 86vw"` : '';
  return `<img class="${cls}" src="${src}"${srcset} alt="${esc(m.title)} poster" width="342" height="513" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

/* ---------- Facts, scores, streaming ---------- */
export function factsHtml(m) {
  const bits = [m.year, fmtRuntime(m.runtime), m.cert].filter(Boolean);
  return `<div class="facts">${bits.map((b) => `<span>${esc(b)}</span>`).join('<span aria-hidden="true">·</span>')}</div>`;
}

/** Only real scores: Rotten Tomatoes/IMDb via OMDb when configured, TMDB audience score from the catalog. */
export function scoresHtml(m) {
  const s = m.providers?.scores || null;
  const out = [];
  if (s?.rt) out.push(`<span class="score rt" title="Rotten Tomatoes critics score">🍅 ${esc(s.rt)}</span>`);
  if (s?.imdb) out.push(`<span class="score" title="IMDb user rating">IMDb ${esc(s.imdb)}</span>`);
  if (m.score) out.push(`<span class="score" title="TMDB audience score from ${m.votes} votes">★ ${m.score.toFixed(1)} TMDB</span>`);
  const fam = ratingsByMovie(app.state?.ratings || []).get(m.id);
  if (fam?.avg != null) out.push(`<span class="score" style="background:#fbe0e5;color:#8a1426">🎄 Family ${fam.avg}</span>`);
  return out.length ? `<div class="scores">${out.join('')}</div>` : '';
}

export function streamingHtml(p) {
  const a = availability(p);
  if (a === 'unknown') return '<div class="stream">Streaming not verified yet.</div>';
  if (a === 'none') return '<div class="stream">Not streaming in the US right now.</div>';
  const list = a === 'included'
    ? includedServices(p)
    : [...new Map([...(p.rent || []), ...(p.buy || [])].map((x) => [x.name, x])).values()];
  const logos = list.slice(0, 6).map((s) => (s.logo
    ? `<img src="${logoUrl(s.logo)}" alt="${esc(s.name)}" title="${esc(s.name)}" width="30" height="30" loading="lazy">`
    : `<span class="svc">${esc(s.name)}</span>`)).join('');
  const label = a === 'included' ? `<b class="ok">Streaming</b> on ${esc(list.slice(0, 2).map((s) => s.name).join(', '))}` : `<b>${a === 'rent' ? 'Rent' : 'Buy'}</b> only`;
  const asOf = p.asOf ? ` <span style="opacity:.7">· checked ${esc(new Date(p.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>` : '';
  return `<div class="stream">${label}${asOf}${logos ? `<div class="logos">${logos}</div>` : ''}</div>`;
}

export function watchLink(m) {
  return m.providers?.link || `https://www.themoviedb.org/movie/${m.id}/watch?locale=US`;
}

/* ---------- Modal sheet ---------- */
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
  window.dispatchEvent(new Event('xmas:closed'));
}
export const modalOpen = () => !!$('#modal-root').firstElementChild || !!document.querySelector('.confirm-screen');

/* In-page confirm (native confirm() is blocked in some frames). */
export function askConfirm(message, { ok = 'Yes', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const root = $('#confirm-root');
    const prev = document.activeElement;
    root.innerHTML = `<div class="confirm-layer"><div class="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-msg">
      <p id="confirm-msg" style="font-size:17px;font-weight:700;margin:0 0 16px">${esc(message)}</p>
      <div class="actions-row" style="justify-content:flex-end"><button class="btn btn-ghost" data-ans="0">${esc(cancel)}</button>
      <button class="btn ${danger ? 'btn-red' : 'btn-green'}" data-ans="1">${esc(ok)}</button></div></div></div>`;
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
  return `<div>${rows}<div class="rate-avg">${fam?.avg != null ? `Family score ${fam.avg} / 10` : 'Ratings are optional'}</div></div>`;
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
    body.innerHTML = `<p style="font-weight:800">${esc(m.title)}${m.year ? ` (${m.year})` : ''}</p>${ratingEditorHtml(id)}
      <button class="btn btn-red btn-block" data-close>Done</button>`;
  };
  openModal(title || 'Family ratings', '', { onMount: (body) => { draw(body); bindRatingEditor(body, id, () => draw(body)); } });
}

/* ---------- Celebration ---------- */
const ORN_COLORS = { comedy: '#d63a4e', drama: '#e6b544', stocking: '#9b7bff' };
export function ornamentSvg(color, star = false) {
  if (star) {
    return '<svg viewBox="0 0 120 140" class="orn"><line x1="60" y1="0" x2="60" y2="22" stroke="#e9dcc0" stroke-width="2"/><polygon points="60,22 74,58 112,60 82,84 93,122 60,100 27,122 38,84 8,60 46,58" fill="#f1cf7e" stroke="#b8862b" stroke-width="3"/></svg>';
  }
  return `<svg viewBox="0 0 120 140" class="orn"><line x1="60" y1="0" x2="60" y2="22" stroke="#e9dcc0" stroke-width="2"/><rect x="48" y="20" width="24" height="12" rx="3" fill="#c9a24a"/><circle cx="60" cy="84" r="52" fill="${color}"/><path d="M14 84 Q60 104 106 84" stroke="#f1cf7e" stroke-width="5" fill="none"/><circle cx="42" cy="64" r="12" fill="#fff" opacity=".45"/></svg>`;
}

export function celebrate(m) {
  const n = hundredWatchedIds().size;
  const inHundred = hundredRank(m.id) != null;
  const star = inHundred && n > 0 && n % 10 === 0;
  return new Promise((resolve) => {
    const root = $('#fx-root');
    root.innerHTML = `<div class="celebrate" role="status">
      <div>${ornamentSvg(ORN_COLORS[m.category] || '#d63a4e', star)}
      <h2>${star ? `Gold star! ${n} movies done` : inHundred ? `Ornament #${n} is on the tree` : 'Added to your memories'}</h2>
      <p>${esc(m.title)}</p></div></div>`;
    const el = root.firstElementChild;
    const done = () => { root.innerHTML = ''; resolve(); window.dispatchEvent(new Event('xmas:closed')); };
    el.addEventListener('click', done);
    setTimeout(done, reducedMotion() ? 1200 : 2300);
    confetti(star ? 70 : 40);
    star ? playTada() : playDing();
  });
}

/* ---------- Mark watched ---------- */
export async function markWatched(id, date) {
  try {
    await mutate('/api/watched', { tmdbId: id, date });
    await celebrate(app.movies.get(id));
    openRatings(id, { title: 'How was it? Rate it' });
  } catch (err) { toast(err.message, { error: true }); }
}

/* ---------- Movie sheet ---------- */
export function openMovie(id) {
  const m = app.movies.get(id);
  if (!m) return;
  let pickedDate = app.state.today;
  const draw = (body) => {
    const w = activeWatch(id);
    const history = (app.state.watches || []).filter((x) => x.tmdb_id === id).sort((a, b) => (a.watched_on < b.watched_on ? 1 : -1));
    const f = flagsMap().get(id) || {};
    const rank = hundredRank(id);
    const cat = categoryById[m.category];
    const t = trailerUrl(m);
    body.innerHTML = `<div class="sheet-hero">${m.poster ? `<img src="${posterUrl(m.poster, 'w342')}" alt="${esc(m.title)} poster" width="120" height="180">` : '<div class="mini"></div>'}
        <div style="display:grid;gap:6px"><div class="eyebrow" style="color:var(--cranberry)">${rank ? `#${rank} of the Christmas 100` : 'Christmas library'} · ${cat.emoji} ${cat.label}</div>
        <h3>${esc(m.title)}</h3>${factsHtml(m)}${scoresHtml(m)}</div></div>
      ${m.overview ? `<p style="font-size:14px;line-height:1.5;color:var(--ink-soft)">${esc(m.overview)}</p>` : ''}
      ${streamingHtml(m.providers)}
      <div class="actions-row"><a class="btn btn-ghost btn-small" href="${t.url}" target="_blank" rel="noopener">▶ ${t.exact ? 'Trailer' : 'Find trailer'}</a>
        <a class="btn btn-ghost btn-small" href="${esc(watchLink(m))}" target="_blank" rel="noopener">📺 Where to watch</a></div>
      <div class="section"><h4>Watched</h4>
        ${w ? `<p style="margin-bottom:8px"><b style="color:var(--check)">✓ Watched</b> ${formatDay(w.watched_on)}</p>
          <div class="actions-row"><button class="btn btn-ghost btn-small" data-act="unmark">Unmark watched</button>
          <button class="btn btn-ghost btn-small" data-act="replay">🔁 Watch again someday</button></div>`
        : `<div class="actions-row"><label for="wdate" class="sr-only">Date watched</label>
          <input type="date" id="wdate" value="${pickedDate}" max="${app.state.today}">
          <button class="btn btn-green btn-small" data-act="watched">✓ Mark watched</button></div>`}
        ${history.length && !w ? `<p class="subtle" style="color:var(--ink-soft);font-size:13px;margin-top:8px">Watched before: ${history.map((h) => formatDay(h.watched_on)).join(', ')}. Back in the rotation for a replay.</p>` : ''}
      </div>
      ${history.length ? `<div class="section"><h4>Family ratings</h4>${ratingEditorHtml(id)}</div>` : ''}
      ${!w ? `<div class="section"><div class="actions-row"><button class="btn ${f.excluded ? 'btn-red' : 'btn-ghost'} btn-small" data-act="skip" aria-pressed="${!!f.excluded}">${f.excluded ? '🚫 Skipped in nightly picks' : '👀 Seen it already, skip in picks'}</button></div></div>` : ''}`;
  };
  openModal(esc(m.title), '', {
    onMount: (body) => {
      draw(body);
      bindRatingEditor(body, id, () => draw(body));
      body.addEventListener('input', (e) => { if (e.target.id === 'wdate') pickedDate = e.target.value; });
      body.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        try {
          if (act === 'watched') { const day = $('#wdate', body)?.value || pickedDate; closeModal(); await markWatched(id, day); return; }
          if (act === 'unmark') {
            if (!(await askConfirm('Unmark this movie? Its watch date and ornament come off. Ratings stay.', { ok: 'Unmark', danger: true }))) return;
            await mutate('/api/watched/delete', { watchId: activeWatch(id).id }); toast('Unmarked');
          }
          if (act === 'replay') {
            if (!(await askConfirm('Put this movie back in the nightly picks for a replay? Its history and ornament stay.', { ok: 'Watch again' }))) return;
            await mutate('/api/watched/return', { tmdbId: id }); toast('Back in the nightly picks');
          }
          if (act === 'skip') { await mutate('/api/flag', { tmdbId: id, excluded: !(flagsMap().get(id)?.excluded) }); playPop(); }
          draw(body);
        } catch (err) { toast(err.message, { error: true }); }
      });
      api(`/api/providers?id=${id}`).then((r) => {
        if (r.providers) { m.providers = r.providers; if ($('#modal-root').firstElementChild) draw(body); }
      }).catch(() => {});
    },
  });
}
