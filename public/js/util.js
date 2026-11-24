export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const IMG = 'https://image.tmdb.org/t/p/';
export const posterUrl = (path, size = 'w342') => (path ? `${IMG}${size}${path}` : null);
export const logoUrl = (path) => (path ? `${IMG}w92${path}` : null);

export function posterHtml(movie, { size = 'w342', cls = 'poster', eager = false } = {}) {
  const url = posterUrl(movie?.poster, size);
  if (!url) return `<div class="${cls} poster-fallback" role="img" aria-label="${esc(movie?.title)} poster">${esc(movie?.title)}</div>`;
  return `<img class="${cls}" src="${url}" alt="${esc(movie.title)} poster" ${eager ? '' : 'loading="lazy"'} decoding="async">`;
}

export function fmtRuntime(min) {
  if (!min) return null;
  const h = Math.floor(min / 60); const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function trailerUrl(m) {
  if (m.trailer) return { url: `https://www.youtube.com/watch?v=${encodeURIComponent(m.trailer)}`, exact: true };
  return { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${m.title} ${m.year || ''} trailer`)}`, exact: false };
}

let toastTimer;
export function toast(msg, { error = false, ms = 2800 } = {}) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function confetti(n = 40) {
  if (reducedMotion()) return;
  const bits = ['❄️', '⭐', '🎄', '🎁', '✨', '🔔', '🍬'];
  for (let i = 0; i < n; i += 1) {
    const s = document.createElement('span');
    s.className = 'confetti';
    s.textContent = bits[i % bits.length];
    s.style.left = `${Math.random() * 100}vw`;
    s.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    s.style.animationDelay = `${Math.random() * 0.6}s`;
    s.style.fontSize = `${14 + Math.random() * 18}px`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 5500);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* private mode */ }
  return null;
}
