-- compensation_sweep.py's dedup was a SELECT ... NOT IN followed by a
-- separate INSERT, with no row lock — two concurrent sweeps (a double
-- click, or a sweep racing the digest's own lazy scan_and_draft_claims
-- call) could both read the same eligible order before either commits,
-- and both insert a claim for it. A unique constraint turns that into a
-- DB-enforced invariant instead of a best-effort read, and the app code
-- switches to `on conflict (restaurant_id, order_id) do nothing` so the
-- loser of the race gets a no-op instead of a duplicate claim.
--
-- Defensive cleanup first: a database that already hit the race before
-- this migration could have real duplicate rows on file. Keep the
-- earliest claim per (restaurant_id, order_id) — the one most likely to
-- already have been reviewed/acted on — and drop any later duplicates
-- before the constraint is added, so this migration can't fail applying
-- to a database that's already seen the bug.
delete from compensation_claims a
using compensation_claims b
where a.restaurant_id = b.restaurant_id
  and a.order_id = b.order_id
  and (a.created_at, a.id) > (b.created_at, b.id);

alter table compensation_claims
  add constraint compensation_claims_restaurant_order_unique unique (restaurant_id, order_id);
