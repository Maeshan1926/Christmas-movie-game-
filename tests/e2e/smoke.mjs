// End-to-end smoke test for V2: boots the dev server against a throwaway DB and drives two devices.
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
const shot = async (pg, name, full = false) => { if (shots) await pg.screenshot({ path: `${shots}/${name}.png`, fullPage: full }); };

const browser = await chromium.launch();
try {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: shots ? 2 : 1, isMobile: true, hasTouch: true });
  const desk = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: shots ? 2 : 1 });
  const p = await phone.newPage();
  const d = await desk.newPage();
  for (const pg of [p, d]) {
    pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|image\.tmdb|status of 401|hero\.jpg|404/.test(m.text())) errors.push(`console: ${m.text()}`); });
  }

  // Login
  await p.goto(base);
  await p.fill('#code', 'nope'); await p.click('#gate button');
  await p.waitForSelector('.err:has-text("nice list")');
  await p.fill('#code', 'JingleBells'); await p.click('#gate button');
  await p.waitForSelector('#pickBtn');
  // Home: main action visible without scrolling
  const box = await p.locator('#pickBtn').boundingBox();
  if (box.y + box.height > 844 - 64) fail(`Pick button below the fold (${box.y + box.height})`);
  if (!(await p.locator('.ring').textContent()).includes('of 100')) fail('home progress missing');
  await shot(p, '1-phone-home');

  // Picks
  await p.click('#pickBtn');
  await p.waitForSelector('.pick');
  await p.waitForTimeout(1200);
  if ((await p.locator('#panel-comedy .pick').count()) !== 1) fail('expected one comedy card');
  await shot(p, '2-phone-picks');
  // Reroll comedy
  await p.click('[data-reroll="comedy"]');
  await p.waitForFunction(() => document.querySelectorAll('#panel-comedy .pick').length === 2, null, { timeout: 5000 });
  if (!(await p.locator('[data-reroll="comedy"]').isDisabled())) fail('reroll should be used');
  // Refresh keeps state
  const before = await p.locator('.pick h3').allTextContents();
  await p.reload(); await p.waitForSelector('.pick');
  if (JSON.stringify(before) !== JSON.stringify(await p.locator('.pick h3').allTextContents())) fail('refresh changed picks');
  if (!(await p.locator('[data-reroll="comedy"]').isDisabled())) fail('refresh restored reroll');
  const all = await p.evaluate(() => [...document.querySelectorAll('.pick h3')].map((h) => h.textContent));
  if (new Set(all).size !== all.length) fail('duplicate picks');

  // Desktop sees same lineup
  await d.goto(base); await d.fill('#code', 'jinglebells'); await d.click('#gate button');
  await d.waitForSelector('#pickBtn'); await shot(d, '3-desk-home');
  await d.goto(`${base}/#picks`); await d.waitForSelector('.pick'); await d.waitForTimeout(1500);
  const dt = await d.locator('.pick h3').allTextContents();
  if (JSON.stringify([...dt].sort()) !== JSON.stringify([...before].sort())) fail('devices disagree');
  await shot(d, '4-desk-picks');

  // Seen it swap (drama), no reroll used
  await p.click('#tab-drama');
  const seenId = await p.locator('#panel-drama [data-seen]').first().getAttribute('data-seen');
  await p.click(`#panel-drama [data-seen="${seenId}"]`);
  await p.waitForFunction((id) => !document.querySelector(`[data-seen="${id}"]`), seenId);
  if (await p.locator('[data-reroll="drama"]').isDisabled()) fail('seen-it consumed reroll');

  // Select -> festive confirmation -> back -> finished
  await p.click('#tab-comedy');
  const chooseId = await p.locator('#panel-comedy [data-choose]').first().getAttribute('data-choose');
  await p.click(`#panel-comedy [data-choose="${chooseId}"]`);
  await p.waitForSelector('.confirm-screen');
  await p.waitForTimeout(900);
  await shot(p, '5-phone-confirm');
  await p.click('#cBack');
  // Not watched until confirmed finished
  const st = await p.evaluate(async () => (await (await fetch('/api/state', { headers: { 'x-family-code': 'jinglebells' } })).json()).watches.length);
  if (st !== 0) fail('selected movie was marked watched too early');
  await p.click(`[data-finished="${chooseId}"]`);
  await p.click('.confirm-box [data-ans="1"]');
  await p.waitForSelector('.celebrate');
  await shot(p, '6-phone-celebrate');
  await p.waitForSelector('.modal .score-btns', { timeout: 6000 });
  for (const [m, s] of [['dad', 9], ['mommy', 10], ['lincoln', 9], ['sienna', 9]]) {
    await p.click(`.modal [data-rate="${m}"][data-score="${s}"]`);
    await p.waitForSelector(`.modal [data-rate="${m}"][data-score="${s}"][aria-pressed="true"]`);
  }
  await p.click('.modal .btn-red[data-close]');

  // Top 100: progress 1/100, check mark, manual mark + unmark
  await p.goto(`${base}/#top100`); await p.waitForSelector('.ptile');
  if ((await p.locator('.ptile').count()) !== 100) fail(`expected 100 tiles, got ${await p.locator('.ptile').count()}`);
  if (!(await p.locator('.progress').textContent()).includes('1 of 100')) fail('progress not 1/100');
  if ((await p.locator('.ptile .check').count()) !== 1) fail('expected one check');
  await shot(p, '7-phone-top100');
  await p.click('[data-status="unwatched"]');
  if ((await p.locator('.ptile').count()) !== 99) fail('unwatched filter wrong');
  const target = p.locator('.ptile').nth(3);
  await target.click();
  await p.waitForSelector('.modal #wdate');
  await p.fill('#wdate', '2026-11-20');
  await p.click('[data-act="watched"]');
  await p.waitForSelector('.modal .score-btns', { timeout: 6000 });
  await p.click('.modal .close');
  await p.click('[data-status="watched"]');
  await p.waitForFunction(() => document.querySelectorAll('.ptile').length === 2);
  // Unmark it again
  await p.locator('.ptile', { hasText: 'Nov 20' }).click();
  await p.click('[data-act="unmark"]'); await p.click('.confirm-box [data-ans="1"]');
  await p.waitForFunction(() => document.querySelectorAll('.modal [data-act="watched"]').length === 1);
  await p.click('.modal .close');
  await p.waitForFunction(() => document.querySelectorAll('.ptile').length === 1);
  // Search + sort
  await p.click('[data-status="all"]');
  await p.fill('#q', 'Elf'); await p.waitForTimeout(200);
  await p.fill('#q', '');
  await p.selectOption('#sort', 'newest');

  // Tree: one ornament, 99 empty hooks
  await p.goto(`${base}/#tree`); await p.waitForSelector('.tree-svg');
  if ((await p.locator('.ornament').count()) !== 1) fail('expected 1 ornament');
  if ((await p.locator('.hook').count()) !== 99) fail(`expected 99 hooks, got ${await p.locator('.hook').count()}`);
  await p.locator('.ornament').first().click();
  await p.waitForSelector('.modal:has-text("Ornament #1")');
  await p.click('.modal .close');
  await shot(p, '8-phone-tree', true);

  // Memories
  await p.goto(`${base}/#memories`); await p.waitForSelector('.ticket');
  if ((await p.locator('.ticket b').first().textContent()).trim() !== '1') fail('memories count');
  if (!(await p.locator('.top-rated').textContent()).includes('9.3')) fail('favorites missing');
  await shot(p, '9-phone-memories', true);
  await d.goto(`${base}/#memories`); await d.waitForSelector('.ticket'); await shot(d, '10-desk-memories');
  await d.goto(`${base}/#tree`); await d.waitForSelector('.ornament'); await shot(d, '11-desk-tree');
  await d.goto(`${base}/#top100`); await d.waitForSelector('.ptile'); await shot(d, '12-desk-top100');

  // No horizontal overflow on phone
  for (const tab of ['tonight', 'picks', 'top100', 'tree', 'memories']) {
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
