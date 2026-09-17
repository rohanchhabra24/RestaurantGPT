import json
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.auth import require_tenant
from app.db import get_pool

router = APIRouter(prefix="/api/traces", tags=["traces"])


def _serialize_trace(row: dict) -> dict:
    d = dict(row)
    # jsonb columns come back from asyncpg as raw text without a registered
    # codec — parse them so the frontend gets real objects, not JSON-in-a-string.
    for key in ("claimed_citations", "latency_ms_by_stage", "investigation_steps"):
        if isinstance(d.get(key), str):
            d[key] = json.loads(d[key])
    return jsonable_encoder(d)


@router.get("/{trace_id}")
async def get_trace(trace_id: str, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select * from query_traces where id = $1 and restaurant_id = $2",
            uuid.UUID(trace_id), uuid.UUID(restaurant_id),
        )
    if row is None:
        raise HTTPException(404, "trace not found")
    return _serialize_trace(row)


@router.get("")
async def list_traces(limit: int = 50, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select id, question, route_taken, grounding_verdict, citation_coverage, "
            "sql_result_row_count, latency_ms_by_stage, investigation_steps, created_at "
            "from query_traces where restaurant_id = $1 order by created_at desc limit $2",
            uuid.UUID(restaurant_id), limit,
        )
    return [_serialize_trace(r) for r in rows]


class FeedbackIn(BaseModel):
    rating: Literal["up", "down"]


@router.put("/{trace_id}/feedback")
async def set_feedback(trace_id: str, body: FeedbackIn, restaurant_id: str = Depends(require_tenant)):
    """The human quality signal that pairs with grounding_verdict's
    machine-computed one — see the migration's comment. PUT (not POST)
    because re-tapping thumbs-up/down replaces the prior rating rather than
    accumulating one row per tap; a restaurant owner changing their mind
    isn't a new event worth keeping history of.
    """
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        trace_owned = await conn.fetchval(
            "select 1 from query_traces where id = $1 and restaurant_id = $2",
            uuid.UUID(trace_id), rid,
        )
        if not trace_owned:
            raise HTTPException(404, "trace not found")

        await conn.execute(
            """insert into message_feedback (query_trace_id, restaurant_id, rating)
               values ($1, $2, $3)
               on conflict (query_trace_id) do update set rating = $3, updated_at = now()""",
            uuid.UUID(trace_id), rid, body.rating,
        )
    return {"trace_id": trace_id, "rating": body.rating}


@router.delete("/{trace_id}/feedback")
async def clear_feedback(trace_id: str, restaurant_id: str = Depends(require_tenant)):
    """Tapping the same thumb again clears it — feedback isn't mandatory,
    and a stuck rating the owner no longer means is worse than none."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "delete from message_feedback where query_trace_id = $1 and restaurant_id = $2",
            uuid.UUID(trace_id), uuid.UUID(restaurant_id),
        )
    return {"trace_id": trace_id, "rating": None}
