-- RestaurantGPT — initial schema (Supabase/Postgres)
-- Run in the Supabase SQL editor, or via `psql $SUPABASE_DB_URL -f migrations/001_init.sql`

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ── Tenancy ──────────────────────────────────────────────────────────────

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aggregator_platform text,
  timezone text not null default 'Asia/Kolkata',
  shares_anonymized_data boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Structured operational data ─────────────────────────────────────────

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  aggregator_order_id text not null,
  placed_at timestamptz not null,
  zone text not null,
  platform text not null,
  status text not null check (status in ('delivered','cancelled','in_progress')),
  total_amount numeric(10,2),
  prep_time_seconds int,
  delivery_time_seconds int,
  sla_target_seconds int not null default 2400,
  is_cancelled boolean not null default false,
  cancellation_reason text,
  is_refunded boolean not null default false,
  refund_amount numeric(10,2),
  weather_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_restaurant on orders(restaurant_id);
create index if not exists idx_orders_placed_at on orders(restaurant_id, placed_at);
create index if not exists idx_orders_zone on orders(restaurant_id, zone);
create index if not exists idx_orders_cancelled on orders(restaurant_id, is_cancelled);

-- ── Unstructured policy documents (hybrid retrieval side) ───────────────

create table if not exists policy_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  source_name text not null,
  doc_type text not null check (doc_type in ('sla','compensation','other')),
  effective_date date not null,
  expiry_date date,
  version int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists policy_chunks (
  id uuid primary key default gen_random_uuid(),
  policy_document_id uuid not null references policy_documents(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null,
  section_label text,
  -- all-MiniLM-L6-v2 produces 384-dim embeddings; swap dimension if you change models
  embedding vector(384),
  fts tsvector generated always as (to_tsvector('english', chunk_text)) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_policy_chunks_embedding on policy_chunks
  using hnsw (embedding vector_cosine_ops);
create index if not exists idx_policy_chunks_fts on policy_chunks using gin(fts);
create index if not exists idx_policy_chunks_restaurant on policy_chunks(restaurant_id);

-- ── Conversation state ───────────────────────────────────────────────────

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Audit trail (this is what makes "zero-hallucination" checkable) ─────

create table if not exists query_traces (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  question text not null,
  route_taken text not null,
  generated_sql text,
  sql_result_row_count int,
  retrieved_chunk_ids uuid[] default '{}',
  claimed_citations jsonb not null default '[]'::jsonb,
  grounding_verdict text not null check (grounding_verdict in ('grounded','ungrounded','partial','no_claims')),
  citation_coverage numeric(4,3),
  latency_ms_by_stage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_traces_restaurant on query_traces(restaurant_id, created_at desc);

-- ── Differentiated capability: compensation recovery ─────────────────────

create table if not exists compensation_claims (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  policy_chunk_id uuid references policy_chunks(id),
  computed_amount numeric(10,2) not null,
  status text not null default 'drafted' check (status in ('drafted','submitted','resolved')),
  query_trace_id uuid references query_traces(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ── Row-level security ────────────────────────────────────────────────────
-- Policies are keyed to a `restaurant_id` claim on the caller's JWT. The
-- backend currently talks to Supabase with the service-role key (which
-- bypasses RLS) and enforces tenant scoping in application code — these
-- policies are the enforcement point for when Supabase Auth issues
-- restaurant-scoped JWTs to end users directly (see product.md §2.6).

alter table orders enable row level security;
alter table policy_documents enable row level security;
alter table policy_chunks enable row level security;
alter table conversations enable row level security;
alter table query_traces enable row level security;
alter table compensation_claims enable row level security;

create policy tenant_isolation_orders on orders
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
create policy tenant_isolation_policy_documents on policy_documents
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
create policy tenant_isolation_policy_chunks on policy_chunks
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
create policy tenant_isolation_conversations on conversations
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
create policy tenant_isolation_traces on query_traces
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
create policy tenant_isolation_claims on compensation_claims
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
