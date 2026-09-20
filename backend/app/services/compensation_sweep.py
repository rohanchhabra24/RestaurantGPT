"""The candidate-scan-and-draft mechanism shared by the manual sweep
(routers/compensation.py's /sweep, which also runs the full grounded
narrative pipeline on top) and the proactive digest (compensation_digest.py,
which needs only the drafted claims — no narrative, no LLM call, since it
can be triggered just by opening the Dashboard).
"""

import uuid
from dataclasses import dataclass

import asyncpg

from app.services import compensation_rules
from app.services.retrieval_engine import hybrid_search

SWEEP_WINDOW_SQL = """
    select id, aggregator_order_id, cancellation_reason, delivery_time_seconds,
           sla_target_seconds, total_amount
    from orders
    where restaurant_id = $1
      and is_cancelled = true
      -- Anchored to this restaurant's own most recent order, not wall-clock
      -- now() — orders arrive via a one-off historical CSV upload, not a
      -- live feed, so "now() - 2 days" silently matched zero rows for any
      -- data uploaded more than 2 days ago (i.e. nearly all real usage).
      -- Anchoring to max(placed_at) keeps the same "recent activity" intent
      -- but relative to the data actually on file.
      and placed_at >= (select max(placed_at) from orders where restaurant_id = $1) - interval '2 days'
      and id not in (select order_id from compensation_claims where restaurant_id = $1)
"""


@dataclass
class DraftedClaim:
    claim_id: str
    order_id: str
    clause: str | None
    amount: float
    reason: str


async def scan_and_draft_claims(pool: asyncpg.Pool, restaurant_id: uuid.UUID) -> tuple[list[dict], list[DraftedClaim]]:
    """Scans the last 2 days of cancelled orders that don't already have a
    claim, drafts one for every eligible order, and returns both the raw
    candidate list (for reporting how many were scanned) and the drafted
    claims. Idempotent to call repeatedly — SWEEP_WINDOW_SQL already
    excludes orders with an existing compensation_claims row.
    """
    async with pool.acquire() as conn:
        candidate_orders = [dict(r) for r in await conn.fetch(SWEEP_WINDOW_SQL, restaurant_id)]

    drafted: list[DraftedClaim] = []
    for order in candidate_orders:
        result = compensation_rules.evaluate_order(order)
        if not result.eligible:
            continue

        chunks = await hybrid_search(result.clause_search_query, str(restaurant_id), top_k=1)
        policy_chunk_id = uuid.UUID(chunks[0]["id"]) if chunks else None

        async with pool.acquire() as conn:
            # on conflict do nothing — the SELECT above is only a fast-path
            # optimization, not the real dedup: two concurrent sweeps (a
            # double click, or a sweep racing the digest's own lazy call)
            # can both read this order as a candidate before either
            # commits. The unique (restaurant_id, order_id) constraint
            # (migration 014) is the actual safety net; whichever insert
            # loses the race gets no row back here instead of a duplicate
            # claim, and is simply skipped rather than double-drafted.
            claim = await conn.fetchrow(
                """insert into compensation_claims
                   (restaurant_id, order_id, policy_chunk_id, computed_amount, status, reason, clause)
                   values ($1,$2,$3,$4,'drafted',$5,$6)
                   on conflict (restaurant_id, order_id) do nothing
                   returning id, computed_amount""",
                restaurant_id, order["id"], policy_chunk_id, round(result.amount, 2), result.reason, result.clause,
            )
        if claim is None:
            continue
        drafted.append(DraftedClaim(
            claim_id=str(claim["id"]),
            order_id=order["aggregator_order_id"],
            clause=result.clause,
            amount=float(claim["computed_amount"]),
            reason=result.reason,
        ))

    return candidate_orders, drafted
