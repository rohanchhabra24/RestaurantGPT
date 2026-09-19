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

import ipaddress
import logging
import socket
import uuid
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

import asyncpg
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_S = 15.0


class UnsafeFeedURLError(Exception):
    """Raised when a tenant-supplied live_feed_url isn't safe for this
    server to fetch — see validate_feed_url."""


def _yesterday() -> date:
    return datetime.now(timezone.utc).date() - timedelta(days=1)


def _default_feed_url() -> str:
    return f"{settings.public_api_base_url}/api/demo-feed/orders"


def validate_feed_url(url: str) -> None:
    """Guards against SSRF through a tenant-configurable URL this server
    fetches on their behalf (a daily cron, unattended): without this, a
    tenant could point live_feed_url at the cloud metadata endpoint
    (169.254.169.254), a private-network service, or localhost, and use
    the sync's own success/failure/error-shape as an oracle into
    infrastructure the public internet can't otherwise reach. Only
    applied to a tenant-supplied URL — the built-in default feed URL
    (this server's own /api/demo-feed/orders, from public_api_base_url)
    is trusted app config, not attacker input, and forcing https on it
    would break plain-http local dev for no security benefit.

    This resolves the hostname once, up front, and rejects it if it maps
    to a non-public address — it does not pin the connection to that
    resolved IP, so a host that changes its DNS answer between this check
    and the actual request (DNS rebinding) is a known residual risk this
    doesn't close. Closing that fully needs IP-pinned requests or an
    egress proxy allowlist; not worth the added complexity unless this
    endpoint becomes a higher-value target than it is today.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise UnsafeFeedURLError("Live feed URL must use https")
    hostname = parsed.hostname
    if not hostname:
        raise UnsafeFeedURLError("Live feed URL is missing a host")
    try:
        addrinfo = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise UnsafeFeedURLError("Live feed URL host could not be resolved") from None
    for family, _, _, _, sockaddr in addrinfo:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise UnsafeFeedURLError("Live feed URL resolves to a non-public address")


async def _fetch_orders(feed_url: str, day: date, seed_extra: str, *, is_default: bool) -> list[dict]:
    if not is_default:
        # Defense in depth: re-validated on every fetch, not just when the
        # tenant sets the URL — a URL saved before this check existed, or
        # one whose DNS answer has since moved, is still guarded going
        # forward rather than grandfathered in as trusted.
        validate_feed_url(feed_url)
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S) as client:
        resp = await client.get(feed_url, params={"date": day.isoformat(), "seed": seed_extra})
        resp.raise_for_status()
        body = resp.json()
    orders = body.get("orders", body if isinstance(body, list) else [])
    return orders


async def _insert_orders(conn: asyncpg.Connection, rid: uuid.UUID, orders: list[dict]) -> int:
    inserted = 0
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
    return inserted


async def sync_yesterday(pool: asyncpg.Pool, restaurant_id: str) -> dict:
    rid = uuid.UUID(restaurant_id)
    yesterday = _yesterday()

    async with pool.acquire() as conn:
        # Fast path: skip opening a transaction/lock at all for the common
        # case (already synced today).
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
            async with conn.transaction():
                # `for update` holds this restaurant's row locked for the
                # rest of the transaction — through the network fetch below,
                # an accepted tradeoff at this app's scale (one sync per
                # restaurant per day). This is the actual fix for a real
                # bug: two concurrent calls (React StrictMode's dev-mode
                # double effect-fire is a common trigger, so is a stray
                # double-click) could both pass the fast-path check above
                # before either committed, both fetch the same
                # deterministic day's orders, and the second one's inserts
                # would all hit ON CONFLICT DO NOTHING — reported back as a
                # confusing "Imported 0 new orders" even though nothing was
                # actually wrong. Locking the row up front makes the second
                # call block here until the first finishes, then see the
                # now-updated last_synced_date and skip cleanly instead of
                # redoing (and silently no-op'ing) the same fetch.
                claim = await conn.fetchrow(
                    "select live_feed_last_synced_date from restaurants where id = $1 for update", rid,
                )
                if claim["live_feed_last_synced_date"] == yesterday:
                    return {"synced": False, "reason": "already synced", "date": yesterday.isoformat(), "new_orders": 0}

                orders = await _fetch_orders(
                    feed_url, yesterday, seed_extra=restaurant_id if is_default else "", is_default=is_default,
                )
                inserted = await _insert_orders(conn, rid, orders)
                await conn.execute(
                    "update restaurants set live_feed_last_synced_date = $1 where id = $2", yesterday, rid,
                )
        except Exception:
            # The real exception (including which specific check failed,
            # for an UnsafeFeedURLError) goes to the server log only — an
            # attacker probing a private/internal URL through this
            # endpoint must not get connection-refused/timeout/DNS-fail
            # distinguishable in the response, or the sync becomes a
            # blind SSRF oracle into whatever this server can reach.
            logger.exception("live feed sync failed for restaurant %s", restaurant_id)
            return {"synced": False, "reason": "sync failed — see server logs", "feed_url": feed_url}

    return {
        "synced": True,
        "date": yesterday.isoformat(),
        "candidates": len(orders),
        "new_orders": inserted,
        "feed_url": feed_url,
        "used_default_feed": is_default,
    }


MAX_BACKFILL_DAYS = 90


async def backfill(pool: asyncpg.Pool, restaurant_id: str, days: int = 30) -> dict:
    """Populate a realistic multi-day history through the exact same feed
    + insert path sync_yesterday uses, instead of waiting one real day at
    a time — this is the actual answer to "how do we get realistic demo
    data flowing through the Live Feed." Loops the past `days` calendar
    days (not including today, since a day still in progress isn't a
    closed day to sync), each insert idempotent via the same
    ON CONFLICT DO NOTHING as the daily sync, so calling this more than
    once — or on top of days already covered by sync_yesterday — just
    fills in whatever's still missing rather than duplicating anything.
    """
    days = max(1, min(days, MAX_BACKFILL_DAYS))
    rid = uuid.UUID(restaurant_id)
    yesterday = _yesterday()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select live_feed_url, live_feed_last_synced_date from restaurants where id = $1", rid,
        )
        if row is None:
            return {"synced": False, "reason": "restaurant not found"}

        feed_url = row["live_feed_url"] or _default_feed_url()
        is_default = not row["live_feed_url"]

        total_new = 0
        per_day = []
        for offset in range(days, 0, -1):
            day = yesterday - timedelta(days=offset - 1)
            try:
                orders = await _fetch_orders(
                    feed_url, day, seed_extra=restaurant_id if is_default else "", is_default=is_default,
                )
                async with conn.transaction():
                    inserted = await _insert_orders(conn, rid, orders)
                total_new += inserted
                per_day.append({"date": day.isoformat(), "new_orders": inserted})
            except Exception:
                # Same reasoning as sync_yesterday: don't echo exception
                # text (including an UnsafeFeedURLError's message) back to
                # the client.
                logger.exception("backfill fetch failed for restaurant %s, date %s", restaurant_id, day)
                per_day.append({"date": day.isoformat(), "error": "fetch failed — see server logs"})

        # The backfill's most recent day is "yesterday" — mark it synced
        # so the regular daily sync doesn't immediately redo it.
        await conn.execute(
            "update restaurants set live_feed_last_synced_date = $1 where id = $2 "
            "and (live_feed_last_synced_date is null or live_feed_last_synced_date < $1)",
            yesterday, rid,
        )

    return {
        "days_requested": days,
        "total_new_orders": total_new,
        "feed_url": feed_url,
        "used_default_feed": is_default,
        "per_day": per_day,
    }


async def sync_all(pool: asyncpg.Pool) -> dict:
    """Used by the cron-secret-gated bulk endpoint — syncs every restaurant
    that has explicitly configured its own live_feed_url. Restaurants
    that haven't are deliberately SKIPPED here, unlike sync_yesterday's
    own default-demo-feed fallback: that fallback exists for a tenant's
    own self-service, opt-in action (clicking sync/backfill on their own
    Dashboard), but this function is what an unattended nightly cron
    calls — once that cron is enabled, defaulting every real signup that
    simply never touched Live Feed settings into getting synthetic demo
    orders written into their live orders table, every night, with no
    way to have opted out, would silently corrupt their real data. A
    restaurant that wants the demo feed can still get it by syncing
    manually themselves.
    """
    async with pool.acquire() as conn:
        restaurant_ids = [
            str(r["id"]) for r in await conn.fetch(
                "select id from restaurants where live_feed_url is not null"
            )
        ]

    results = {}
    for rid in restaurant_ids:
        results[rid] = await sync_yesterday(pool, rid)
    return {"restaurants_processed": len(restaurant_ids), "results": results}
