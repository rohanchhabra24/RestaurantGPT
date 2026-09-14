"""Compensation Recovery — a manual-trigger demo of the capability described
in product.md's Phase 2 roadmap: sweep cancelled/delayed orders, apply the
deterministic eligibility rules from compensation_rules.py, and draft real
compensation_claims rows for the ones that qualify.

Deliberately NOT a scheduled worker/queue — that's real infrastructure this
build doesn't need to demonstrate the technique. This is the same mechanism,
invoked on demand instead of on a timer. The narrative answer (for the
operator to read) still goes through the full grounded pipeline; the amounts
that actually get persisted do not — see compensation_rules.py for why.
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder

from app.auth import require_tenant
from app.config import settings
from app.db import get_pool
from app.services import compensation_rules, rate_limit
from app.services.ip_rate_limit import limiter
from app.services.pipeline import run_pipeline
from app.services.retrieval_engine import hybrid_search

router = APIRouter(prefix="/api/compensation", tags=["compensation"])

SWEEP_QUESTION = (
    "Which of yesterday's cancelled or delayed orders are eligible for "
    "compensation under our current SLA, and how much is recoverable in total?"
)

SWEEP_WINDOW_SQL = """
    select id, aggregator_order_id, cancellation_reason, delivery_time_seconds,
           sla_target_seconds, total_amount
    from orders
    where restaurant_id = $1
      and is_cancelled = true
      and placed_at >= now() - interval '2 days'
      and id not in (select order_id from compensation_claims where restaurant_id = $1)
"""


@router.post("/sweep")
@limiter.limit(settings.ip_rate_limit_ai)
async def run_sweep(request: Request, restaurant_id: str = Depends(require_tenant)):
    await rate_limit.check_and_record(restaurant_id, "compensation_sweep")
    rid = uuid.UUID(restaurant_id)
    pool = await get_pool()

    async with pool.acquire() as conn:
        candidate_orders = [dict(r) for r in await conn.fetch(SWEEP_WINDOW_SQL, rid)]

    drafted = []
    for order in candidate_orders:
        result = compensation_rules.evaluate_order(order)
        if not result.eligible:
            continue

        chunks = await hybrid_search(result.clause_search_query, restaurant_id, top_k=1)
        policy_chunk_id = uuid.UUID(chunks[0]["id"]) if chunks else None

        async with pool.acquire() as conn:
            claim = await conn.fetchrow(
                """insert into compensation_claims
                   (restaurant_id, order_id, policy_chunk_id, computed_amount, status)
                   values ($1,$2,$3,$4,'drafted')
                   returning id, computed_amount""",
                rid, order["id"], policy_chunk_id, round(result.amount, 2),
            )
        drafted.append({
            "claim_id": str(claim["id"]),
            "order_id": order["aggregator_order_id"],
            "clause": result.clause,
            "amount": float(claim["computed_amount"]),
            "reason": result.reason,
        })

    # The narrative answer still goes through the full grounded pipeline —
    # this is what the operator reads; it explains the numbers above rather
    # than computing them.
    #
    # Deliberately English-only (no response_language passed through) —
    # this is a financial/compensation answer, and the release gate for
    # non-English financial answers is the multilingual eval harness
    # (backend/eval/), which doesn't exist yet. Don't thread a language
    # preference in here until that harness exists and passes for the
    # language in question — see synthesis.py's language-steering comment.
    pipeline_result = await run_pipeline(SWEEP_QUESTION, restaurant_id)
    async with pool.acquire() as conn:
        trace_row = await conn.fetchrow(
            """insert into query_traces
               (restaurant_id, question, route_taken, generated_sql, sql_result_row_count,
                retrieved_chunk_ids, claimed_citations, grounding_verdict, citation_coverage,
                latency_ms_by_stage, input_tokens, output_tokens, estimated_cost_usd)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id""",
            rid, SWEEP_QUESTION, pipeline_result.route_taken, pipeline_result.generated_sql,
            len(pipeline_result.sql_rows),
            [uuid.UUID(c["id"]) for c in pipeline_result.chunks],
            json.dumps([c.model_dump() for c in pipeline_result.citations]),
            pipeline_result.grounding_verdict, pipeline_result.citation_coverage,
            json.dumps(pipeline_result.latency_ms_by_stage),
            pipeline_result.total_input_tokens, pipeline_result.total_output_tokens,
            pipeline_result.estimated_cost_usd,
        )
        if drafted:
            await conn.execute(
                "update compensation_claims set query_trace_id = $1 where id = any($2::uuid[])",
                trace_row["id"], [uuid.UUID(d["claim_id"]) for d in drafted],
            )

    total_recoverable = round(sum(d["amount"] for d in drafted), 2)
    return {
        "answer": pipeline_result.answer_text,
        "grounding_verdict": pipeline_result.grounding_verdict,
        "citation_coverage": pipeline_result.citation_coverage,
        "trace_id": str(trace_row["id"]),
        "candidates_scanned": len(candidate_orders),
        "drafted_claims": drafted,
        "total_recoverable": total_recoverable,
    }


@router.get("/claims")
async def list_claims(status: str | None = None, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    query = """select cc.id, cc.computed_amount, cc.status, cc.created_at, cc.resolved_at,
                      o.aggregator_order_id, o.cancellation_reason
               from compensation_claims cc join orders o on o.id = cc.order_id
               where cc.restaurant_id = $1"""
    args = [rid]
    if status:
        query += " and cc.status = $2"
        args.append(status)
    query += " order by cc.created_at desc"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)
    return jsonable_encoder([dict(r) for r in rows])


@router.post("/claims/{claim_id}/submit")
async def submit_claim(claim_id: str, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """update compensation_claims set status = 'submitted'
               where id = $1 and restaurant_id = $2 and status = 'drafted' returning id""",
            uuid.UUID(claim_id), uuid.UUID(restaurant_id),
        )
    if row is None:
        raise HTTPException(404, "claim not found or not in 'drafted' state")
    return {"claim_id": claim_id, "status": "submitted"}
