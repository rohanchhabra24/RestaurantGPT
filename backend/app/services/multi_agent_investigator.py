"""Multi-agent root-cause investigation — the multi-hop technique the
single-shot HYBRID path genuinely cannot do. A question like "why did
delivery time spike in Zone 3" needs three chained lookups where each
step's result decides the shape of the next one, not three independent
queries fired in parallel:

  1. Trend agent    — quantify the spike itself (recent vs. baseline window).
  2. Correlation agent — find what changed alongside it (weather rate,
     cancellation-reason mix) and pick a likely driver from that.
  3. Policy agent    — search for the ONE policy clause relevant to that
     specific driver (a different search query depending on step 2's
     finding — this is the actual branching decision, not fixed sequencing).

The synthesis step still runs through the same grounding verification as
every other route (see pipeline.py) — multi-hop reasoning doesn't get a
pass on citing real evidence.

Steps 1-2 are deterministic, parameterized SQL (not LLM-generated) since
their shape is fixed and known in advance; only step 3's search query
depends on a runtime decision, and only the final synthesis touches an
LLM for prose.
"""

import uuid
from dataclasses import dataclass, field

from app.config import settings
from app.db import get_pool
from app.services.retrieval_engine import hybrid_search

# Configurable via settings (INVESTIGATOR_RECENT_WINDOW_DAYS /
# INVESTIGATOR_BASELINE_WINDOW_DAYS) rather than fixed — anomaly_scan.py
# reads these same two off this module.
RECENT_WINDOW_DAYS = settings.investigator_recent_window_days
BASELINE_WINDOW_DAYS = settings.investigator_baseline_window_days  # the days preceding the recent window

DRIVER_SEARCH_QUERY = {
    "weather_delay": "weather force majeure delay compensation policy",
    "courier_no_show": "courier no-show compensation policy",
    "restaurant_closed_early": "restaurant caused delay compensation policy",
    None: "delivery SLA target policy",
}

ORDER_COLUMNS = """id, aggregator_order_id, platform, zone, status, cancellation_reason,
                   delivery_time_seconds, sla_target_seconds, weather_flag, total_amount, placed_at"""


@dataclass
class InvestigationStep:
    agent: str
    description: str


@dataclass
class InvestigationResult:
    target_zone: str | None
    recent_avg_delivery_s: float | None
    baseline_avg_delivery_s: float | None
    delta_pct: float | None
    likely_driver: str | None
    steps: list[InvestigationStep] = field(default_factory=list)
    order_evidence: list[dict] = field(default_factory=list)
    chunks: list[dict] = field(default_factory=list)
    steps_summary_text: str = ""


async def _pick_target_zone(conn, rid, given_zone: str | None) -> str | None:
    if given_zone:
        return given_zone
    rows = await conn.fetch(
        f"""select zone,
                   avg(delivery_time_seconds) filter (where placed_at >= now() - interval '{RECENT_WINDOW_DAYS} days') as recent_avg,
                   avg(delivery_time_seconds) filter (
                     where placed_at < now() - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= now() - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_avg
            from orders
            where restaurant_id = $1 and delivery_time_seconds is not null
            group by zone""",
        rid,
    )
    worst_zone, worst_delta = None, -1.0
    for r in rows:
        if r["recent_avg"] and r["baseline_avg"] and r["baseline_avg"] > 0:
            delta = (r["recent_avg"] - r["baseline_avg"]) / r["baseline_avg"]
            if delta > worst_delta:
                worst_delta, worst_zone = delta, r["zone"]
    return worst_zone


