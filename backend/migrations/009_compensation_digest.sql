-- Stage 2D: proactive compensation digest — a once-a-day summary of newly
-- eligible compensation surfaced automatically instead of requiring the
-- operator to click "Check for recoverable compensation" themselves.
--
-- Deliberately still no scheduled worker/queue (see compensation.py's own
-- note on why): the digest is computed lazily, at most once per
-- (restaurant, day), the first time anything asks for it — same mechanism
-- as the sweep, just triggered by the operator opening the Dashboard
-- instead of a button click.

create table if not exists compensation_digests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  digest_date date not null,
  new_claims_count int not null default 0,
  new_recoverable_amount numeric(10,2) not null default 0,
  claim_ids uuid[] not null default '{}',
  status text not null default 'new' check (status in ('new','viewed','dismissed')),
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  unique (restaurant_id, digest_date)
);

create index if not exists idx_compensation_digests_restaurant
  on compensation_digests(restaurant_id, digest_date desc);

alter table compensation_digests enable row level security;
create policy tenant_isolation_compensation_digests on compensation_digests
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
