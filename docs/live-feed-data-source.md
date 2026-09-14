# Live Feed data source

A daily-pull integration on top of the ingestion pipeline you already
have: instead of a one-off CSV upload, RestaurantGPT fetches yesterday's
orders from a URL every day and inserts them the same way an upload does
(same `orders` table, same `compensation_rules`/grounding pipeline
downstream — nothing about the rest of the app knows or cares whether an
order arrived via upload or via this feed).

## Why this design, not a separately-hosted service

The original ask was "host a script online that acts as a data source and
this app fetches from it every morning." Standing up a *new* always-on
service would need a hosting account with credentials this session
doesn't have and can't create on your behalf — I can write deployable
code and give you exact steps, but I can't click "deploy" on Render or
Railway for you.

So this is built the other way: the **existing backend you already
have** now also serves the synthetic feed itself
(`GET /api/demo-feed/orders?date=YYYY-MM-DD`), and a sync job on that
same backend pulls from it — a real HTTP fetch, not a function call. That
satisfies the actual requirement (a real "custom API endpoint" this app
fetches from, on a schedule) using only infrastructure you already have
to deploy anyway for the rest of the app to work. If you later want a
genuinely separate feed — a real aggregator's export API, or a script you
host elsewhere — nothing changes on the fetch side: paste that URL into
Data Sources → Live Feed → "Change source" and it's used instead, with
zero code changes.

## Pieces

- **`app/services/demo_order_generator.py`** — the synthetic-order logic
  (same distributions `seed/generate_demo_csv.py`'s bulk CSV generator
  uses, factored out so both share one implementation instead of two
  copies that can drift). `generate_day(date, seed_extra)` is
  deterministic: the same date always reproduces the same rows.
- **`app/routers/demo_feed.py`** — `GET /api/demo-feed/orders`. Serves
  one day's synthetic orders as JSON. Unauthenticated (it's not tenant
  data — every caller gets the same synthetic rows for a given date), the
  same way a real aggregator's public order-export endpoint would need
  only an API key, not a login.
- **`app/services/live_feed_sync.py`** — `sync_yesterday(pool, restaurant_id)`
  fetches from `restaurants.live_feed_url` (or the built-in demo feed if
  unset) and inserts new rows, `source='live_feed'`, idempotently (a
  unique index on `(restaurant_id, aggregator_order_id)` — migration 011
  — makes a duplicate fetch a no-op via `ON CONFLICT DO NOTHING`, and
  `restaurants.live_feed_last_synced_date` makes a second call the same
  day a no-op too, without hitting the network again).
- **`POST /api/ingest/live-feed/sync`** — the operator-facing manual
  trigger (Data Sources page). Also called automatically, once, the first
  time anyone opens that page each day — same "lazy, at most once a day"
  pattern the compensation digest (Stage 2D) already established, so
  "every morning" holds true for anyone who opens the app that day without
  needing a real always-on scheduler process inside this app.
- **`POST /api/ingest/live-feed/sync-all`** — what makes it run even on a
  day nobody opens the Dashboard. Gated behind a shared secret
  (`CRON_SYNC_SECRET`) rather than a per-user login, since a scheduler has
  no user session to authenticate as; returns 404 until that secret is
  configured, so it's inert by default rather than an open endpoint.
- **`POST /api/ingest/live-feed/backfill?days=N`** — the "Backfill 30
  days" button (Data Sources page). `sync_yesterday` only ever pulls one
  day, by design — that's what makes it a faithful daily-feed simulation,
  but it also means a brand-new signup starts with an empty Live Feed
  history and would need 30 real days to see a realistic multi-day
  dataset. This calls the exact same fetch-and-insert path once per day
  in a range instead (capped at `MAX_BACKFILL_DAYS = 90`), so a fresh
  restaurant can get a realistic demo history in one click. Idempotent
  the same way — safe to call again, or to call on top of days a real
  daily sync already covered.

## Turning on real unattended automation

The lazy per-day trigger above covers "whenever someone opens the app."
For it to run even on a day nobody does, wire up the included GitHub
Actions workflow:

1. Deploy the backend somewhere reachable over HTTPS (Render, Fly.io,
   Railway, a VPS — whatever you're already using or plan to use for
   the real app; this project doesn't have an opinion on which).
2. Set `PUBLIC_API_BASE_URL` on that deployment to its own public URL
   (used as the default feed URL for restaurants that haven't configured
   a custom one).
3. Set `CRON_SYNC_SECRET` on that deployment to a long random string.
4. In the GitHub repo: Settings → Secrets and variables → Actions —
   add secret `BACKEND_BASE_URL` (the same URL from step 2) and secret
   `CRON_SYNC_SECRET` (the same value from step 3), then add repo
   variable `LIVE_FEED_SYNC_ENABLED` = `true`.
5. `.github/workflows/daily-live-feed-sync.yml` now runs at 03:00 UTC
   daily (and is runnable on demand from the Actions tab via
   "Run workflow") and calls `sync-all` on your deployed backend.

Until steps 1–4 are done, the workflow is skipped every night (its `if:`
condition checks the same `LIVE_FEED_SYNC_ENABLED` variable) rather than
failing — same pattern `ci.yml`'s `eval-golden-set` job already uses for
its own not-yet-configured secrets, so there's nothing to disable if you
don't want this yet.

## "Imported 0 new orders" on a first sync

If a sync reports 0 new orders on what looks like your very first click,
it's not necessarily broken — the same day's data can only ever be
inserted once (each order id is unique per restaurant, so a repeat fetch
of the same day just no-ops the second time). The most common trigger
during local development is React's `StrictMode`, which intentionally
double-fires effects — including the "auto-sync once per day" one on the
Data Sources page — so the *first* of the two fires actually inserts the
orders and the *second* reports zero new ones a moment later. That's
expected, not a bug: `sync_yesterday` locks the restaurant's row for the
duration of a sync specifically so two overlapping calls can't both
attempt the same day's fetch — the second one now cleanly reports
"already synced" once the first commits, rather than quietly reprocessing
the same day and reporting a confusing zero. If you want to see it
actually accumulate more data, use Backfill (above) rather than clicking
Sync repeatedly — Sync is capped at one day by design.

## Trying it locally without any of the above

Nothing above is required to see it work. With the backend running
locally against a real Supabase project:

```bash
curl -X POST http://localhost:8000/api/ingest/live-feed/sync \
  -H "Authorization: Bearer <your access token>"
```

This calls the exact same lazy sync the Data Sources page triggers — it
fetches yesterday's synthetic orders from your own running backend's
`/api/demo-feed/orders` and inserts them, no external URL or GitHub
Actions setup required. The "Sync now" button on the Data Sources page
does the same thing from the UI.
