-- Policy Change Impact Simulator (product.md Phase 2 / capabilities pitch).
-- Reuses the compensation eligibility logic, run twice (old policy version's
-- extracted parameters vs. the new one's) over the same historical order
-- window, diffed.

create table if not exists policy_impact_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  old_policy_document_id uuid references policy_documents(id) on delete set null,
  new_policy_document_id uuid not null references policy_documents(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  orders_evaluated int not null,
  orders_eligible_old int not null,
  orders_eligible_new int not null,
  total_amount_old numeric(10,2) not null,
  total_amount_new numeric(10,2) not null,
  financial_delta numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_policy_impact_restaurant on policy_impact_reports(restaurant_id, created_at desc);

alter table policy_impact_reports enable row level security;
create policy tenant_isolation_policy_impact on policy_impact_reports
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
