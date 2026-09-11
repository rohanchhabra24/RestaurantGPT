import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

from app.auth import require_tenant
from app.db import get_pool
from app.models import Citation, ConversationOut, MessageIn, MessageOut
from app.services import rate_limit, semantic_cache
from app.services.pipeline import run_pipeline

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.post("", response_model=ConversationOut)
async def create_conversation(restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "insert into conversations (restaurant_id) values ($1) returning id, title, created_at",
            uuid.UUID(restaurant_id),
        )
    return ConversationOut(id=str(row["id"]), title=row["title"], created_at=row["created_at"].isoformat())


@router.get("", response_model=list[ConversationOut])
async def list_conversations(restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select id, title, created_at from conversations where restaurant_id = $1 order by created_at desc",
            uuid.UUID(restaurant_id),
        )
    return [ConversationOut(id=str(r["id"]), title=r["title"], created_at=r["created_at"].isoformat()) for r in rows]


async def _owned_conversation(conn, conversation_id: uuid.UUID, restaurant_id: uuid.UUID):
    """Every conversation-scoped route must check this — a conversation_id
    from the URL is client-supplied, so without this check any
    authenticated user could read or post into another restaurant's
    conversation just by guessing/enumerating an id."""
    conv = await conn.fetchrow(
        "select id, title from conversations where id = $1 and restaurant_id = $2",
        conversation_id, restaurant_id,
    )
    if conv is None:
        raise HTTPException(404, "conversation not found")
    return conv


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(conversation_id: str, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _owned_conversation(conn, uuid.UUID(conversation_id), uuid.UUID(restaurant_id))
        rows = await conn.fetch(
            "select id, role, content, citations from messages where conversation_id = $1 order by created_at asc",
            uuid.UUID(conversation_id),
        )
    return [
        MessageOut(id=str(r["id"]), role=r["role"], content=r["content"], citations=json.loads(r["citations"]))
        for r in rows
    ]


@router.post("/{conversation_id}/messages", response_model=MessageOut)
async def post_message(conversation_id: str, body: MessageIn, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    conv_uuid = uuid.UUID(conversation_id)
    rid = uuid.UUID(restaurant_id)

    await rate_limit.check_and_record(restaurant_id, "post_message")

    async with pool.acquire() as conn:
        conv = await _owned_conversation(conn, conv_uuid, rid)

        await conn.execute(
            "insert into messages (conversation_id, role, content) values ($1, 'user', $2)",
            conv_uuid,
            body.content,
        )
        if conv["title"] is None:
            await conn.execute(
                "update conversations set title = $1 where id = $2", body.content[:80], conv_uuid
            )

    t0 = time.perf_counter()
    cached = await semantic_cache.lookup(body.content, restaurant_id)
    cache_lookup_ms = int((time.perf_counter() - t0) * 1000)

    if cached:
        citations = [Citation(**c) for c in cached["citations"]]
        citations_json = json.dumps(cached["citations"])

        async with pool.acquire() as conn:
            msg_row = await conn.fetchrow(
                """insert into messages (conversation_id, role, content, citations)
                   values ($1, 'assistant', $2, $3) returning id""",
                conv_uuid, cached["answer_text"], citations_json,
            )
            trace_row = await conn.fetchrow(
                """insert into query_traces
                   (message_id, restaurant_id, question, route_taken, sql_result_row_count,
                    claimed_citations, grounding_verdict, citation_coverage,
                    latency_ms_by_stage, served_from_cache, input_tokens, output_tokens, estimated_cost_usd)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,0,0,0) returning id""",
                msg_row["id"], rid, body.content,
                cached["route_taken"], len(cached["data_table"]), citations_json,
                cached["grounding_verdict"], cached["citation_coverage"],
                json.dumps({"cache_lookup": cache_lookup_ms}),
            )

        return MessageOut(
            id=str(msg_row["id"]),
            role="assistant",
            content=cached["answer_text"],
            citations=citations,
            route_taken=cached["route_taken"],
            grounding_verdict=cached["grounding_verdict"],
            citation_coverage=cached["citation_coverage"],
            latency_ms_by_stage={"cache_lookup": cache_lookup_ms},
            trace_id=str(trace_row["id"]),
            data_table=cached["data_table"],
            from_cache=True,
            cache_similarity=cached["similarity"],
        )

    result = await run_pipeline(body.content, restaurant_id)
    await semantic_cache.store(body.content, restaurant_id, result)

    citations_json = json.dumps([c.model_dump() for c in result.citations])

    async with pool.acquire() as conn:
        msg_row = await conn.fetchrow(
            """insert into messages (conversation_id, role, content, citations)
               values ($1, 'assistant', $2, $3) returning id""",
            conv_uuid,
            result.answer_text,
            citations_json,
        )
        trace_row = await conn.fetchrow(
            """insert into query_traces
               (message_id, restaurant_id, question, route_taken, generated_sql,
                sql_result_row_count, retrieved_chunk_ids, claimed_citations,
                grounding_verdict, citation_coverage, latency_ms_by_stage, investigation_steps,
                input_tokens, output_tokens, estimated_cost_usd)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
               returning id""",
            msg_row["id"],
            rid,
            body.content,
            result.route_taken,
            result.generated_sql,
            len(result.sql_rows),
            [uuid.UUID(c["id"]) for c in result.chunks],
            citations_json,
            result.grounding_verdict,
            result.citation_coverage,
            json.dumps(result.latency_ms_by_stage),
            json.dumps(result.investigation_steps),
            result.total_input_tokens,
            result.total_output_tokens,
            result.estimated_cost_usd,
        )

    return MessageOut(
        id=str(msg_row["id"]),
        role="assistant",
        content=result.answer_text,
        citations=result.citations,
        route_taken=result.route_taken,
        generated_sql=result.generated_sql,
        grounding_verdict=result.grounding_verdict,
        citation_coverage=result.citation_coverage,
        latency_ms_by_stage=result.latency_ms_by_stage,
        trace_id=str(trace_row["id"]),
        data_table=jsonable_encoder(result.sql_rows),
        investigation_steps=result.investigation_steps,
    )
