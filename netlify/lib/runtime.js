// Wires the API to real dependencies from environment variables.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
import { createMemoryStore } from './store-memory.js';
import { createSupabaseStore } from './store-supabase.js';
import { tmdbFromEnv } from './tmdb.js';

let catalogCache = null;

function catalogCandidates() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(process.cwd(), 'public/data/catalog.json'),
    path.resolve(here, '../../public/data/catalog.json'),
    path.resolve(here, 'public/data/catalog.json'),
    '/var/task/public/data/catalog.json',
  ];
}

export async function loadCatalog(env = process.env) {
  if (catalogCache) return catalogCache;
  for (const p of catalogCandidates()) {
    if (fs.existsSync(p)) {
      catalogCache = JSON.parse(fs.readFileSync(p, 'utf8')).movies;
      return catalogCache;
    }
  }
  const site = env.URL || env.DEPLOY_PRIME_URL;
  if (site) {
    const res = await fetch(`${site}/data/catalog.json`);
    if (res.ok) { catalogCache = (await res.json()).movies; return catalogCache; }
  }
  throw new Error('Movie catalog not found. Run `npm run build` first.');
}

export function configError(env = process.env) {
  if (!env.FAMILY_CODE) return 'FAMILY_CODE is not set.';
  const onNetlify = !!env.NETLIFY || !!env.AWS_LAMBDA_FUNCTION_NAME;
  if (onNetlify && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) {
    return 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set so the whole family shares one game.';
  }
  return null;
}

export function apiFromEnv(env = process.env, extra = {}) {
  const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '');
  const supaUrl = clean(env.SUPABASE_URL).replace(/\/(rest\/v1)?\/?$/, '');
  const supaKey = clean(env.SUPABASE_SERVICE_ROLE_KEY).replace(/^bearer\s+/i, '');
  const store = supaUrl && supaKey
    ? createSupabaseStore({ url: supaUrl, key: supaKey })
    : createMemoryStore({ file: env.DEV_DB_FILE || path.resolve(process.cwd(), '.data/dev-db.json') });
  return createApi({
    store,
    getCatalog: () => loadCatalog(env),
    familyCode: env.FAMILY_CODE,
    tmdb: tmdbFromEnv(env),
    omdbKey: String(env.OMDB_API_KEY || '').trim() || null,
    poolSize: env.NIGHTLY_POOL_SIZE != null && env.NIGHTLY_POOL_SIZE !== '' ? Number(env.NIGHTLY_POOL_SIZE) : undefined,
    ...extra,
  });
}
