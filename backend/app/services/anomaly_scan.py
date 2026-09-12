"""Anomaly-to-root-cause investigator — the proactive half of Phase 3.
Instead of waiting for an operator to ask "why did delivery time spike",
this scans every zone for a meaningful deviation and, for each one found,
runs the exact same multi-agent investigation and writes a fully-cited
diagnosis_cards row before anyone asks.

Deliberately a manual-trigger endpoint rather than a scheduled worker/queue
— consistent with every other "proactive" capability in this build
(compensation sweep, policy impact simulator): same mechanism, invoked on
demand instead of on a timer. The threshold check below is a plain
percentage-deviation-with-a-minimum-sample-size rule, not real change-point
detection — documented as the pragmatic version of that technique for this
build's scope, not a claim to statistical rigor it doesn't have.
"""

import json
import uuid

from app.config import settings
from app.db import get_pool
from app.services import grounding, multi_agent_investigator, synthesis

DELTA_THRESHOLD_PCT = settings.anomaly_delta_threshold_pct
MIN_SAMPLE_SIZE = settings.anomaly_min_sample_size


async def _list_zones_with_deviation(restaurant_id: str) -> list[dict]:
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""select zone,
                   avg(delivery_time_seconds) filter (where placed_at >= now() - interval '{multi_agent_investigator.RECENT_WINDOW_DAYS} days') as recent_avg,
                   count(*) filter (where placed_at >= now() - interval '{multi_agent_investigator.RECENT_WINDOW_DAYS} days') as recent_n,
                   avg(delivery_time_seconds) filter (
                     where placed_at < now() - interval '{multi_agent_investigator.RECENT_WINDOW_DAYS} days'
                       and placed_at >= now() - interval '{multi_agent_investigator.RECENT_WINDOW_DAYS + multi_agent_investigator.BASELINE_WINDOW_DAYS} days'
                   ) as baseline_avg
            from orders
            where restaurant_id = $1 and delivery_time_seconds is not null
            group by zone""",
            rid,
        )

    flagged = []
    for r in rows:
        if not r["recent_avg"] or not r["baseline_avg"] or r["recent_n"] < MIN_SAMPLE_SIZE:
            continue
        delta_pct = (r["recent_avg"] - r["baseline_avg"]) / r["baseline_avg"] * 100
        if delta_pct >= DELTA_THRESHOLD_PCT:
            flagged.append({"zone": r["zone"], "delta_pct": round(delta_pct, 1),
                             "recent_avg": float(r["recent_avg"]), "baseline_avg": float(r["baseline_avg"])})
    flagged.sort(key=lambda z: z["delta_pct"], reverse=True)
    return flagged


async def run_scan(restaurant_id: str) -> list[dict]:
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    flagged_zones = await _list_zones_with_deviation(restaurant_id)

    cards = []
    for zone_info in flagged_zones:
        zone = zone_info["zone"]
        question = f"Why did delivery time spike in {zone}?"
        investigation = await multi_agent_investigator.investigate(question, restaurant_id, {"zone": zone})

        raw_answer = await synthesis.synthesize(
            question, investigation.order_evidence, investigation.chunks, investigation.steps_summary_text
        )
        citations, verdict, coverage = grounding.verify_citations(
            raw_answer, investigation.order_evidence, investigation.chunks
        )
        if verdict == "ungrounded":
            continue  # never persist a proactive card that couldn't be verified

        async with pool.acquire() as conn:
            trace_row = await conn.fetchrow(
                """insert into query_traces
                   (restaurant_id, question, route_taken, sql_result_row_count, retrieved_chunk_ids,
                    claimed_citations, grounding_verdict, citation_coverage, investigation_steps)
                   values ($1,$2,'DIAGNOSTIC',$3,$4,$5,$6,$7,$8) returning id""",
                rid, question, len(investigation.order_evidence),
                [uuid.UUID(c["id"]) for c in investigation.chunks],
                json.dumps([c.model_dump() for c in citations]),
                verdict, coverage,
                json.dumps([f"[{s.agent}] {s.description}" for s in investigation.steps]),
            )
            card = await conn.fetchrow(
                """insert into diagnosis_cards
                   (restaurant_id, zone, metric, recent_value, baseline_value, delta_pct, likely_driver,
                    narrative, citations, query_trace_id)
                   values ($1,$2,'avg_delivery_time_seconds',$3,$4,$5,$6,$7,$8,$9)
                   returning id, created_at""",
                rid, zone, investigation.recent_avg_delivery_s, investigation.baseline_avg_delivery_s,
                zone_info["delta_pct"], investigation.likely_driver,
                grounding.strip_citation_markers(raw_answer).strip(),
                json.dumps([c.model_dump() for c in citations]),
                trace_row["id"],
            )

        cards.append({
            "id": str(card["id"]),
            "zone": zone,
            "delta_pct": zone_info["delta_pct"],
            "likely_driver": investigation.likely_driver,
            "narrative": grounding.strip_citation_markers(raw_answer).strip(),
            "trace_id": str(trace_row["id"]),
        })

    return cards
