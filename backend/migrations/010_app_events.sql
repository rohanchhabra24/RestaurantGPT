-- Cross-cutting: lightweight engagement instrumentation. Before this,
-- the only signal this app persisted about usage was query_traces (every
-- AI pipeline call) — there was no way to answer "do new operators click
-- a starter prompt or type their own question", "does anyone ever switch
-- Answer language away from English", or "does the compensation digest
-- actually get looked at". One generic event log covers all three rather
-- than three bespoke tables, so cross-feature analysis is one query away
-- instead of a join across differently-shaped schemas.

create table if not exists app_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid,
  event_type text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_events_restaurant on app_events(restaurant_id, event_type, created_at desc);

alter table app_events enable row level security;
create policy tenant_isolation_app_events on app_events
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
