-- Human quality signal to pair with the grounding verdict's machine-computed
-- one (see grounding.py's verify_citations) — a restaurant owner tapping
-- thumbs-down on a "Verified" answer is exactly the discrepancy a trust
-- product needs to surface, not just the accuracy number alone.
--
-- One rating per query_trace (not per message) since query_traces is what
-- everything else — route, grounding verdict, latency, cost — already
-- joins against; a unique constraint + upsert lets an owner change their
-- mind rather than stacking duplicate rows.

create table if not exists message_feedback (
  id uuid primary key default gen_random_uuid(),
  query_trace_id uuid not null references query_traces(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (query_trace_id)
);

create index if not exists idx_message_feedback_restaurant on message_feedback(restaurant_id, created_at desc);

alter table message_feedback enable row level security;

create policy tenant_isolation_message_feedback on message_feedback
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
