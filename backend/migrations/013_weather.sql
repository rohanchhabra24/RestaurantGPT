-- Historical weather lookups for the DIAGNOSTIC investigation path (see
-- weather_service.py) — the fix for "we already track weather_flag on
-- orders but nothing ever independently checks it." A restaurant's
-- location is optional (set via Settings, not required at onboarding):
-- until it's set, the weather step honestly reports "unavailable" rather
-- than guessing a location.

alter table restaurants add column if not exists city text;
alter table restaurants add column if not exists latitude numeric(9,6);
alter table restaurants add column if not exists longitude numeric(9,6);

-- Historical weather for a given date never changes once that date has
-- passed, so this is a permanent cache, not a TTL'd one — a repeat
-- question about the same day/location never re-hits the API. Scoped by
-- restaurant_id (not just lat/long) to match this schema's tenant
-- isolation convention everywhere else, even though the underlying fact
-- (weather at a place on a date) isn't itself restaurant-specific — the
-- cost of that is two restaurants in the same city each caching their own
-- copy, which is a fine tradeoff for keeping RLS uniform across every
-- table in this app.
create table if not exists weather_cache (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  observed_date date not null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  precipitation_mm numeric(6,2),
  weather_code int not null,
  condition text not null,
  is_rainy boolean not null,
  source text not null default 'open-meteo',
  fetched_at timestamptz not null default now(),
  unique (restaurant_id, observed_date)
);

create index if not exists idx_weather_cache_restaurant_date on weather_cache(restaurant_id, observed_date);

alter table weather_cache enable row level security;

create policy tenant_isolation_weather_cache on weather_cache
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
