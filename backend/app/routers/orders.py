"""Order list + detail for the Operations Dashboard (product.md's screen 06
mockup, previously designed but never wired into the app). Returns only
fields that actually exist in the `orders` table — no fabricated customer
names, line items, or delivery timestamps, since the schema doesn't carry
them.

Eligibility is computed with `compensation_rules.evaluate_order` — the same
deterministic function the compensation sweep uses — rather than a second,
possibly-drifting definition of "eligible" in SQL. This also means an
order shows as eligible here even before a sweep has run against it (the
sweep is what turns "eligible" into a persisted, claimable row); a `claim`
object is attached when one already exists so the UI can distinguish
"eligible" from "eligible and already claimed."
"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder

from app.auth import require_tenant
from app.db import get_pool
from app.services import compensation_rules

router = APIRouter(prefix="/api/orders", tags=["orders"])

ORDER_COLUMNS = """o.id, o.aggregator_order_id, o.placed_at, o.zone, o.platform, o.status,
                    o.total_amount, o.prep_time_seconds, o.delivery_time_seconds,
                    o.sla_target_seconds, o.is_cancelled, o.cancellation_reason,
                    o.is_refunded, o.refund_amount, o.weather_flag,
                    cc.id as claim_id, cc.status as claim_status, cc.computed_amount as claim_amount"""

BASE_QUERY = f"""
    select {ORDER_COLUMNS}
    from orders o
    left join compensation_claims cc on cc.order_id = o.id and cc.restaurant_id = o.restaurant_id
    where o.restaurant_id = $1
"""


def _serialize(row: dict) -> dict:
    order = {
        "id": str(row["id"]),
        "aggregator_order_id": row["aggregator_order_id"],
        "placed_at": row["placed_at"].isoformat() if row["placed_at"] else None,
        "zone": row["zone"],
        "platform": row["platform"],
        "status": row["status"],
        "total_amount": float(row["total_amount"]) if row["total_amount"] is not None else None,
        "prep_time_seconds": row["prep_time_seconds"],
        "delivery_time_seconds": row["delivery_time_seconds"],
        "sla_target_seconds": row["sla_target_seconds"],
        "is_cancelled": row["is_cancelled"],
        "cancellation_reason": row["cancellation_reason"],
        "is_refunded": row["is_refunded"],
        "refund_amount": float(row["refund_amount"]) if row["refund_amount"] is not None else None,
        "weather_flag": row["weather_flag"],
        "claim": None,
    }
    if row["claim_id"] is not None:
        order["claim"] = {
            "id": str(row["claim_id"]),
            "status": row["claim_status"],
            "computed_amount": float(row["claim_amount"]),
        }

    eligibility = compensation_rules.evaluate_order(dict(row))
    order["eligible"] = eligibility.eligible
    order["eligibility_reason"] = eligibility.reason
    order["eligible_amount"] = round(eligibility.amount, 2) if eligibility.amount is not None else None
    return jsonable_encoder(order)


@router.get("")
async def list_orders(
    filter: Literal["all", "cancelled", "eligible"] = "all",
    limit: int = 100,
    q: str | None = Query(None, description="Substring match on the order's platform/aggregator ID — powers the nav order lookup"),
    restaurant_id: str = Depends(require_tenant),
):
    limit = min(limit, 500)
    rid = uuid.UUID(restaurant_id)
    pool = await get_pool()

    query = BASE_QUERY
    args = [rid]
    if filter == "cancelled":
        query += " and o.is_cancelled = true"
    # "eligible" can't be pushed into SQL — eligibility depends on
    # compensation_rules' thresholds (e.g. weather delay > 15 min), not a
    # simple column filter — so cancelled orders are over-fetched (bounded
    # by `limit`) and filtered precisely in Python below.
    elif filter == "eligible":
        query += " and o.is_cancelled = true"
    if q and q.strip():
        args.append(f"%{q.strip()}%")
        query += f" and o.aggregator_order_id ilike ${len(args)}"
    args.append(limit)
    query += f" order by o.placed_at desc limit ${len(args)}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)

    orders = [_serialize(dict(r)) for r in rows]
    if filter == "eligible":
        orders = [o for o in orders if o["eligible"]]
    return orders
