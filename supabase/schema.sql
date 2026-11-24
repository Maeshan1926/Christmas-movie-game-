-- The Trunk Family Christmas Movie Challenge: Supabase schema.
-- Run once in Supabase > SQL Editor. Safe to re-run.
-- All access goes through Netlify Functions with the service-role key.
-- Row Level Security is ON with no policies, so the public anon key can read nothing.

create table if not exists public.nights (
  night       date primary key,                 -- Pacific Time calendar date
  picks       jsonb not null,                   -- {"comedy":[id,id],"drama":[id],"stocking":[id]}
  rerolls     jsonb not null default '{}'::jsonb,
  chosen      integer,
  started_at  timestamptz,
  version     integer not null default 1,       -- optimistic concurrency across devices
  created_at  timestamptz not null default now()
);

create table if not exists public.watches (
  id          bigserial primary key,
  tmdb_id     integer not null,
  watched_on  date not null,
  source      text not null default 'manual' check (source in ('nightly','manual')),
  returned    boolean not null default false,   -- true = back in rotation, history kept
  created_at  timestamptz not null default now()
);
create index if not exists watches_tmdb_idx on public.watches (tmdb_id);
-- At most one active (not returned) watch per movie.
create unique index if not exists watches_one_active on public.watches (tmdb_id) where not returned;

create table if not exists public.ratings (
  tmdb_id     integer not null,
  member      text not null check (member in ('dad','mommy','lincoln','sienna')),
  score       smallint not null check (score between 1 and 10),
  updated_at  timestamptz not null default now(),
  primary key (tmdb_id, member)
);

create table if not exists public.movie_flags (
  tmdb_id     integer primary key,
  excluded    boolean not null default false,
  wishlist    boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.provider_cache (
  tmdb_id     integer primary key,
  providers   jsonb not null,
  fetched_at  timestamptz not null default now()
);

create table if not exists public.custom_movies (
  tmdb_id     integer primary key,
  movie       jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.nights          enable row level security;
alter table public.watches         enable row level security;
alter table public.ratings         enable row level security;
alter table public.movie_flags     enable row level security;
alter table public.provider_cache  enable row level security;
alter table public.custom_movies   enable row level security;
