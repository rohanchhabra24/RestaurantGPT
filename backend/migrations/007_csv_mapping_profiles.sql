-- LLM-proposed / operator-confirmed CSV column mappings for the order
-- ingestion Data Mapper. Keyed by a hash of the (normalized) header row so
-- a restaurant's recurring export format only ever needs one LLM call and
-- one operator review — every later upload with the same headers reuses
-- the confirmed row directly. See app/services/data_mapper.py.

create table if not exists csv_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  header_signature text not null,
  sample_headers text[] not null,
  column_mapping jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (restaurant_id, header_signature)
);

create index if not exists idx_csv_mapping_profiles_lookup
  on csv_mapping_profiles (restaurant_id, header_signature, status);

alter table csv_mapping_profiles enable row level security;

create policy tenant_isolation_csv_mapping_profiles on csv_mapping_profiles
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
