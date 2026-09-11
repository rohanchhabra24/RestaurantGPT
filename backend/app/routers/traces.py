import uuid

from fastapi import APIRouter, HTTPException

from app.db import get_pool

router = APIRouter(prefix="/api/traces", tags=["traces"])


@router.get("/{trace_id}")
async def get_trace(trace_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("select * from query_traces where id = $1", uuid.UUID(trace_id))
    if row is None:
        raise HTTPException(404, "trace not found")
    return dict(row)


@router.get("")
async def list_traces(limit: int = 50):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select id, question, route_taken, grounding_verdict, citation_coverage, created_at "
            "from query_traces order by created_at desc limit $1",
            limit,
        )
    return [dict(r) for r in rows]
