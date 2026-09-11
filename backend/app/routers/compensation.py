"""Compensation Recovery — a manual-trigger demo of the capability described
in product.md's Phase 2 roadmap: reuse the core engine's SQL + retrieval +
synthesis + grounding pipeline against cancelled/delayed orders to find
compensation-eligible cases the operator didn't think to ask about.

Deliberately NOT a scheduled worker/queue here — that's real infrastructure
this build doesn't need to demonstrate the technique. This is the same
pipeline, invoked on demand instead of on a timer.
"""

import uuid

from fastapi import APIRouter

from app.config import settings
from app.db import get_pool
from app.services.pipeline import run_pipeline

router = APIRouter(prefix="/api/compensation", tags=["compensation"])

SWEEP_QUESTION = (
    "Which of yesterday's cancelled or delayed orders are eligible for "
    "compensation under our current SLA, and how much is recoverable in total?"
)


@router.post("/sweep")
async def run_sweep():
    result = await run_pipeline(SWEEP_QUESTION, settings.demo_restaurant_id)
    eligible_orders = [c.model_dump() for c in result.citations if c.type == "order" and c.verified]
    return {
        "answer": result.answer_text,
        "eligible_order_citations": eligible_orders,
        "grounding_verdict": result.grounding_verdict,
        "citation_coverage": result.citation_coverage,
    }


@router.get("/claims")
async def list_claims():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """select cc.id, cc.computed_amount, cc.status, cc.created_at, o.aggregator_order_id
               from compensation_claims cc join orders o on o.id = cc.order_id
               where cc.restaurant_id = $1 order by cc.created_at desc""",
            uuid.UUID(settings.demo_restaurant_id),
        )
    return [dict(r) for r in rows]
