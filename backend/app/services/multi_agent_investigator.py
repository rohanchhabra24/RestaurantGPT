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
from datetime import datetime, timezone
from dataclasses import dataclass, field

from app.config import settings
from app.db import get_pool
from app.services import weather_service
from app.services.retrieval_engine import hybrid_search

# Bounds how many distinct order dates get an external weather lookup per
# investigation — worst_orders below is already limited to 5 rows, so this
# is a belt-and-suspenders cap, not the primary control. The primary
# control is architectural: this whole module is only ever invoked from
# the DIAGNOSTIC route (pipeline.py) and the manual anomaly scan
# (anomaly_scan.py), never from a plain SQL/RETRIEVAL/HYBRID question — a
# restaurant asking "how many orders yesterday" never triggers an external
# API call at all.
MAX_WEATHER_LOOKUPS = 5

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


def _clean_zone(zone: str | None) -> str:
    if not zone:
        return "All Zones"
    z = str(zone).strip()
    return z if z.lower().startswith("zone") else f"Zone {z}"


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
    weather_evidence: list[dict] = field(default_factory=list)
    steps_summary_text: str = ""


async def _pick_target_zone(conn, rid, given_zone: str | None, ref_time: datetime) -> str | None:
    if given_zone:
        matched = await conn.fetchval(
            "select zone from orders where restaurant_id = $1 and (zone = $2 or zone ilike $3) limit 1",
            rid, given_zone, f"%{given_zone}%",
        )
        return matched or given_zone
    rows = await conn.fetch(
        f"""select zone,
                   avg(delivery_time_seconds) filter (
                     where placed_at >= $2::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at <= $2::timestamptz
                   ) as recent_avg,
                   avg(delivery_time_seconds) filter (
                     where placed_at < $2::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= $2::timestamptz - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_avg
            from orders
            where restaurant_id = $1 and delivery_time_seconds is not null
            group by zone""",
        rid, ref_time,
    )
    worst_zone, worst_delta = None, -1.0
    for r in rows:
        if r["recent_avg"] and r["baseline_avg"] and r["baseline_avg"] > 0:
            delta = (r["recent_avg"] - r["baseline_avg"]) / r["baseline_avg"]
            if delta > worst_delta:
                worst_delta, worst_zone = delta, r["zone"]
    if not worst_zone:
        worst_zone = await conn.fetchval(
            "select zone from orders where restaurant_id = $1 and zone is not null group by zone order by count(*) desc limit 1",
            rid,
        )
    return worst_zone


async def _investigate_weather(restaurant_id: str, worst_orders: list[dict]) -> tuple[list[dict], InvestigationStep]:
    """Independently checks real historical weather for the specific dates
    the worst-delayed orders happened on.
    """
    coords = await weather_service.get_coordinates(restaurant_id)
    if coords is None:
        return [], InvestigationStep(
            "Live Weather Verification",
            "No restaurant city configured — independent weather verification skipped. "
            "(Platform weather tags remain recorded in order data).",
        )

    dates = sorted({o["placed_at"].date() for o in worst_orders if o.get("placed_at")})[:MAX_WEATHER_LOOKUPS]
    if not dates:
        return [], InvestigationStep(
            "Live Weather Verification",
            "No sample orders in this window to cross-reference with historical weather logs.",
        )

    evidence: list[dict] = []
    unavailable = 0
    for d in dates:
        w = await weather_service.get_historical_weather(restaurant_id, d)
        if w is None:
            unavailable += 1
            continue
        evidence.append(w)

    if not evidence:
        return [], InvestigationStep(
            "Live Weather Verification",
            f"Weather data unavailable for all {len(dates)} date(s) checked (service response pending).",
        )

    rainy = [w for w in evidence if w.get("is_rainy")]
    summary = ", ".join(f"{w['date']} ({w['condition']})" for w in evidence)
    unavailable_note = f" ({unavailable} date(s) unavailable)" if unavailable else ""
    step = InvestigationStep(
        "Live Weather Verification",
        f"Verified local weather for {len(evidence)} sample order date(s){unavailable_note}: {summary}. "
        f"{len(rainy)} of {len(evidence)} showed rain.",
    )
    return evidence, step


