"""Observability dashboard aggregates (product.md Phase 4). Every number
here comes straight out of query_traces — the same audit trail every route
has been writing to since Phase 1 — plus response_cache for hit rate.
Nothing here is synthetic; a fresh install just shows zeros until real
queries accumulate.
"""

import uuid

from fastapi import APIRouter, Depends

from app.auth import require_tenant
from app.db import get_pool
from app.services import usage_tracking

router = APIRouter(prefix="/api/insights", tags=["insights"])

WINDOW_DAYS = 30
TREND_DAYS = 14


@router.get("/summary")
async def summary(restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)

    async with pool.acquire() as conn:
        totals = await conn.fetchrow(
            f"""select count(*) as total,
                       count(*) filter (where served_from_cache) as cache_hits,
                       count(*) filter (where grounding_verdict in ('grounded', 'no_claims')) as grounded_or_no_claims,
                       count(*) filter (where grounding_verdict = 'ungrounded') as ungrounded
                from query_traces
                where restaurant_id = $1 and created_at >= now() - interval '{WINDOW_DAYS} days'""",
            rid,
        )

        route_rows = await conn.fetch(
            f"""select route_taken, count(*) as n from query_traces
                where restaurant_id = $1 and created_at >= now() - interval '{WINDOW_DAYS} days'
                group by route_taken order by n desc""",
            rid,
        )

        stage_rows = await conn.fetch(
            f"""select kv.stage, avg(kv.ms::numeric) as avg_ms
                from query_traces
                cross join lateral jsonb_each_text(latency_ms_by_stage) as kv(stage, ms)
                where restaurant_id = $1 and created_at >= now() - interval '{WINDOW_DAYS} days'
                group by kv.stage order by avg_ms desc""",
            rid,
        )

        trend_rows = await conn.fetch(
            f"""select date_trunc('day', created_at) as day,
                       count(*) as total,
                       count(*) filter (where grounding_verdict in ('grounded', 'no_claims')) as grounded
                from query_traces
                where restaurant_id = $1 and created_at >= now() - interval '{TREND_DAYS} days'
                group by day order by day""",
            rid,
        )

    total = totals["total"] or 0
    cost_alert = await usage_tracking.check_cost_alert(restaurant_id)
    return {
        "window_days": WINDOW_DAYS,
        "cost": cost_alert,
        "total_queries": total,
        "cache_hit_rate": round(totals["cache_hits"] / total, 3) if total else 0.0,
        "grounded_rate": round(totals["grounded_or_no_claims"] / total, 3) if total else 0.0,
        "ungrounded_count": totals["ungrounded"],
        "route_distribution": [{"route": r["route_taken"], "count": r["n"]} for r in route_rows],
        "avg_latency_by_stage": [{"stage": r["stage"], "avg_ms": round(float(r["avg_ms"]), 1)} for r in stage_rows],
        "groundedness_trend": [
            {
                "date": r["day"].date().isoformat(),
                "total": r["total"],
                "grounded": r["grounded"],
                "pct": round(r["grounded"] / r["total"] * 100, 1) if r["total"] else None,
            }
            for r in trend_rows
        ],
    }


OPERATIONS_TREND_DAYS = 7


@router.get("/operations")
async def operations(restaurant_id: str = Depends(require_tenant)):
    """Order-level operational KPIs for the Dashboard page — deliberately
    separate from /summary, which is about the AI pipeline's own behavior
    (query_traces), not the restaurant's actual order data. Keeping them
    apart avoids one endpoint answering two unrelated questions."""
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)

    async with pool.acquire() as conn:
        today = await conn.fetchrow(
            """select count(*) as orders_today,
                      count(*) filter (
                        where delivery_time_seconds is not null and sla_target_seconds is not null
                          and delivery_time_seconds > sla_target_seconds
                      ) as sla_breaches_today
               from orders
               where restaurant_id = $1 and placed_at >= date_trunc('day', now())""",
            rid,
        )
        trend = await conn.fetchrow(
            f"""select count(*) as total,
                       count(*) filter (where is_cancelled) as cancelled,
                       avg(delivery_time_seconds - sla_target_seconds) filter (
                         where delivery_time_seconds is not null and sla_target_seconds is not null
                       ) as avg_delay_seconds
                from orders
                where restaurant_id = $1 and placed_at >= now() - interval '{OPERATIONS_TREND_DAYS} days'""",
            rid,
        )
        # Sum of every drafted/submitted/resolved claim — "identified", not
        # "recovered": nothing in this build confirms a claim was actually
        # paid out, so the KPI is worded to match what's actually verified.
        compensation_identified = await conn.fetchval(
            "select coalesce(sum(computed_amount), 0) from compensation_claims where restaurant_id = $1",
            rid,
        )

    trend_total = trend["total"] or 0
    return {
        "window_days": OPERATIONS_TREND_DAYS,
        "orders_today": today["orders_today"],
        "sla_breaches_today": today["sla_breaches_today"],
        "avg_delivery_delay_seconds": round(float(trend["avg_delay_seconds"]), 0) if trend["avg_delay_seconds"] is not None else None,
        "cancellation_rate_pct": round(trend["cancelled"] / trend_total * 100, 1) if trend_total else 0.0,
        "compensation_identified_total": float(compensation_identified),
    }
