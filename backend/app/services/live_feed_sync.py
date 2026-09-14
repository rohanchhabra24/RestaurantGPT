"""Live Feed — the daily pull-based data source. Same "no real scheduler"
philosophy as compensation_digest.py and the compensation sweep: computed
lazily, at most once per (restaurant, day), the first time anything asks
for it — not on an in-process timer. Two things can ask for it: whoever
opens the Dashboard that day (routers/ingest.py's sync-on-demand endpoint,
matching the digest's own trigger pattern), or a real scheduled job hitting
sync_all() once a day if one is configured (see docs/live-feed-data-source.md
for the GitHub Actions cron example) — either way this function is what
actually does the work, and it's safe to call more than once a day: it's a
no-op once today's row already shows yesterday as synced.

Yesterday is computed in UTC, not the restaurant's own timezone — same
simplification compensation_digest.py already makes for the same reason:
correctness here means "each calendar day gets synced once," and a
timezone-precise day boundary isn't worth the added complexity for a
demo data source. Swap to the restaurant's stored timezone if this ever
needs to be exact.
"""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

import asyncpg
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_S = 15.0


def _yesterday() -> date:
    return datetime.now(timezone.utc).date() - timedelta(days=1)


def _default_feed_url() -> str:
    return f"{settings.public_api_base_url}/api/demo-feed/orders"


async def _fetch_orders(feed_url: str, day: date, seed_extra: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S) as client:
        resp = await client.get(feed_url, params={"date": day.isoformat(), "seed": seed_extra})
        resp.raise_for_status()
        body = resp.json()
    orders = body.get("orders", body if isinstance(body, list) else [])
    return orders


async def sync_yesterday(pool: asyncpg.Pool, restaurant_id: str) -> dict:
    rid = uuid.UUID(restaurant_id)
    yesterday = _yesterday()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select live_feed_url, live_feed_last_synced_date from restaurants where id = $1", rid,
        )
    if row is None:
        return {"synced": False, "reason": "restaurant not found"}
    if row["live_feed_last_synced_date"] == yesterday:
        return {"synced": False, "reason": "already synced", "date": yesterday.isoformat(), "new_orders": 0}

    feed_url = row["live_feed_url"] or _default_feed_url()
    is_default = not row["live_feed_url"]

    try:
        orders = await _fetch_orders(feed_url, yesterday, seed_extra=restaurant_id if is_default else "")
    except Exception as e:
        logger.exception("live feed fetch failed for restaurant %s", restaurant_id)
        return {"synced": False, "reason": f"fetch failed: {e}", "feed_url": feed_url}

    inserted = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            for order in orders:
                status = order.get("status", "delivered")
                result = await conn.execute(
                    """insert into orders
                       (restaurant_id, aggregator_order_id, placed_at, zone, platform, status,
                        total_amount, prep_time_seconds, delivery_time_seconds, is_cancelled,
                        cancellation_reason, weather_flag, source)
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'live_feed')
                       on conflict (restaurant_id, aggregator_order_id) do nothing""",
                    rid,
                    str(order["order_id"]),
                    datetime.fromisoformat(order["placed_at"]),
                    order.get("zone") or "unknown",
                    order.get("platform") or "unknown",
                    status,
                    order.get("total_amount"),
                    order.get("prep_time_seconds"),
                    order.get("delivery_time_seconds"),
                    status == "cancelled",
                    order.get("cancellation_reason"),
                    bool(order.get("weather_flag")),
                )
                if result == "INSERT 0 1":
                    inserted += 1

            await conn.execute(
                "update restaurants set live_feed_last_synced_date = $1 where id = $2", yesterday, rid,
            )

    return {
        "synced": True,
        "date": yesterday.isoformat(),
        "candidates": len(orders),
        "new_orders": inserted,
        "feed_url": feed_url,
        "used_default_feed": is_default,
    }


async def sync_all(pool: asyncpg.Pool) -> dict:
    """Used by the cron-secret-gated bulk endpoint — syncs every restaurant
    that hasn't already been synced for yesterday. Restaurants with no
    live_feed_url configured still get synced against the built-in demo
    feed (see _default_feed_url) rather than being skipped, so the "every
    morning, automatically" behavior works out of the box for every
    signup, not just ones who went and configured a feed URL.
    """
    async with pool.acquire() as conn:
        restaurant_ids = [str(r["id"]) for r in await conn.fetch("select id from restaurants")]

    results = {}
    for rid in restaurant_ids:
        results[rid] = await sync_yesterday(pool, rid)
    return {"restaurants_processed": len(restaurant_ids), "results": results}
