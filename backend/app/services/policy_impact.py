"""Policy Change Impact Simulator — the moment a new SLA/compensation policy
version is ingested, replay it against recent order history under both the
old and new rule parameters and quantify the financial delta. This is only
possible because policy documents are versioned and orders are tenant-scoped
in the same store (see product.md's capabilities pitch) — a generic
chatbot handed the new PDF can summarize it, but can't run it as a
counterfactual against real history.
"""

import uuid
from datetime import timedelta

from app.db import get_pool
from app.services import compensation_rules
from app.services.policy_extraction import extract_policy_params

WINDOW_DAYS = 90


async def _reconstruct_document_text(conn, document_id) -> str:
    rows = await conn.fetch(
        "select chunk_text from policy_chunks where policy_document_id = $1 order by chunk_index",
        document_id,
    )
    return "\n".join(r["chunk_text"] for r in rows)


async def run_impact_simulation(new_document_id: str, restaurant_id: str, doc_type: str) -> dict | None:
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    new_doc_id = uuid.UUID(new_document_id)

    async with pool.acquire() as conn:
        previous_doc = await conn.fetchrow(
            """select id from policy_documents
               where restaurant_id = $1 and doc_type = $2 and id != $3
               order by version desc, created_at desc limit 1""",
            rid, doc_type, new_doc_id,
        )
        if previous_doc is None:
            return None  # nothing to compare against — first version of this doc type

        old_text = await _reconstruct_document_text(conn, previous_doc["id"])
        new_text = await _reconstruct_document_text(conn, new_doc_id)

        window_start = None
        orders = await conn.fetch(
            """select id, cancellation_reason, delivery_time_seconds, sla_target_seconds, total_amount
               from orders
               where restaurant_id = $1 and is_cancelled = true
                 and placed_at >= now() - make_interval(days => $2)""",
            rid, WINDOW_DAYS,
        )

    old_params = await extract_policy_params(old_text)
    new_params = await extract_policy_params(new_text)

    eligible_old = eligible_new = 0
    total_old = total_new = 0.0
    for order in orders:
        r_old = compensation_rules.evaluate_order(dict(order), old_params)
        r_new = compensation_rules.evaluate_order(dict(order), new_params)
        if r_old.eligible:
            eligible_old += 1
            total_old += r_old.amount
        if r_new.eligible:
            eligible_new += 1
            total_new += r_new.amount

    delta = round(total_new - total_old, 2)

    async with pool.acquire() as conn:
        report = await conn.fetchrow(
            """insert into policy_impact_reports
               (restaurant_id, old_policy_document_id, new_policy_document_id, window_start, window_end,
                orders_evaluated, orders_eligible_old, orders_eligible_new,
                total_amount_old, total_amount_new, financial_delta)
               values ($1,$2,$3, now() - make_interval(days => $4), now(), $5,$6,$7,$8,$9,$10)
               returning id, created_at""",
            rid, previous_doc["id"], new_doc_id, WINDOW_DAYS,
            len(orders), eligible_old, eligible_new,
            round(total_old, 2), round(total_new, 2), delta,
        )

    return {
        "report_id": str(report["id"]),
        "orders_evaluated": len(orders),
        "orders_eligible_old": eligible_old,
        "orders_eligible_new": eligible_new,
        "total_amount_old": round(total_old, 2),
        "total_amount_new": round(total_new, 2),
        "financial_delta": delta,
        "window_days": WINDOW_DAYS,
    }
