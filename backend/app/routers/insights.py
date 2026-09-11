"""Observability dashboard aggregates (product.md Phase 4). Every number
here comes straight out of query_traces — the same audit trail every route
has been writing to since Phase 1 — plus response_cache for hit rate.
Nothing here is synthetic; a fresh install just shows zeros until real
queries accumulate.
"""

import uuid

from fastapi import APIRouter

from app.config import settings
from app.db import get_pool

router = APIRouter(prefix="/api/insights", tags=["insights"])

WINDOW_DAYS = 30
TREND_DAYS = 14


@router.get("/summary")
async def summary():
    pool = await get_pool()
    rid = uuid.UUID(settings.demo_restaurant_id)

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
    return {
        "window_days": WINDOW_DAYS,
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