async def investigate(question: str, restaurant_id: str, slots: dict) -> InvestigationResult:
    rid = uuid.UUID(restaurant_id)
    pool = await get_pool()
    result = InvestigationResult(target_zone=None, recent_avg_delivery_s=None,
                                  baseline_avg_delivery_s=None, delta_pct=None, likely_driver=None)

    async with pool.acquire() as conn:
        now_utc = datetime.now(timezone.utc)
        ref_time = now_utc
        # Anchoring "now" to the dataset's latest activity instead of the
        # real clock is demo furniture — it exists so the one designated
        # demo restaurant's trend/weather analysis keeps reasoning about
        # its own fixed-date seed data as if it were current, the same
        # reasoning as live_feed_sync.py's _is_demo_restaurant guard.
        # Applied to every restaurant, a real tenant with a genuinely
        # quiet recent window (a slow week, a new signup) would have
        # Chat's diagnostics silently reason about a stale window as if
        # it were "recent", with nothing in the answer saying so.
        if restaurant_id == settings.demo_restaurant_id:
            latest_order_time = await conn.fetchval(
                "select max(placed_at) from orders where restaurant_id = $1",
                rid,
            )
            if latest_order_time and (now_utc - latest_order_time).total_seconds() > 2 * 86400:
                ref_time = latest_order_time

        zone = await _pick_target_zone(conn, rid, slots.get("zone"), ref_time)
        result.target_zone = zone
        zone_label = _clean_zone(zone)

        trend = await conn.fetchrow(
            f"""select
                   avg(delivery_time_seconds) filter (
                     where placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at <= $3::timestamptz
                   ) as recent_avg,
                   count(*) filter (
                     where placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at <= $3::timestamptz
                   ) as recent_n,
                   avg(delivery_time_seconds) filter (
                     where placed_at < $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_avg,
                   count(*) filter (
                     where placed_at < $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_n
                from orders
                where restaurant_id = $1 and zone = $2 and delivery_time_seconds is not null""",
            rid, zone, ref_time,
        )

        result.recent_avg_delivery_s = float(trend["recent_avg"]) if trend and trend["recent_avg"] else None
        result.baseline_avg_delivery_s = float(trend["baseline_avg"]) if trend and trend["baseline_avg"] else None
        recent_n = (trend and trend["recent_n"]) or 0
        baseline_n = (trend and trend["baseline_n"]) or 0

        # If baseline is empty in the tight 5-day window, fall back to overall historical baseline
        if not result.baseline_avg_delivery_s:
            overall_baseline = await conn.fetchrow(
                """select avg(delivery_time_seconds) as b_avg, count(*) as b_n
                   from orders
                   where restaurant_id = $1 and zone = $2 and delivery_time_seconds is not null""",
                rid, zone,
            )
            if overall_baseline and overall_baseline["b_avg"]:
                result.baseline_avg_delivery_s = float(overall_baseline["b_avg"])
                baseline_n = overall_baseline["b_n"] or 0

        if result.recent_avg_delivery_s and result.baseline_avg_delivery_s:
            result.delta_pct = round(
                (result.recent_avg_delivery_s - result.baseline_avg_delivery_s) / result.baseline_avg_delivery_s * 100, 1
            )

        if result.recent_avg_delivery_s and result.baseline_avg_delivery_s:
            recent_min = round(result.recent_avg_delivery_s / 60, 1)
            base_min = round(result.baseline_avg_delivery_s / 60, 1)
            direction = "slower" if (result.delta_pct or 0) > 0 else "faster"
            trend_desc = (
                f"{zone_label} delivery times averaged {recent_min} mins across {recent_n} recent orders "
                f"— {abs(result.delta_pct or 0)}% {direction} than the {base_min} min baseline ({baseline_n} historical orders)."
            )
        elif result.recent_avg_delivery_s:
            recent_min = round(result.recent_avg_delivery_s / 60, 1)
            trend_desc = f"{zone_label} delivery times averaged {recent_min} mins across {recent_n} recent orders."
        elif result.baseline_avg_delivery_s:
            base_min = round(result.baseline_avg_delivery_s / 60, 1)
            trend_desc = (
                f"No completed deliveries recorded in {zone_label} in the immediate recent window. "
                f"Historical baseline is {base_min} mins ({baseline_n} orders)."
            )
        else:
            trend_desc = f"Insufficient delivery duration records available for {zone_label}."

        result.steps.append(InvestigationStep("Delivery Trend Analysis", trend_desc))

        worst_orders = await conn.fetch(
            f"""select {ORDER_COLUMNS} from orders
                where restaurant_id = $1 and zone = $2
                  and placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                  and placed_at <= $3::timestamptz
                  and delivery_time_seconds is not null
                order by delivery_time_seconds desc limit 5""",
            rid, zone, ref_time,
        )
        if not worst_orders:
            # Fallback to slowest orders in this zone overall
            worst_orders = await conn.fetch(
                f"""select {ORDER_COLUMNS} from orders
                    where restaurant_id = $1 and zone = $2
                      and delivery_time_seconds is not null
                    order by delivery_time_seconds desc limit 5""",
                rid, zone,
            )
        result.order_evidence = [dict(r) for r in worst_orders]

        reason_counts = await conn.fetch(
            f"""select cancellation_reason, count(*) as n
                from orders
                where restaurant_id = $1 and zone = $2 and is_cancelled = true
                  and placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                  and placed_at <= $3::timestamptz
                group by cancellation_reason order by n desc""",
            rid, zone, ref_time,
        )
        weather_rate = await conn.fetchrow(
            f"""select
                   avg(weather_flag::int) filter (
                     where placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at <= $3::timestamptz
                   ) as recent_rate,
                   avg(weather_flag::int) filter (
                     where placed_at < $3::timestamptz - interval '{RECENT_WINDOW_DAYS} days'
                       and placed_at >= $3::timestamptz - interval '{RECENT_WINDOW_DAYS + BASELINE_WINDOW_DAYS} days'
                   ) as baseline_rate
                from orders where restaurant_id = $1 and zone = $2""",
            rid, zone, ref_time,
        )

    top_reason = reason_counts[0]["cancellation_reason"] if reason_counts else None
    result.likely_driver = top_reason
    recent_wr = float(weather_rate["recent_rate"] or 0) * 100 if weather_rate else 0.0
    baseline_wr = float(weather_rate["baseline_rate"] or 0) * 100 if weather_rate else 0.0

    friendly_driver_names = {
        "weather_delay": "Severe weather disruption",
        "courier_no_show": "Courier dispatch / driver shortages",
        "restaurant_closed_early": "Kitchen delays / early closing",
        "customer_cancelled": "Customer cancellations",
    }
    driver_label = friendly_driver_names.get(
        top_reason,
        top_reason.replace("_", " ").title() if top_reason else "No dominant cancellation cause"
    )

    reasons_text = (
        ", ".join(f"{r['n']} {r['cancellation_reason'].replace('_', ' ')}" for r in reason_counts)
        if reason_counts
        else "none"
    )

    result.steps.append(InvestigationStep(
        "Operational Correlations",
        f"Weather-flagged rate: {recent_wr:.0f}% (vs {baseline_wr:.0f}% baseline). "
        f"Cancellations: {reasons_text}. Primary operational driver: {driver_label}.",
    ))

    result.weather_evidence, weather_step = await _investigate_weather(restaurant_id, result.order_evidence)
    result.steps.append(weather_step)

    search_query = DRIVER_SEARCH_QUERY.get(top_reason, DRIVER_SEARCH_QUERY[None])
    result.chunks = await hybrid_search(search_query, restaurant_id, top_k=2)
    result.steps.append(InvestigationStep(
        "Platform Policy Review",
        f"Reviewed SLA and compensation guidelines for \"{search_query}\" — {len(result.chunks)} relevant section(s) found.",
    ))

    result.steps_summary_text = "\n".join(f"• {s.agent}: {s.description}" for s in result.steps)
    return result
