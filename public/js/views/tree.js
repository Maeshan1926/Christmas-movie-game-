import { esc, posterUrl, storage } from '../util.js';
import { app, hundredWatchedIds, firstWatch } from '../store.js';
import { ratingsByMovie } from '../shared/stats.js';
import { formatDay, daysUntilChristmas } from '../shared/dates.js';
import { categoryById, CATEGORIES } from '../shared/config.js';
import { openModal, openMovie, closeModal } from '../components.js';

const ornColor = (c) => categoryById[c]?.color || '#d63a4e';
const APEX_Y = 58; const BASE_Y = 500; const HALF_BASE = 182;

function halfWidth(y) { return (HALF_BASE * (y - APEX_Y)) / (BASE_Y - APEX_Y); }

function rng(seed) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
}

/** Exactly `n` hooks spread inside the tree, in a stable scattered fill order. */
function hooks(n) {
  const layout = (s) => {
    const pts = [];
    for (let y = APEX_Y + s * 1.4, row = 0; y <= BASE_Y - s * 0.5; y += s * 0.88, row += 1) {
      const hw = halfWidth(y) - s * 0.45;
      for (let x = 200 - hw + ((row % 2) * s) / 2; x <= 200 + hw + 0.01; x += s) pts.push([x, y]);
    }
    return pts;
  };
  let lo = 10; let hi = 60;
  for (let i = 0; i < 30; i += 1) { const mid = (lo + hi) / 2; if (layout(mid).length >= n) lo = mid; else hi = mid; }
  const s = lo;
  let pts = layout(s);
  // Trim extras evenly so exactly n remain.
  while (pts.length > n) pts.splice(Math.floor((pts.length * 0.618 * (pts.length % 7 + 1)) % pts.length), 1);
  const r = rng(1225);
  for (let i = pts.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return { pts, radius: Math.min(13, s * 0.4) };
}

function star(cx, cy, r, attrs = '') {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2; const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${pts}" ${attrs}/>`;
}

function treeSvg(entries, total, { seen, toppers }) {
  const { pts, radius } = hooks(total);
  const tiers = [[APEX_Y - 6, 150, 112], [118, 300, 158], [210, BASE_Y, HALF_BASE + 6]].reverse()
    .map(([ty, by, hw]) => `<path d="M200 ${ty} L${200 - hw} ${by} Q200 ${by + 18} ${200 + hw} ${by} Z" fill="url(#pine)" stroke="#0b2417" stroke-width="2" stroke-linejoin="round"/>`).join('');
  const garland = [[160, 150, 240, 140], [118, 232, 282, 220], [80, 318, 320, 304], [52, 404, 348, 392], [30, 478, 370, 470]]
    .map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1} Q200 ${Math.max(y1, y2) + 30} ${x2} ${y2}" fill="none" stroke="#d4a44a" stroke-width="2.5" stroke-dasharray="1.5 6" stroke-linecap="round" opacity=".8"/>`).join('');
  const lr = rng(7);
  const lightColors = ['#ff3b4f', '#ffd44d', '#3fe07a', '#4db8ff', '#ff8a2b'];
  const lights = Array.from({ length: 40 }, (_, i) => {
    const y = 100 + lr() * 390; const x = 200 + (lr() * 2 - 1) * (halfWidth(y) - 8);
    return `<circle class="tree-light" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${lightColors[i % 5]}" style="animation-delay:${(i % 7) * 0.4}s"/>`;
  }).join('');
  const emptyHooks = pts.slice(entries.length).map(([x, y]) => `<circle class="hook" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius * 0.28).toFixed(1)}"/>`).join('');
  const ornaments = entries.map((e, i) => {
    const [x, y] = pts[i];
    const isStar = (i + 1) % 10 === 0;
    const label = `${i + 1}. ${e.movie.title}, watched ${formatDay(e.watch.watched_on)}`;
    const body = isStar
      ? star(x, y, radius * 1.25, 'fill="#f1cf7e" stroke="#a87a22" stroke-width="1.5"')
      : `<rect x="${(x - radius * 0.3).toFixed(1)}" y="${(y - radius - 3).toFixed(1)}" width="${(radius * 0.6).toFixed(1)}" height="4" rx="1" fill="#c9a24a"/>
         <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${ornColor(e.movie.category)}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
         <circle cx="${(x - radius * 0.35).toFixed(1)}" cy="${(y - radius * 0.35).toFixed(1)}" r="${(radius * 0.28).toFixed(1)}" fill="#fff" opacity=".5"/>`;
    return `<g class="ornament ${i >= seen ? 'new' : ''}" tabindex="0" role="button" data-i="${i}" aria-label="${esc(label)}" style="animation-delay:${Math.max(0, i - seen) * 0.12}s"><title>${esc(label)}</title>${body}</g>`;
  }).join('');
  const gifts = Array.from({ length: toppers }, (_, i) => {
    const w = 30 + (i % 3) * 6; const h = 20 + (i % 2) * 8;
    const x = i % 2 === 0 ? 168 - Math.floor(i / 2 + 1) * 34 : 206 + Math.floor(i / 2) * 34;
    const c = ['#a3192f', '#2e6b48', '#8a6bd8', '#d4a44a', '#2c6fbb'][i % 5];
    return `<g><rect x="${x}" y="${546 - h}" width="${w}" height="${h}" rx="3" fill="${c}"/><rect x="${x + w / 2 - 3}" y="${546 - h}" width="6" height="${h}" fill="#f1cf7e"/></g>`;
  }).join('');
  const lit = entries.length >= total || daysUntilChristmas(app.state.today) === 0;
  return `<svg class="tree-svg" viewBox="0 -6 400 560" role="group" aria-label="Our Christmas tree: ${entries.length} of ${total} ornaments">
    <defs><linearGradient id="pine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7d50"/><stop offset="1" stop-color="#143f28"/></linearGradient></defs>
    <ellipse cx="200" cy="548" rx="190" ry="9" fill="rgba(246,236,216,.12)"/>
    <rect x="182" y="500" width="36" height="46" rx="4" fill="#6b3f22"/>
    ${tiers}${garland}${lights}${emptyHooks}${ornaments}${gifts}
    ${star(200, 36, 26, `class="topper ${lit ? 'lit' : ''}" fill="${lit ? '#f1cf7e' : '#7d6a3d'}" stroke="#b8862b" stroke-width="2"`)}
  </svg>`;
}

