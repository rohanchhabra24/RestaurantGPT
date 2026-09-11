-- Phase 4: semantic response caching (product.md's "Warmstart" showcase
-- technique). Cached by embedding similarity, not exact string match, and
-- invalidated by a per-restaurant data-version counter rather than a TTL —
-- a stale cached answer about "yesterday's cancellations" is worse than a
-- cache miss, so correctness of invalidation matters more than hit rate.

alter table restaurants add column if not exists data_version int not null default 0;
alter table query_traces add column if not exists served_from_cache boolean not null default false;

create table if not exists response_cache (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  question_text text not null,
  question_embedding vector(384) not null,
  data_version int not null,
  route_taken text not null,
  answer_text text not null,
  citations jsonb not null default '[]'::jsonb,
  data_table jsonb not null default '[]'::jsonb,
  grounding_verdict text not null,
  citation_coverage numeric(4,3),
  hit_count int not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

create index if not exists idx_response_cache_embedding on response_cache
  using hnsw (question_embedding vector_cosine_ops);
create index if not exists idx_response_cache_restaurant on response_cache(restaurant_id, data_version);

alter table response_cache enable row level security;
create policy tenant_isolation_response_cache on response_cache
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
