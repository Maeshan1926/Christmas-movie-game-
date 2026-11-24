import { esc, posterHtml, posterUrl, storage } from '../util.js';
import { app } from '../store.js';
import { summarize, seasonsWithData } from '../shared/stats.js';
import { formatDay, daysUntilChristmas } from '../shared/dates.js';
import { categoryById } from '../shared/config.js';
import { openModal, openMovie, closeModal } from '../components.js';

export const ORN = { comedy: '#e23b4a', drama: '#f2c14e', stocking: '#9b7bff' };
let scope = null;

function rng(seed) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
}

/** Ornament slots inside the tree silhouette, spread in a stable shuffled order. */
function slots(count) {
  const spacing = count <= 36 ? 38 : count <= 70 ? 29 : count <= 120 ? 22 : 17;
  const pts = [];
  const top = 92; const bottom = 418; const apexY = 60; const halfBase = 168;
  for (let y = top, row = 0; y <= bottom; y += spacing * 0.86, row += 1) {
    const half = (halfBase * (y - apexY)) / (430 - apexY) - spacing * 0.35;
    for (let x = 200 - half + ((row % 2) * spacing) / 2; x <= 200 + half; x += spacing) pts.push([x, y]);
  }
  const r = rng(1225);
  for (let i = pts.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return { pts, radius: spacing * (count <= 36 ? 0.42 : 0.36) };
}

function treeSvg(entries, { starOn, gifts, seenCount }) {
  const { pts, radius } = slots(entries.length);
  const tiers = [
    [200, 50, 95, 170], [200, 120, 140, 270], [200, 200, 185, 430],
  ].reverse().map(([cx, ty, hw, by]) => `<polygon points="${cx},${ty} ${cx - hw},${by} ${cx + hw},${by}" fill="url(#pine)" stroke="#0e2a1b" stroke-width="3" stroke-linejoin="round"/>`).join('');
  const garland = [[150, 160, 250, 150], [110, 245, 290, 230], [70, 340, 330, 320], [40, 415, 360, 405]]
    .map(([x1, y1, x2, y2]) => `<path d="M${x1},${y1} Q200,${Math.max(y1, y2) + 34} ${x2},${y2}" fill="none" stroke="#e8b04a" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round" opacity=".85"/>`).join('');
  const lr = rng(7);
  const lightColors = ['#ff3b4f', '#ffd44d', '#3fe07a', '#4db8ff', '#ff8a2b'];
  const lights = Array.from({ length: 34 }, (_, i) => {
    const y = 90 + lr() * 330; const half = (168 * (y - 60)) / 370 - 6;
    const x = 200 + (lr() * 2 - 1) * half;
    return `<circle class="tree-light" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${lightColors[i % 5]}" style="animation-delay:${(i % 7) * 0.33}s"/>`;
  }).join('');
  const ornaments = entries.map((e, i) => {
    const [x, y] = pts[i % pts.length];
    const color = ORN[e.movie?.category] || '#ccc';
    const label = `${i + 1}. ${e.movie?.title || 'Movie'}, watched ${formatDay(e.watch.watched_on)}`;
    return `<g class="ornament ${i >= seenCount ? 'new' : ''}" tabindex="0" role="button" data-watch="${e.watch.id}" aria-label="${esc(label)}" style="animation-delay:${Math.max(0, i - seenCount) * 0.15}s">
      <title>${esc(label)}</title>
      <line x1="${x}" y1="${y - radius - 5}" x2="${x}" y2="${y - radius}" stroke="#d9cdb8" stroke-width="1"/>
      <rect x="${x - radius * 0.3}" y="${y - radius - 3}" width="${radius * 0.6}" height="4" rx="1" fill="#c9a24a"/>
      <circle class="ball" cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
      <circle cx="${x - radius * 0.35}" cy="${y - radius * 0.35}" r="${radius * 0.28}" fill="#fff" opacity=".55"/>
      ${radius > 9 ? `<text x="${x}" y="${y + radius * 0.35}" text-anchor="middle" font-size="${radius * 0.85}" font-weight="800" fill="rgba(0,0,0,.55)" font-family="Nunito, sans-serif">${i + 1}</text>` : ''}
    </g>`;
  }).join('');
  const giftColors = ['#c8102e', '#2f9a5f', '#7a5ad8', '#e8b04a', '#2c6fbb', '#d63a8a'];
  const presents = Array.from({ length: gifts }, (_, i) => {
    const w = 30 + (i % 3) * 6; const h = 22 + (i % 2) * 8;
    const x = i % 2 === 0 ? 168 - Math.floor(i / 2 + 1) * 34 : 206 + Math.floor(i / 2) * 34;
    const c = giftColors[i % giftColors.length];
    return `<g><rect x="${x}" y="${490 - h}" width="${w}" height="${h}" rx="3" fill="${c}"/><rect x="${x + w / 2 - 3}" y="${490 - h}" width="6" height="${h}" fill="#ffd77a"/><rect x="${x}" y="${490 - h + h / 2 - 3}" width="${w}" height="6" fill="#ffd77a"/></g>`;
  }).join('');
  const starPts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2; const rr = i % 2 === 0 ? 26 : 11;
    return `${200 + rr * Math.cos(a)},${40 + rr * Math.sin(a)}`;
  }).join(' ');
  return `<svg class="tree-svg" viewBox="0 0 400 500" role="group" aria-label="Our Christmas tree with ${entries.length} ornaments">
    <defs><linearGradient id="pine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7d4f"/><stop offset="1" stop-color="#16452c"/></linearGradient></defs>
    <ellipse cx="200" cy="492" rx="190" ry="10" fill="rgba(255,255,255,.12)"/>
    <rect x="182" y="428" width="36" height="52" rx="4" fill="#6b3f22"/>
    ${tiers}${garland}${lights}${ornaments}${presents}
    <polygon points="${starPts}" fill="${starOn ? '#ffd77a' : '#7d6a3d'}" stroke="#b8862b" stroke-width="2" class="${starOn ? 'star-glow' : ''}"/>
  </svg>`;
}

