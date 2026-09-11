-- Phase 3: multi-agent diagnostic route + the anomaly-to-root-cause
-- investigator that runs it proactively (product.md Phase 3).

alter table query_traces add column if not exists investigation_steps jsonb not null default '[]'::jsonb;

create table if not exists diagnosis_cards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  zone text not null,
  metric text not null,
  recent_value numeric,
  baseline_value numeric,
  delta_pct numeric,
  likely_driver text,
  narrative text not null,
  citations jsonb not null default '[]'::jsonb,
  query_trace_id uuid references query_traces(id),
  status text not null default 'new' check (status in ('new', 'reviewed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_diagnosis_cards_restaurant on diagnosis_cards(restaurant_id, created_at desc);

alter table diagnosis_cards enable row level security;
create policy tenant_isolation_diagnosis_cards on diagnosis_cards
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
