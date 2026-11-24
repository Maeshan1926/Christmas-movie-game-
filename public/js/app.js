import { $, $$, esc, toast, storage } from './util.js';
import { app, api, loadCatalog, refresh, subscribe, startPolling, ApiError } from './store.js';
import { startSnow, hangLights } from './fx/snow.js';
import { setSound, soundEnabled, playJingle } from './fx/sound.js';
import { modalOpen } from './components.js';
import { renderHome } from './views/home.js';
import { renderPicks } from './views/picks.js';
import { renderTop100 } from './views/top100.js';
import { renderTree } from './views/tree.js';
import { renderMemories } from './views/memories.js';

// Route -> [render, nav tab]. Old V1 links keep working.
const ROUTES = {
  tonight: [renderHome, 'tonight'],
  picks: [renderPicks, 'tonight'],
  top100: [renderTop100, 'top100'],
  tree: [renderTree, 'tree'],
  memories: [renderMemories, 'memories'],
  library: [renderTop100, 'top100'],
  scoreboard: [renderMemories, 'memories'],
};
const view = $('#view');

function route() {
  const t = (location.hash.match(/^#\/?(\w+)/) || [])[1];
  return ROUTES[t] ? t : 'tonight';
}

let pending = false;
function render({ fromPoll = false } = {}) {
  const r = route();
  const [fn, tab] = ROUTES[r];
  $$('.tabs a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.body.classList.toggle('home', r === 'tonight');
  if (!app.state) return;
  // Never yank the page out from under someone mid-interaction during background sync.
  if (fromPoll && (modalOpen() || document.querySelector('.celebrate') || document.activeElement?.id === 'q')) { pending = true; return; }
  pending = false;
  fn(view, { keepScroll: fromPoll });
}

function renderGate(message = '') {
  document.body.classList.remove('home');
  view.innerHTML = `<section class="gate"><form id="gate">
    <div style="font-size:54px" aria-hidden="true">🎄</div>
    <h1>Welcome Home</h1>
    <p class="subtle">Enter the Trunk family code to join tonight's movie on this device.</p>
    <label class="sr-only" for="code">Family code</label>
    <input id="code" type="password" autocomplete="current-password" placeholder="Family code" required>
    <div class="err" role="alert">${esc(message)}</div>
    <button class="btn btn-red btn-block" type="submit">Let's Watch</button>
  </form></section>`;
  $('#code').focus();
  $('#gate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#code').value.trim();
    try {
      await api('/api/login', { method: 'POST', body: { code } });
      app.code = code;
      storage('xmas-family-code', code);
      await boot();
    } catch (err) { $('.err').textContent = err.message; }
  });
}

async function boot() {
  view.innerHTML = '<div class="loading"><span class="spinner"></span>Warming up the cocoa...</div>';
  try {
    if (!app.catalog.length) await loadCatalog();
    await refresh();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const hadCode = !!app.code;
      storage('xmas-family-code', null);
      app.code = null;
      renderGate(hadCode ? 'That code no longer works. Enter the current family code.' : '');
      return;
    }
    view.innerHTML = `<div class="empty">⚠️ ${esc(err.message)}<br><br><button class="btn btn-gold" id="retry">Try again</button></div>`;
    $('#retry').addEventListener('click', boot);
    return;
  }
  render();
  startPolling();
}

subscribe((changed) => { if (changed) render({ fromPoll: true }); });
window.addEventListener('xmas:closed', () => { if (pending) setTimeout(() => render({ fromPoll: true }), 0); });
window.addEventListener('hashchange', () => { render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });

const sb = $('#soundToggle');
const syncSound = () => {
  sb.textContent = soundEnabled() ? '🔔' : '🔇';
  sb.setAttribute('aria-pressed', String(soundEnabled()));
  sb.setAttribute('aria-label', soundEnabled() ? 'Sound effects on' : 'Sound effects off');
};
sb.addEventListener('click', () => { setSound(!soundEnabled()); syncSound(); if (soundEnabled()) playJingle(); else toast('Sound off'); });
syncSound();

startSnow($('#snow'));
hangLights($('.lights'));
window.addEventListener('resize', () => hangLights($('.lights')));

render();
if (app.code) boot(); else renderGate();
