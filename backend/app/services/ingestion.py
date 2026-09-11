"""Ingestion — the two ETL paths described in product.md §2.1/2.8: structured
order CSVs into `orders`, and policy documents chunked + embedded into
`policy_chunks`. Kept synchronous/inline for this build rather than behind a
queue — the async job pipeline is a documented Phase 4 scale concern, not
something a demo-sized ingestion needs.
"""

import csv
import io
import uuid
from datetime import date

from app.db import get_pool
from app.services import injection_guard
from app.services.embeddings import embed_batch

CHUNK_SIZE = 800
CHUNK_OVERLAP = 150


async def _bump_data_version(conn, restaurant_id: uuid.UUID) -> None:
    """Invalidates every existing semantic-cache row for this restaurant —
    see semantic_cache.py. Called at the end of any ingestion that changes
    what an answer could be grounded in."""
    await conn.execute("update restaurants set data_version = data_version + 1 where id = $1", restaurant_id)


def chunk_text(text: str) -> list[str]:
    text = " ".join(text.split())
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
    return [c for c in chunks if c.strip()]


async def ingest_orders_csv(raw_csv: bytes, restaurant_id: str) -> int:
    reader = csv.DictReader(io.StringIO(raw_csv.decode("utf-8")))
    pool = await get_pool()
    count = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            for row in reader:
                is_cancelled = row.get("status", "").strip().lower() == "cancelled"
                await conn.execute(
                    """insert into orders
                       (restaurant_id, aggregator_order_id, placed_at, zone, platform, status,
                        total_amount, prep_time_seconds, delivery_time_seconds, is_cancelled,
                        cancellation_reason, weather_flag)
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
                    uuid.UUID(restaurant_id),
                    row["order_id"],
                    row["placed_at"],
                    row["zone"],
                    row.get("platform", "unknown"),
                    row["status"],
                    float(row["total_amount"]) if row.get("total_amount") else None,
                    int(row["prep_time_seconds"]) if row.get("prep_time_seconds") else None,
                    int(row["delivery_time_seconds"]) if row.get("delivery_time_seconds") else None,
                    is_cancelled,
                    row.get("cancellation_reason") or None,
                    row.get("weather_flag", "").strip().lower() in ("1", "true", "yes"),
                )
                count += 1
            await _bump_data_version(conn, uuid.UUID(restaurant_id))
    return count


async def ingest_policy_document(
    text: str,
    source_name: str,
    doc_type: str,
    effective_date: date,
    restaurant_id: str,
    expiry_date: date | None = None,
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        next_version = await conn.fetchval(
            "select coalesce(max(version), 0) + 1 from policy_documents where restaurant_id = $1 and doc_type = $2",
            uuid.UUID(restaurant_id),
            doc_type,
        )
        doc_row = await conn.fetchrow(
            """insert into policy_documents (restaurant_id, source_name, doc_type, effective_date, expiry_date, version)
               values ($1,$2,$3,$4,$5,$6) returning id""",
            uuid.UUID(restaurant_id),
            source_name,
            doc_type,
            effective_date,
            expiry_date,
            next_version,
        )
        doc_id = doc_row["id"]

        chunks = chunk_text(text)
        vectors = embed_batch(chunks)

        flagged_count = 0
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
            vec_literal = "[" + ",".join(str(x) for x in vec) + "]"
            flagged, flag_reason = await injection_guard.check_chunk(chunk)
            flagged_count += int(flagged)
            await conn.execute(
                """insert into policy_chunks
                   (policy_document_id, restaurant_id, chunk_text, chunk_index, section_label,
                    embedding, flagged, flag_reason)
                   values ($1,$2,$3,$4,$5,$6::vector,$7,$8)""",
                doc_id,
                uuid.UUID(restaurant_id),
                chunk,
                idx,
                f"{source_name} §{idx + 1}",
                vec_literal,
                flagged,
                flag_reason,
            )

        await _bump_data_version(conn, uuid.UUID(restaurant_id))

    return {"document_id": str(doc_id), "version": next_version, "chunks_indexed": len(chunks), "chunks_flagged": flagged_count}


def extract_pdf_text(raw_bytes: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)
