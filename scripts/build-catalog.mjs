#!/usr/bin/env node
// Builds public/data/catalog.json from TMDB.
//  1. Verifies every title in data/curated-titles.txt against TMDB (title + year within 1).
//  2. Adds well-reviewed movies tagged with Christmas keywords on TMDB.
//  3. Pulls runtime, US certification, audience score, synopsis, trailer and US streaming
//     availability (JustWatch data via TMDB) for every movie.
// Nothing is invented: titles TMDB cannot confirm are dropped and listed in the report.
//
// Usage: TMDB_API_KEY=... node scripts/build-catalog.mjs
//        node scripts/build-catalog.mjs --demo   (offline demo catalog for local UI work only)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmdbFromEnv } from '../netlify/lib/tmdb.js';
import { buildMovieRecord, categorize, DETAIL_APPEND } from '../netlify/lib/movie-record.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public/data/catalog.json');
const REPORT = path.join(root, 'public/data/catalog-report.json');
const args = new Set(process.argv.slice(2));
const MAX_DISCOVERED = Number(process.env.CATALOG_MAX_DISCOVERED || 450);
const MIN_VOTES = Number(process.env.CATALOG_MIN_VOTES || 25);
const KEYWORDS = ['christmas', 'christmas eve', 'santa claus', 'christmas party', 'christmas tree', 'christmas horror', 'christmas romance', 'christmas movie', 'holiday season'];

export function parseCurated(text) {
  const seen = new Set();
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [title, year, cat, tags] = line.split('|').map((s) => (s || '').trim());
    if (!title || !/^\d{4}$/.test(year)) continue;
    const key = `${normalize(title)}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, year: Number(year), hint: cat || undefined, tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [] });
  }
  return out;
}

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/^dr\.? seuss'?s? /, '').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isMatch(entry, r) {
  const y = r.release_date ? Number(r.release_date.slice(0, 4)) : null;
  if (!y || Math.abs(y - entry.year) > 1) return false;
  const want = normalize(entry.title);
  return [r.title, r.original_title].some((t) => normalize(t) === want);
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }));
  return results;
}

async function verifyCurated(tmdb, curated) {
  const found = [];
  const missing = [];
  await pool(curated, 8, async (entry) => {
    const tries = [
      { query: entry.title, primary_release_year: entry.year },
      { query: entry.title, year: entry.year },
      { query: entry.title },
    ];
    for (const params of tries) {
      const data = await tmdb.get('/search/movie', { ...params, include_adult: false, language: 'en-US' });
      const hit = (data?.results || []).find((r) => isMatch(entry, r));
      if (hit) { found.push({ id: hit.id, entry }); return; }
    }
    missing.push(`${entry.title} (${entry.year})`);
  });
  return { found, missing };
}

async function discover(tmdb, excludeIds) {
  const kwIds = new Set();
  for (const k of KEYWORDS) {
    const data = await tmdb.get('/search/keyword', { query: k });
    for (const r of data?.results || []) if (r.name.toLowerCase() === k) kwIds.add(r.id);
  }
  if (!kwIds.size) return [];
  const ids = [];
  for (let page = 1; page <= 40 && ids.length < MAX_DISCOVERED; page += 1) {
    const data = await tmdb.get('/discover/movie', {
      with_keywords: [...kwIds].join('|'), sort_by: 'vote_count.desc', 'vote_count.gte': MIN_VOTES,
      without_genres: '99,10402', include_adult: false, language: 'en-US', page,
    });
    const results = data?.results || [];
    for (const r of results) if (!excludeIds.has(r.id) && !ids.includes(r.id)) ids.push(r.id);
    if (page >= (data?.total_pages || 0)) break;
  }
  return ids.slice(0, MAX_DISCOVERED);
}

function writeCatalog(movies, meta, report) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  movies.sort((a, b) => a.title.localeCompare(b.title) || (a.year || 0) - (b.year || 0));
  fs.writeFileSync(OUT, JSON.stringify({ ...meta, count: movies.length, movies }));
  fs.writeFileSync(REPORT, JSON.stringify({ ...meta, count: movies.length, ...report }, null, 2));
  const byCat = movies.reduce((acc, m) => ({ ...acc, [m.category]: (acc[m.category] || 0) + 1 }), {});
  console.log(`Catalog: ${movies.length} movies ->`, byCat);
}

function demoCatalog(curated) {
  // Offline placeholder data for local UI development. Titles come from the curated list;
  // no ratings, runtimes or streaming data are fabricated.
  const movies = curated.map((e, i) => ({
    id: 900000 + i, title: e.title, year: e.year, date: null, genres: [], category: categorize([], e.hint),
    tags: e.tags, runtime: null, cert: null, score: null, votes: 0, overview: '', poster: null, backdrop: null,
    trailer: null, lang: null, providers: null, curated: true,
  }));
  writeCatalog(movies, { source: 'demo', generatedAt: new Date().toISOString() }, { note: 'Demo catalog: unverified, local development only.' });
}

async function main() {
  const curated = parseCurated(fs.readFileSync(path.join(root, 'data/curated-titles.txt'), 'utf8'));
  const tmdb = tmdbFromEnv(process.env, { timeoutMs: 15000 });
  if (!tmdb) {
    const onNetlify = !!process.env.NETLIFY;
    if (args.has('--demo') || (!onNetlify && !fs.existsSync(OUT))) {
      console.warn('No TMDB key: writing an offline DEMO catalog for local development.');
      demoCatalog(curated);
      return;
    }
    if (fs.existsSync(OUT) && !onNetlify) { console.log('No TMDB key: keeping existing catalog.'); return; }
    console.error('TMDB_API_KEY (or TMDB_READ_TOKEN) is required to build the movie catalog. Add it in Netlify > Site configuration > Environment variables.');
    process.exit(1);
  }

  console.log(`Verifying ${curated.length} curated titles against TMDB...`);
  const { found, missing } = await verifyCurated(tmdb, curated);
  console.log(`  verified ${found.length}, not found ${missing.length}`);
  const hints = new Map();
  for (const f of found) if (!hints.has(f.id)) hints.set(f.id, f.entry);

  console.log('Discovering more Christmas movies via TMDB keywords...');
  const discovered = await discover(tmdb, new Set(hints.keys()));
  console.log(`  discovered ${discovered.length}`);

  const all = [...hints.keys(), ...discovered];
  const failed = [];
  const movies = (await pool(all, 8, async (id) => {
    try {
      const d = await tmdb.get(`/movie/${id}`, { append_to_response: DETAIL_APPEND, language: 'en-US' });
      if (!d) { failed.push(id); return null; }
      const entry = hints.get(id);
      const m = buildMovieRecord(d, { hint: entry?.hint, tags: entry?.tags || [], curated: !!entry });
      if (!entry && ((m.runtime && m.runtime < 40) || m.genres.includes('Documentary'))) return null;
      return m;
    } catch (err) {
      failed.push(id);
      console.warn(`  details failed for ${id}: ${err.message}`);
      return null;
    }
  })).filter(Boolean);

  writeCatalog(movies, { source: 'tmdb', generatedAt: new Date().toISOString() }, {
    curatedVerified: found.length, curatedMissing: missing.sort(), discovered: discovered.length, detailFailures: failed,
  });
  if (movies.length < 300) {
    console.error('Catalog came back unexpectedly small. Check the TMDB key.');
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
