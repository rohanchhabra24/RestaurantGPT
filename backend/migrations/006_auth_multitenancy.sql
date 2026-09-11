-- Real multi-tenancy: every restaurant now belongs to one or more
-- Supabase Auth users, and a custom access token hook injects
-- `restaurant_id` into each user's JWT at sign-in — the same claim shape
-- the RLS policies from 001_init.sql were already written against.
--
-- MANUAL STEP REQUIRED (cannot be done from a migration file): after
-- running this, go to Supabase Dashboard -> Authentication -> Hooks ->
-- "Customize Access Token (JWT) Claims" and select
-- public.custom_access_token_hook as the hook function. Until that's
-- enabled, tokens won't carry restaurant_id and every authenticated
-- request will 403 as "onboarding not complete" even for users who have
-- a restaurant.

create table if not exists restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create index if not exists idx_restaurant_members_user on restaurant_members(user_id);

alter table restaurant_members enable row level security;
create policy self_membership on restaurant_members
  using (user_id = auth.uid());

-- One user -> one restaurant for now (first match wins if that ever
-- changes); a user with no restaurant yet gets a token with no
-- restaurant_id claim, which the backend's onboarding check reads as
-- "needs to create a restaurant."
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  rid uuid;
begin
  select restaurant_id into rid
  from public.restaurant_members
  where user_id = (event ->> 'user_id')::uuid
  order by created_at asc
  limit 1;

  claims := event -> 'claims';
  if rid is not null then
    claims := jsonb_set(claims, '{restaurant_id}', to_jsonb(rid::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- ── Real usage tracking (per product.md's cost-minimization plan) ───────

alter table query_traces add column if not exists input_tokens int;
alter table query_traces add column if not exists output_tokens int;
alter table query_traces add column if not exists estimated_cost_usd numeric(10,6);

-- ── Rate limiting ─────────────────────────────────────────────────────
-- A plain request-log + COUNT() window rather than a bucketed counter
-- table or Redis — consistent with the semantic cache's "one fewer
-- moving part" call, and fine at this scale.

create table if not exists api_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  route text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_requests_rate_limit on api_requests(restaurant_id, created_at desc);

alter table api_requests enable row level security;
create policy tenant_isolation_api_requests on api_requests
  using (restaurant_id::text = auth.jwt() ->> 'restaurant_id');