export function renderTree(el) {
  const s = app.state;
  if (scope == null) scope = s.season;
  const seasons = seasonsWithData(s.watches, s.season);
  const sum = summarize({ movies: app.movies, watches: s.watches, ratings: s.ratings, scope, today: s.today });
  const entries = sum.entries;
  const seenKey = `xmas-tree-seen-${scope}`;
  const seenCount = Math.min(Number(storage(seenKey) || 0), entries.length);
  const gifts = sum.achievements.filter((a) => a.unlocked).length;
  const starOn = entries.length >= 25 || (scope === s.season && daysUntilChristmas(s.today) === 0);
  el.innerHTML = `<div class="stage-head"><div><div class="marquee">${scope === 'lifetime' ? 'Every Christmas, all together' : `Christmas ${scope}`}</div><h1 class="section-title">Our Christmas Tree</h1></div>
      <div class="season-picker" role="group" aria-label="Season">${seasons.map((y) => `<button aria-pressed="${scope === y}" data-scope="${y}">${y}</button>`).join('')}<button aria-pressed="${scope === 'lifetime'}" data-scope="lifetime">All years</button></div></div>
    <div class="tree-wrap">
      <div class="panel" style="padding:12px">
        ${treeSvg(entries, { starOn, gifts, seenCount })}
        <div class="legend">${['comedy', 'drama', 'stocking'].map((c) => `<span><i style="background:${ORN[c]}"></i>${categoryById[c].emoji} ${categoryById[c].label}</span>`).join('')}</div>
        <p class="subtle" style="text-align:center;font-size:13px;margin:10px 0 0">${entries.length} ornament${entries.length === 1 ? '' : 's'} · ${gifts} achievement gift${gifts === 1 ? '' : 's'} under the tree · ${starOn ? 'The star is lit! ✨' : `The star lights at 25 movies or on Christmas Day`}</p>
      </div>
      <div class="panel"><h3>Our Journey</h3>
        ${entries.length ? `<div class="journey">${entries.map((e, i) => `<button data-watch="${e.watch.id}">
          <span class="num" style="background:${ORN[e.movie?.category] || '#777'}">${i + 1}</span>
          ${e.movie?.poster ? `<img src="${posterUrl(e.movie.poster, 'w92')}" alt="" loading="lazy">` : '<span class="mini"></span>'}
          <span><b>${esc(e.movie?.title || 'Unknown movie')}</b><br><small class="subtle">${formatDay(e.watch.watched_on)}${e.rating?.avg != null ? ` · Family ${e.rating.avg}` : ''}</small></span></button>`).join('')}</div>`
        : '<div class="empty">No ornaments yet. Watch tonight\'s pick to hang the first one. ❄️</div>'}
      </div>
    </div>`;
  storage(seenKey, String(entries.length));
  el.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope === 'lifetime' ? 'lifetime' : Number(b.dataset.scope);
    renderTree(el);
  }));
  const open = (wid) => {
    const idx = entries.findIndex((e) => e.watch.id === wid);
    const e = entries[idx];
    if (!e?.movie) return;
    openModal(`Ornament #${idx + 1}`, `<div style="display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:start">
        ${posterHtml(e.movie)}
        <div><h3 style="font-size:22px">${esc(e.movie.title)}</h3><p class="subtle" style="color:var(--ink-soft)">${e.movie.year || ''} · ${categoryById[e.movie.category].emoji} ${categoryById[e.movie.category].label}</p>
        <p><b>Watched:</b> ${formatDay(e.watch.watched_on, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        ${e.rating?.avg != null ? `<p><b>Family score:</b> ${e.rating.avg} / 10</p>` : '<p class="subtle" style="color:var(--ink-soft)">Not rated yet.</p>'}
        <button class="btn btn-red btn-small" id="ornOpen">Open movie</button></div></div>`, {
      onMount: (body) => body.querySelector('#ornOpen').addEventListener('click', () => { closeModal(); openMovie(e.movie.id); }),
    });
  };
  el.querySelectorAll('[data-watch]').forEach((g) => {
    g.addEventListener('click', () => open(Number(g.dataset.watch)));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(Number(g.dataset.watch)); } });
  });
}
