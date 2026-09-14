"""A synthetic 'aggregator platform' data feed — a real, independently
fetchable API endpoint that live_feed_sync.py pulls from by default, so
the Live Feed integration is demoable end-to-end without anyone having to
stand up a separate hosted service first. The exact same "fetch orders
from a URL" code path works unmodified if live_feed_url is later pointed
at a genuinely external service instead — nothing here is special-cased
for being the default.

Unauthenticated by design: it isn't tenant data (it's synthetic, the same
for every caller on a given date+seed), so there's nothing to protect —
same as a real aggregator's public order-export endpoint would be
reachable with just an API key, which isn't needed here since there's no
tenant-specific secret being guarded.
"""

from datetime import date as date_cls, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from app.services.demo_order_generator import generate_day

router = APIRouter(prefix="/api/demo-feed", tags=["demo-feed"])


@router.get("/orders")
async def get_orders(
    date: str = Query(..., description="ISO date (YYYY-MM-DD) to fetch orders for"),
    seed: str = Query("", description="Optional — varies the output for the same date, e.g. per source/restaurant"),
):
    try:
        day = date_cls.fromisoformat(date)
    except ValueError:
        raise HTTPException(400, "date must be an ISO date, e.g. 2026-01-15")

    today = datetime.now(timezone.utc).date()
    if day > today:
        raise HTTPException(400, "date can't be in the future")
    if day < today - timedelta(days=365 * 2):
        raise HTTPException(400, "date is too far in the past for this demo feed")

    orders = generate_day(day, seed_extra=seed)
    return {"date": day.isoformat(), "orders": orders}
