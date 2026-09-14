-- Live Feed data source: a daily pull from an external order-feed URL
-- (defaults to this backend's own /api/demo-feed/orders — see
-- app/services/live_feed_sync.py — so the mechanism works out of the box;
-- point live_feed_url at a real external feed to replace that default).

alter table restaurants add column if not exists live_feed_url text;
alter table restaurants add column if not exists live_feed_last_synced_date date;

-- Distinguishes an order that arrived via the daily pull from one a human
-- uploaded via a CSV — shown in the Data Sources page so it's clear where
-- each row came from, same reasoning as query_traces distinguishing route
-- taken.
alter table orders add column if not exists source text not null default 'upload' check (source in ('upload', 'live_feed'));

-- Makes a re-run of the daily sync safe to call twice for the same day
-- (insert ... on conflict do nothing) instead of needing fragile
-- check-before-insert application logic. If this fails to apply on an
-- existing database because of pre-existing duplicate
-- (restaurant_id, aggregator_order_id) pairs, de-duplicate those rows
-- first — that would itself be a pre-existing data-quality bug this
-- constraint is surfacing, not something introduced by it.
create unique index if not exists idx_orders_restaurant_aggregator_id
  on orders(restaurant_id, aggregator_order_id);