async def investigate(question: str, restaurant_id: str, slots: dict) -> InvestigationResult:
    rid = uuid.UUID(restaurant_id)
    pool = await get_pool()
    result = InvestigationResult(target_zone=None, recent_avg_delivery_s=None,
                                  baseline_avg_delivery_s=None, delta_pct=None, likely_driver=None)

    async with pool.acquire() as conn:
        zone = await _pick_target_zone(conn, rid, slots.get("zone"))
        result.target_zone = zone

        trend = await conn.fetchrow(
            f"""select
                   avg(delivery_time_seconds) filter (where placed_at >= now() - interval '{RECENT_WINDOW_DAYS} days') as recent_avg,
                   count(*) filter (where placed_at >= now() - interval '{RECENT_WINDOW_DAYS} days') as recent_n,
                   avg(delivery_time_seconds) filter (
                     where placed_at < now() - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= now() - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_avg,
                   count(*) filter (
                     where placed_at < now() - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= now() - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_n
                from orders
                where restaurant_id = $1 and zone = $2 and delivery_time_seconds is not null""",
            rid, zone,
        )
        result.recent_avg_delivery_s = float(trend["recent_avg"]) if trend["recent_avg"] else None
        result.baseline_avg_delivery_s = float(trend["baseline_avg"]) if trend["baseline_avg"] else None
        if result.recent_avg_delivery_s and result.baseline_avg_delivery_s:
            result.delta_pct = round(
                (result.recent_avg_delivery_s - result.baseline_avg_delivery_s) / result.baseline_avg_delivery_s * 100, 1
            )
        result.steps.append(InvestigationStep(
            "trend_agent",
            f"Zone {zone}: recent avg delivery {result.recent_avg_delivery_s and round(result.recent_avg_delivery_s/60,1)}min "
            f"(n={trend['recent_n']}) vs baseline {result.baseline_avg_delivery_s and round(result.baseline_avg_delivery_s/60,1)}min "
            f"(n={trend['baseline_n']}), {result.delta_pct}% change.",
        ))

        worst_orders = await conn.fetch(
            f"""select {ORDER_COLUMNS} from orders
                where restaurant_id = $1 and zone = $2
                  and placed_at >= now() - interval '{RECENT_WINDOW_DAYS} days'
                  and delivery_time_seconds is not null
                order by delivery_time_seconds desc limit 5""",
            rid, zone,
        )
        result.order_evidence = [dict(r) for r in worst_orders]

        reason_counts = await conn.fetch(
            f"""select cancellation_reason, count(*) as n
                from orders
                where restaurant_id = $1 and zone = $2 and is_cancelled = true
                  and placed_at >= now() - interval '{RECENT_WINDOW_DAYS} days'
                group by cancellation_reason order by n desc""",
            rid, zone,
        )
        weather_rate = await conn.fetchrow(
            f"""select
                   avg(weather_flag::int) filter (where placed_at >= now() - interval '{RECENT_WINDOW_DAYS} days') as recent_rate,
                   avg(weather_flag::int) filter (
                     where placed_at < now() - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= now() - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_rate
                from orders where restaurant_id = $1 and zone = $2""",
            rid, zone,
        )

    top_reason = reason_counts[0]["cancellation_reason"] if reason_counts else None
    result.likely_driver = top_reason
    recent_wr = float(weather_rate["recent_rate"] or 0) * 100
    baseline_wr = float(weather_rate["baseline_rate"] or 0) * 100
    reason_breakdown = ", ".join(f"{r['cancellation_reason']}={r['n']}" for r in reason_counts) or "none"
    result.steps.append(InvestigationStep(
        "correlation_agent",
        f"Weather-flagged rate {recent_wr:.0f}% this window vs {baseline_wr:.0f}% baseline. "
        f"Cancellation reasons this window: {reason_breakdown}. "
        f"Likely driver: {top_reason or 'no single dominant cause'}.",
    ))

    search_query = DRIVER_SEARCH_QUERY.get(top_reason, DRIVER_SEARCH_QUERY[None])
    result.chunks = await hybrid_search(search_query, restaurant_id, top_k=2)
    result.steps.append(InvestigationStep(
        "policy_agent",
        f"Searched policy text for: \"{search_query}\" — {len(result.chunks)} relevant section(s) found.",
    ))

    result.steps_summary_text = "\n".join(f"[{s.agent}] {s.description}" for s in result.steps)
    return result
