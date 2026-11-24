# The Trunk Family Christmas Movie Challenge

A nightly Christmas movie game. Three wrapped picks every night (Comedy, Drama, Mystery Stocking), one reroll per category, a shared family scoreboard and a Christmas tree that gains an ornament for every movie watched.

## What you need (all free tiers)

| Account | Why | Cost |
|---|---|---|
| [TMDB](https://www.themoviedb.org/signup) API key | Posters, runtimes, ratings, trailers, US streaming (JustWatch data) | Free, non-commercial |
| [Supabase](https://supabase.com) project | Shared family data across devices | Free tier |
| [Netlify](https://netlify.com) site | Hosting + server functions | Free tier |

No paid services are used.

## Deploy (about 15 minutes)

1. **TMDB key.** Sign up, then Settings > API > request a Developer key. Copy the "API Key" (v3) or the "API Read Access Token".
2. **Supabase.** Create a project. Open SQL Editor, paste `supabase/schema.sql`, run it. Then Project Settings > API: copy the Project URL and the `service_role` key.
3. **Netlify.** Add new site > Import from GitHub > pick this repo. Build settings come from `netlify.toml`. Before the first deploy, add these under Site configuration > Environment variables:

   | Variable | Value |
   |---|---|
   | `FAMILY_CODE` | A private passphrase the family types once per device (case-insensitive) |
   | `TMDB_API_KEY` *or* `TMDB_READ_TOKEN` | From step 1 |
   | `SUPABASE_URL` | From step 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | From step 2 (server only, never shipped to the browser) |

4. **Deploy.** The build verifies the curated title list against TMDB, adds TMDB keyword-tagged Christmas movies, and writes the catalog. Check the build log for the count. Unmatched titles are listed in `/data/catalog-report.json` on the live site.
5. **Install on phones.** Open the site in Safari > Share > Add to Home Screen.

To refresh the catalog (new releases, streaming changes), trigger a redeploy. Streaming info for tonight's picks and any opened movie also refreshes live every 72 hours.

## How the game works

- Nights are Pacific Time dates. Picks are generated server-side on the first visit of the night and stored in Supabase, so refreshing or switching devices never changes them.
- Each category gets one reroll per night. The original pick stays, so the family chooses from up to six movies.
- No movie appears twice in a night. Movies offered in the last 14 nights are avoided while the pool allows.
- Movies streaming on a subscription service rank first; wishlist movies get a boost.
- Only **Mark as Watched** removes a movie from future picks. "Put back in rotation" returns it while keeping its history and ornament.
- Seasons run July to June. Tree and scoreboard default to the current season, with past seasons and lifetime views. Nothing resets automatically.

## Local development

```bash
cp .env.example .env    # optional: add keys
npm run build           # without a TMDB key: offline demo catalog (no posters/ratings)
npm run dev             # http://localhost:8888, dev code "jinglebells" unless FAMILY_CODE is set
npm test                # selection, rerolls, duplicates, watched exclusion, ratings, midnight reset, sync
node tests/e2e/smoke.mjs  # browser test with two devices (needs Playwright)
```

Without Supabase variables the dev server stores data in `.data/dev-db.json`. On Netlify, Supabase is required.

## Structure

- `public/` static app (no build step): `js/views/*` for the four sections, `js/shared/*` logic shared with the server
- `netlify/functions/api.mjs` single API function; `netlify/lib/*` rules, storage adapters, TMDB client
- `scripts/build-catalog.mjs` catalog builder; `data/curated-titles.txt` curated seed list
- `supabase/schema.sql` database schema (RLS on, service-role access only)
