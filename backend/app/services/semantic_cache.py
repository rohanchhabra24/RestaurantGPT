"""Semantic response cache — the "Warmstart" showcase technique. Cached by
embedding similarity of the question (not exact string match), and
invalidated by a per-restaurant data_version counter rather than a TTL: any
successful order or policy-document ingestion bumps the counter, which
makes every existing cache row for that restaurant instantly stale without
needing to know which rows are affected. A stale cached answer about
"yesterday's cancellations" is worse than a cache miss, so correctness of
invalidation is the design priority here, not maximizing hit rate.

Only "grounded" or "no_claims" answers are ever cached — a "partial" or
"ungrounded" verdict is exactly the kind of answer that must not be served
again without re-verification.
"""

import json
import uuid

from fastapi.encoders import jsonable_encoder

from app.db import get_pool
from app.services.embeddings import embed

DISTANCE_THRESHOLD = 0.10  # pgvector cosine distance; lower = stricter match
CACHEABLE_VERDICTS = ("grounded", "no_claims")


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"


async def lookup(question: str, restaurant_id: str, response_language: str = "english") -> dict | None:
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    vec_literal = _vec_literal(embed(question))

    async with pool.acquire() as conn:
        current_version = await conn.fetchval("select data_version from restaurants where id = $1", rid)
        # Scoped by response_language too — an English answer cached for one
        # staff member must never be served back to a colleague who asked
        # the same thing with Hindi/Hinglish selected.
        row = await conn.fetchrow(
            """select id, answer_text, citations, data_table, route_taken, grounding_verdict,
                      citation_coverage, question_embedding <=> $1::vector as distance
               from response_cache
               where restaurant_id = $2 and data_version = $3 and response_language = $4
               order by question_embedding <=> $1::vector
               limit 1""",
            vec_literal, rid, current_version, response_language,
        )
        if row is None or row["distance"] > DISTANCE_THRESHOLD:
            return None

        await conn.execute(
            "update response_cache set hit_count = hit_count + 1, last_hit_at = now() where id = $1",
            row["id"],
        )

    return {
        "answer_text": row["answer_text"],
        "citations": json.loads(row["citations"]) if isinstance(row["citations"], str) else row["citations"],
        "data_table": json.loads(row["data_table"]) if isinstance(row["data_table"], str) else row["data_table"],
        "route_taken": row["route_taken"],
        "grounding_verdict": row["grounding_verdict"],
        "citation_coverage": float(row["citation_coverage"]) if row["citation_coverage"] is not None else None,
        "similarity": round(1 - float(row["distance"]), 3),
    }


async def store(question: str, restaurant_id: str, result, response_language: str = "english") -> None:
    if result.grounding_verdict not in CACHEABLE_VERDICTS:
        return

    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    vec_literal = _vec_literal(embed(question))

    async with pool.acquire() as conn:
        current_version = await conn.fetchval("select data_version from restaurants where id = $1", rid)
        await conn.execute(
            """insert into response_cache
               (restaurant_id, question_text, question_embedding, data_version, route_taken,
                answer_text, citations, data_table, grounding_verdict, citation_coverage, response_language)
               values ($1,$2,$3::vector,$4,$5,$6,$7,$8,$9,$10,$11)""",
            rid, question, vec_literal, current_version, result.route_taken,
            result.answer_text,
            json.dumps([c.model_dump() for c in result.citations]),
            json.dumps(jsonable_encoder(result.sql_rows)),
            result.grounding_verdict, result.citation_coverage, response_language,
        )
