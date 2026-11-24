// End-to-end smoke test: boots the dev server against a throwaway DB and drives two devices.
// Usage: node tests/e2e/smoke.mjs [screenshotDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const shots = process.argv[2] || null;
const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xmas-')), 'db.json');
const port = 8899;
const srv = spawn('node', ['scripts/dev-server.mjs'], { env: { ...process.env, PORT: String(port), DEV_DB_FILE: db, FAMILY_CODE: 'jinglebells', SUPABASE_URL: '', TMDB_API_KEY: '', TMDB_READ_TOKEN: '' }, stdio: 'pipe' });
await new Promise((r) => srv.stdout.on('data', (d) => d.toString().includes('running') && r()));
const base = `http://localhost:${port}`;
const errors = [];
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch();
try {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: shots ? 2 : 1, isMobile: true, hasTouch: true });
  const desk = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: shots ? 2 : 1 });
  const p = await phone.newPage();
  const d = await desk.newPage();
  for (const pg of [p, d]) {
    pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|image\.tmdb|status of 401/.test(m.text())) errors.push(`console: ${m.text()}`); });
    pg.on('dialog', (dl) => dl.accept());
  }

  // Login with wrong then right code
  await p.goto(base);
  await p.fill('#code', 'nope'); await p.click('#gate button');
  await p.waitForSelector('.err:has-text("nice list")');
  await p.fill('#code', 'JingleBells'); await p.click('#gate button');
  await p.waitForSelector('#revealBtn');
  if (shots) await p.screenshot({ path: `${shots}/1-phone-gifts.png` });

  // Reveal
  await p.click('#revealBtn');
  await p.waitForSelector('.mcard', { timeout: 8000 });
  await p.waitForTimeout(1800);
  if ((await p.locator('.mcard').count()) !== 3) fail('expected 3 cards after reveal');
  if (shots) await p.screenshot({ path: `${shots}/2-phone-reveal.png` });

  // Reroll comedy -> 4 cards, button used
  await p.click('[data-reroll="comedy"]');
  await p.waitForFunction(() => document.querySelectorAll('.mcard').length === 4, null, { timeout: 5000 });
  if (!(await p.locator('[data-reroll="comedy"]').isDisabled())) fail('reroll should be used up');

  // Refresh must not reset
  const before = await p.locator('.mcard h3').allTextContents();
  await p.reload(); await p.waitForSelector('.mcard');
  const after = await p.locator('.mcard h3').allTextContents();
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('refresh changed picks');
  if (!(await p.locator('[data-reroll="comedy"]').isDisabled())) fail('refresh restored reroll');

  // Desktop device sees same lineup
  await d.goto(base); await d.fill('#code', 'jinglebells'); await d.click('#gate button');
  await d.waitForSelector('#revealBtn'); await d.click('#revealBtn'); await d.waitForSelector('.mcard'); await d.waitForTimeout(2600);
  const dTitles = await d.locator('.mcard h3').allTextContents();
  if (JSON.stringify(dTitles.sort()) !== JSON.stringify([...after].sort())) fail('devices disagree on lineup');
  if (!(await d.locator('[data-reroll="comedy"]').isDisabled())) fail('reroll not shared across devices');

  // "Seen it" swaps a card without using the drama reroll
  const seenId = await p.locator('[data-seen]').last().getAttribute('data-seen');
  await p.click(`[data-seen="${seenId}"]`);
  await p.waitForFunction((id) => !document.querySelector(`[data-seen="${id}"]`), seenId);
  if ((await p.locator('.mcard').count()) !== 4) fail('seen-it should keep 4 cards');

  // Choose on phone, mark watched, rate
  const firstId = await p.locator('[data-choose]').first().getAttribute('data-choose');
  await p.click(`[data-choose="${firstId}"]`);
  await p.waitForSelector(`[data-watched="${firstId}"]`);
  if (shots) { await p.waitForTimeout(400); await p.locator('.mcard.chosen').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${shots}/3-phone-chosen.png` }); }
  await p.click(`[data-watched="${firstId}"]`);
  await p.click('.confirm [data-ans="1"]');
  await p.waitForSelector('.modal .score-btns');
  for (const [m, s] of [['dad', 9], ['mommy', 10], ['lincoln', 9], ['sienna', 9]]) {
    await p.click(`.modal [data-rate="${m}"][data-score="${s}"]`);
    await p.waitForSelector(`.modal [data-rate="${m}"][data-score="${s}"][aria-pressed="true"]`);
  }
  if (!(await p.locator('.rate-avg').textContent()).includes('9.3')) fail('family avg wrong');
  if (shots) await p.screenshot({ path: `${shots}/4-phone-ratings.png` });
  await p.click('.modal button.btn-red[data-close]');

  // Desktop picks it up on poll/focus
  await d.evaluate(() => window.dispatchEvent(new Event('focus')));
  await d.waitForSelector('.mcard.watched', { timeout: 8000 });

  // Tree has one ornament
  await p.goto(`${base}/#tree`); await p.waitForSelector('.tree-svg');
  if ((await p.locator('.ornament').count()) !== 1) fail('expected 1 ornament');
  await p.locator('.ornament').first().click();
  await p.waitForSelector('.modal:has-text("Ornament #1")');
  await p.click('.modal .close');
  if (shots) await p.screenshot({ path: `${shots}/5-phone-tree.png`, fullPage: true });

  // Library: manual watched with past date
  await d.goto(`${base}/#library`); await d.waitForSelector('.tile');
  await d.fill('#q', 'Die Hard');
  await d.waitForFunction(() => [...document.querySelectorAll('.tile .t')].some((t) => t.textContent === 'Die Hard'));
  await d.locator('.tile[aria-label^="Die Hard 1988"]').click();
  await d.waitForSelector('.modal #wdate');
  await d.waitForTimeout(500);
  await d.fill('#wdate', '2026-11-20');
  await d.click('[data-act="watched"]');
  await d.waitForSelector('.modal .score-btns');
  await d.click('.modal [data-rate="lincoln"][data-score="7"]');
  await d.waitForSelector('.modal [data-rate="lincoln"][data-score="7"][aria-pressed="true"]');
  await d.click('.modal .close');
  await d.selectOption('[data-f="status"]', 'watched'); await d.fill('#q', '');
  await d.waitForFunction(() => document.querySelectorAll('.tile').length === 2);
  if (shots) await d.screenshot({ path: `${shots}/6-desk-library.png` });
  await d.selectOption('[data-f="status"]', 'all');

  // Scoreboard
  await d.goto(`${base}/#scoreboard`); await d.waitForSelector('.stats');
  const watchedCount = await d.locator('.stat .v').first().textContent();
  if (watchedCount.trim() !== '2') fail(`scoreboard count ${watchedCount}`);
  for (const name of ['First Snow', 'Yippee Ki Yay', 'Family Favorite']) {
    if (!(await d.locator('.ach.on', { hasText: name }).count())) fail(`achievement ${name} not unlocked`);
  }
  if (shots) await d.screenshot({ path: `${shots}/7-desk-scoreboard.png`, fullPage: true });
  await d.goto(`${base}/#tree`); await d.waitForSelector('.ornament');
  if ((await d.locator('.ornament').count()) !== 2) fail('expected 2 ornaments on desktop tree');
  if (!(await d.locator('.journey').textContent()).includes('Nov 20, 2026')) fail('manual watch date not saved');
  if (shots) await d.screenshot({ path: `${shots}/8-desk-tree.png` });
  await d.goto(`${base}/#tonight`); await d.waitForSelector('.mcard');
  if (shots) await d.screenshot({ path: `${shots}/9-desk-tonight.png` });

  // No horizontal overflow on phone
  for (const tab of ['tonight', 'library', 'tree', 'scoreboard']) {
    await p.goto(`${base}/#${tab}`); await p.waitForTimeout(500);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) fail(`phone ${tab} overflows by ${over}px`);
  }
  if (errors.length) fail(`browser errors:\n${errors.join('\n')}`);
  console.log('E2E smoke: PASS');
} finally {
  await browser.close();
  srv.kill();
}
