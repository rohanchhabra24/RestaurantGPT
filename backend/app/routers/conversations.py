import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder

from app.auth import AuthContext, require_tenant, require_tenant_context
from app.config import settings
from app.db import get_pool
from app.models import Citation, ConversationOut, MessageIn, MessageOut
from app.services import rate_limit, semantic_cache
from app.services.ip_rate_limit import limiter
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


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # messages -> query_traces both cascade off conversations/messages
        # (see migrations/001_init.sql), so this one delete is enough.
        row = await conn.fetchrow(
            "delete from conversations where id = $1 and restaurant_id = $2 returning id",
            uuid.UUID(conversation_id), uuid.UUID(restaurant_id),
        )
    if row is None:
        raise HTTPException(404, "conversation not found")
    return {"conversation_id": conversation_id, "deleted": True}


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
    """Reloading a conversation (switching chats, refreshing the page) used
    to come back with only id/role/content/citations — every badge
    AnswerCard renders from route_taken/grounding_verdict/investigation_steps
    silently vanished, because this query never joined query_traces even
    though every assistant message has a matching row via message_id. Fixed
    here rather than left alone because thumbs-up/down (message_feedback)
    needs trace_id to know what to attach to on reload anyway — so both the
    badges and feedback state now survive a reload together.

    data_table and cache_similarity are the two MessageOut fields that
    genuinely can't be recovered this way: only sql_result_row_count (not
    the actual rows) and no similarity score at all are persisted in
    query_traces, so those stay at their defaults on reload.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _owned_conversation(conn, uuid.UUID(conversation_id), uuid.UUID(restaurant_id))
        rows = await conn.fetch(
            """select m.id, m.role, m.content, m.citations,
                      qt.id as trace_id, qt.route_taken, qt.generated_sql, qt.grounding_verdict,
                      qt.citation_coverage, qt.latency_ms_by_stage, qt.investigation_steps,
                      qt.served_from_cache, mf.rating as feedback_rating
               from messages m
               left join query_traces qt on qt.message_id = m.id
               left join message_feedback mf on mf.query_trace_id = qt.id
               where m.conversation_id = $1
               order by m.created_at asc""",
            uuid.UUID(conversation_id),
        )
    return [
        MessageOut(
            id=str(r["id"]),
            role=r["role"],
            content=r["content"],
            citations=json.loads(r["citations"]),
            route_taken=r["route_taken"],
            generated_sql=r["generated_sql"],
            grounding_verdict=r["grounding_verdict"],
            citation_coverage=r["citation_coverage"],
            latency_ms_by_stage=json.loads(r["latency_ms_by_stage"]) if r["latency_ms_by_stage"] else {},
            trace_id=str(r["trace_id"]) if r["trace_id"] else None,
            investigation_steps=json.loads(r["investigation_steps"]) if r["investigation_steps"] else [],
            from_cache=bool(r["served_from_cache"]),
            feedback=r["feedback_rating"],
        )
        for r in rows
    ]


@router.post("/{conversation_id}/messages", response_model=MessageOut)
@limiter.limit(settings.ip_rate_limit_ai)
async def post_message(
    request: Request, conversation_id: str, body: MessageIn, ctx: AuthContext = Depends(require_tenant_context)
):
    restaurant_id = ctx.restaurant_id
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

        # Whichever language this member has selected in Settings — answers
        # (and the semantic cache, which is scoped by it too) follow the
        # asker, not the restaurant, since different staff can prefer
        # different languages on the same account.
        response_language = await conn.fetchval(
            "select response_language from restaurant_members where restaurant_id = $1 and user_id = $2",
            rid, uuid.UUID(ctx.user_id),
        ) or "english"

    t0 = time.perf_counter()
    cached = await semantic_cache.lookup(body.content, restaurant_id, response_language)
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

    result = await run_pipeline(body.content, restaurant_id, response_language)
    await semantic_cache.store(body.content, restaurant_id, result, response_language)

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
