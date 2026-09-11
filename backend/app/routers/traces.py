import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.encoders import jsonable_encoder

from app.db import get_pool

router = APIRouter(prefix="/api/traces", tags=["traces"])


def _serialize_trace(row: dict) -> dict:
    d = dict(row)
    # jsonb columns come back from asyncpg as raw text without a registered
    # codec — parse them so the frontend gets real objects, not JSON-in-a-string.
    for key in ("claimed_citations", "latency_ms_by_stage"):
        if isinstance(d.get(key), str):
            d[key] = json.loads(d[key])
    return jsonable_encoder(d)


@router.get("/{trace_id}")
async def get_trace(trace_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("select * from query_traces where id = $1", uuid.UUID(trace_id))
    if row is None:
        raise HTTPException(404, "trace not found")
    return _serialize_trace(row)


@router.get("")
async def list_traces(limit: int = 50):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select id, question, route_taken, grounding_verdict, citation_coverage, "
            "sql_result_row_count, latency_ms_by_stage, created_at "
            "from query_traces order by created_at desc limit $1",
            limit,
        )
    return [_serialize_trace(r) for r in rows]
