"""Hybrid retrieval — dense (pgvector) + sparse (Postgres full-text search)
fused with Reciprocal Rank Fusion. This is the policy-document half of the
dual engine: pure vector search misses exact clause/section lookups that
BM25-style sparse search catches, and vice versa for paraphrased questions.

A cross-encoder rerank pass is the documented next step (product.md §2), not
built here — reranking adds another model dependency for a quality gain that
matters most at larger document counts than a demo corpus has.
"""

from app.db import get_pool
from app.services.embeddings import embed

RRF_K = 60


async def hybrid_search(query: str, restaurant_id: str, top_k: int = 5) -> list[dict]:
    pool = await get_pool()
    query_vec = embed(query)
    vec_literal = "[" + ",".join(str(x) for x in query_vec) + "]"

    async with pool.acquire() as conn:
        dense_rows = await conn.fetch(
            """
            select pc.id, pc.chunk_text, pc.section_label, pd.source_name,
                   pc.embedding <=> $1::vector as distance
            from policy_chunks pc
            join policy_documents pd on pd.id = pc.policy_document_id
            where pc.restaurant_id = $2
              and pc.flagged = false
              and pd.effective_date <= now()
              and (pd.expiry_date is null or pd.expiry_date >= now())
            order by pc.embedding <=> $1::vector
            limit 20
            """,
            vec_literal,
            restaurant_id,
        )
        sparse_rows = await conn.fetch(
            """
            select pc.id, pc.chunk_text, pc.section_label, pd.source_name,
                   ts_rank(pc.fts, websearch_to_tsquery('english', $1)) as rank
            from policy_chunks pc
            join policy_documents pd on pd.id = pc.policy_document_id
            where pc.restaurant_id = $2
              and pc.flagged = false
              and pd.effective_date <= now()
              and (pd.expiry_date is null or pd.expiry_date >= now())
              and pc.fts @@ websearch_to_tsquery('english', $1)
            order by rank desc
            limit 20
            """,
            query,
            restaurant_id,
        )

    scores: dict[str, float] = {}
    chunks_by_id: dict[str, dict] = {}

    for rank, row in enumerate(dense_rows):
        rid = str(row["id"])
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (RRF_K + rank)
        chunks_by_id[rid] = dict(row)

    for rank, row in enumerate(sparse_rows):
        rid = str(row["id"])
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (RRF_K + rank)
        chunks_by_id.setdefault(rid, dict(row))

    ranked_ids = sorted(scores, key=lambda rid: scores[rid], reverse=True)[:top_k]
    return [
        {
            "id": rid,
            "chunk_text": chunks_by_id[rid]["chunk_text"],
            "section_label": chunks_by_id[rid]["section_label"],
            "source_name": chunks_by_id[rid]["source_name"],
            "fusion_score": scores[rid],
        }
        for rid in ranked_ids
    ]
