import { $, $$, esc, toast, storage } from './util.js';
import { app, api, loadCatalog, refresh, subscribe, startPolling, ApiError } from './store.js';
import { daysUntilChristmas } from './shared/dates.js';
import { startSnow, hangLights } from './fx/snow.js';
import { setSound, soundEnabled, playJingle } from './fx/sound.js';
import { modalOpen } from './components.js';
import { renderTonight } from './views/tonight.js';
import { renderLibrary } from './views/library.js';
import { renderTree } from './views/tree.js';
import { renderScoreboard } from './views/scoreboard.js';

const VIEWS = { tonight: renderTonight, library: renderLibrary, tree: renderTree, scoreboard: renderScoreboard };
const view = $('#view');

function currentTab() {
  const t = (location.hash.match(/^#\/(\w+)/) || [])[1];
  return VIEWS[t] ? t : 'tonight';
}

function render({ fromPoll = false } = {}) {
  const tab = currentTab();
  $$('.tabs a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (!app.state) return;
  // Avoid yanking the page out from under someone mid-interaction during background sync.
  if (fromPoll && (modalOpen() || (tab === 'library' && document.activeElement?.id === 'q'))) return;
  VIEWS[tab](view, { keepScroll: fromPoll });
  updateCountdown();
}

function updateCountdown() {
  if (!app.state) return;
  const d = daysUntilChristmas(app.state.today);
  $('#countdown').innerHTML = d === 0 ? '<b>🎄</b>Merry Christmas!' : `<b>${d}</b>${d === 1 ? 'sleep' : 'sleeps'} to Christmas`;
}

function renderGate(message = '') {
  view.innerHTML = `<section class="gate"><form class="panel" id="gate">
    <div style="font-size:54px" aria-hidden="true">🎄</div>
    <h1>Welcome Home</h1>
    <p class="subtle">Enter the Trunk family code to join tonight's game on this device.</p>
    <label class="sr-only" for="code">Family code</label>
    <input id="code" type="password" autocomplete="current-password" placeholder="Family code" required>
    <div class="err" role="alert">${esc(message)}</div>
    <button class="btn btn-red" style="width:100%" type="submit">Let's Watch</button>
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
    } catch (err) {
      $('.err').textContent = err.message;
    }
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
    view.innerHTML = `<div class="panel empty">⚠️ ${esc(err.message)}<br><br><button class="btn btn-gold" id="retry">Try again</button></div>`;
    $('#retry').addEventListener('click', boot);
    return;
  }
  render();
  startPolling();
}

subscribe((changed) => { if (changed) render({ fromPoll: true }); });
window.addEventListener('hashchange', () => { render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });

// Sound toggle
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

if (app.code) boot(); else renderGate();