export function renderTree(el) {
  const s = app.state;
  const total = s.hundred?.ids?.length || 100;
  const fam = ratingsByMovie(s.ratings || []);
  const entries = [...hundredWatchedIds()]
    .map((id) => ({ movie: app.movies.get(id), watch: firstWatch(id) }))
    .filter((e) => e.movie && e.watch)
    .sort((a, b) => (a.watch.watched_on === b.watch.watched_on ? a.watch.id - b.watch.id : a.watch.watched_on < b.watch.watched_on ? -1 : 1));
  const seenKey = 'xmas-tree-seen-100';
  const seen = Math.min(Number(storage(seenKey) || 0), entries.length);
  const stars = Math.floor(entries.length / 10);
  el.innerHTML = `<div class="page-head"><div><div class="eyebrow">One ornament per movie · a gold star every 10</div><h1 class="page-title">Our Christmas Tree</h1></div></div>
    <div class="tree-stage">
      <div class="tree-count">${entries.length} / ${total}</div>
      ${treeSvg(entries, total, { seen, toppers: stars })}
      <div class="tree-meta">${CATEGORIES.map((c) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}<span>⭐ ${stars} gold star${stars === 1 ? '' : 's'}</span></div>
      ${entries.length ? '<p class="subtle" style="font-size:13px">Tap an ornament to relive the night.</p>' : '<p class="subtle">The tree is bare. Finish tonight\'s movie to hang the first ornament.</p>'}
    </div>`;
  storage(seenKey, String(entries.length));
  const open = (i) => {
    const e = entries[i];
    const r = fam.get(e.movie.id);
    openModal(`Ornament #${i + 1}${(i + 1) % 10 === 0 ? ' ⭐' : ''}`, `<div class="sheet-hero">
        ${e.movie.poster ? `<img src="${posterUrl(e.movie.poster, 'w342')}" alt="${esc(e.movie.title)} poster" width="120" height="180">` : '<div class="mini"></div>'}
        <div style="display:grid;gap:6px"><h3>${esc(e.movie.title)}</h3>
        <p style="color:var(--ink-soft)">${e.movie.year || ''} · ${categoryById[e.movie.category].label}</p>
        <p><b>Watched</b> ${formatDay(e.watch.watched_on, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <p>${r?.avg != null ? `<b>Family score</b> ${r.avg} / 10` : '<span style="color:var(--ink-soft)">Not rated yet</span>'}</p></div></div>
      <button class="btn btn-red btn-block" id="ornOpen">Open movie</button>`, {
      onMount: (body) => body.querySelector('#ornOpen').addEventListener('click', () => { closeModal(); openMovie(e.movie.id); }),
    });
  };
  el.querySelectorAll('.ornament').forEach((g) => {
    g.addEventListener('click', () => open(Number(g.dataset.i)));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(Number(g.dataset.i)); } });
  });
}
