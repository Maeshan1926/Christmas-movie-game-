#!/usr/bin/env node
// Local dev server: serves /public and routes /api/* to the same handler Netlify runs.
// Without Supabase env vars it uses a local JSON file (.data/dev-db.json).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiFromEnv } from '../netlify/lib/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

// Load .env if present (simple KEY=VALUE lines).
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
process.env.FAMILY_CODE = process.env.FAMILY_CODE || 'jinglebells';

const extra = {};
if (process.env.DEV_NOW) {
  // e.g. DEV_NOW=2026-12-24T19:00:00-08:00 to simulate a date
  const offset = new Date(process.env.DEV_NOW).getTime() - Date.now();
  extra.now = () => new Date(Date.now() + offset);
}
const api = apiFromEnv(process.env, extra);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await api(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let file = path.join(pub, decodeURIComponent(url.pathname));
  if (!file.startsWith(pub)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(pub, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT || 8888);
server.listen(port, () => console.log(`Christmas Movie Challenge running at http://localhost:${port}${process.env.FAMILY_CODE === 'jinglebells' ? '  (dev family code: jinglebells)' : ''}`));
