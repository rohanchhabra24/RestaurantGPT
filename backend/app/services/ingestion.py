"""Ingestion — the two ETL paths described in product.md §2.1/2.8: structured
order CSVs into `orders`, and policy documents chunked + embedded into
`policy_chunks`. Kept synchronous/inline for this build rather than behind a
queue — the async job pipeline is a documented Phase 4 scale concern, not
something a demo-sized ingestion needs.

Order CSVs go through the Data Mapper (data_mapper.py) rather than assuming
one fixed schema: every restaurant/POS export shapes its columns
differently, so the first upload of a new header shape is proposed by an
LLM and quarantined for operator review (mirrors the injection guardrail's
flag-and-review pattern below) — nothing is inserted until a human confirms
the mapping. A confirmed mapping is cached by a hash of the header row, so
a restaurant's recurring export format only ever costs one LLM call.
"""

import csv
import io
import json
import uuid
from datetime import date

from app.db import get_pool
from app.services import data_mapper, injection_guard
from app.services.embeddings import embed_batch

CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

# Bounds on top of the router's raw-byte upload cap — these bound the actual
# downstream cost (DB rows written / chunks embedded), which doesn't scale
# linearly with file size (e.g. a 25MB file of very short rows/lines).
# 100k rows covers a multi-year order-history backfill for a single
# restaurant in one file; a real SLA/compensation policy document is never
# anywhere close to 300k characters (a 100+ page document), so that cap is
# purely a cost backstop, not something a legitimate upload should ever hit.
MAX_ORDER_ROWS = 100_000
MAX_POLICY_TEXT_CHARS = 300_000


class IngestionError(ValueError):
    pass


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


def _parse_order_csv(raw_csv: bytes) -> tuple[list[str], list[dict]]:
    try:
        text = raw_csv.decode("utf-8")
    except UnicodeDecodeError as e:
        raise IngestionError(f"CSV must be UTF-8 text: {e}")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if len(rows) > MAX_ORDER_ROWS:
        raise IngestionError(f"CSV has more than {MAX_ORDER_ROWS} rows — split it into smaller files")
    return reader.fieldnames or [], rows


async def _insert_mapped_rows(mapped: list["data_mapper.MappedRow"], restaurant_id: str) -> int:
    rid = uuid.UUID(restaurant_id)
    pool = await get_pool()
    count = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            for row in mapped:
                # aggregator_order_id/placed_at are the only columns a row
                # can't exist without — everything else degrades to a
                # sensible default rather than dropping the row.
                if row.aggregator_order_id is None or row.placed_at is None:
                    continue
                await conn.execute(
                    """insert into orders
                       (restaurant_id, aggregator_order_id, placed_at, zone, platform, status,
                        total_amount, prep_time_seconds, delivery_time_seconds, is_cancelled,
                        cancellation_reason, weather_flag)
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
                    rid,
                    row.aggregator_order_id,
                    row.placed_at,
                    row.zone or "unknown",
                    row.platform or "unknown",
                    row.status or "delivered",
                    row.total_amount,
                    row.prep_time_seconds,
                    row.delivery_time_seconds,
                    (row.status or "") == "cancelled",
                    row.cancellation_reason,
                    row.weather_flag,
                )
                count += 1
            await _bump_data_version(conn, rid)
    if count == 0 and mapped:
        raise IngestionError(
            "None of the rows could be mapped — every row was missing an order id or a parseable placed-at "
            "date. Check the column mapping."
        )
    return count


async def ingest_orders_csv(raw_csv: bytes, restaurant_id: str) -> dict:
    """Entry point for a fresh upload. Reuses a previously confirmed mapping
    for this exact header shape when one exists; otherwise proposes one via
    the LLM and returns it for operator review — no rows are inserted on
    that path. See ingest_orders_csv_with_mapping for the confirm step."""
    headers, rows = _parse_order_csv(raw_csv)
    signature = data_mapper.header_signature(headers)
    rid = uuid.UUID(restaurant_id)

    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "select column_mapping from csv_mapping_profiles "
            "where restaurant_id = $1 and header_signature = $2 and status = 'confirmed'",
            rid, signature,
        )

    if existing:
        mapping = data_mapper.MappingProposal.model_validate(json.loads(existing["column_mapping"]))
        count = await _insert_mapped_rows(data_mapper.apply_mapping(mapping, rows), restaurant_id)
        return {"status": "ingested", "orders_ingested": count}

    proposal = await data_mapper.propose_mapping(headers, rows)
    async with pool.acquire() as conn:
        profile_row = await conn.fetchrow(
            """insert into csv_mapping_profiles (restaurant_id, header_signature, sample_headers, column_mapping, status)
               values ($1, $2, $3, $4, 'proposed')
               on conflict (restaurant_id, header_signature)
               do update set sample_headers = excluded.sample_headers, column_mapping = excluded.column_mapping
               returning id""",
            rid, signature, headers, proposal.model_dump_json(),
        )
    return {
        "status": "mapping_required",
        "profile_id": str(profile_row["id"]),
        "headers": headers,
        "sample_rows": rows[:3],
        "proposed_mapping": proposal.model_dump()["mappings"],
    }


async def ingest_orders_csv_with_mapping(
    raw_csv: bytes, restaurant_id: str, profile_id: str, mapping: "data_mapper.MappingProposal"
) -> dict:
    """The confirm step — takes the (possibly operator-edited) mapping and
    the same file re-uploaded alongside it, persists the mapping as
    confirmed for this header shape, and actually inserts. Re-checks the
    header signature against the profile so a confirm call can't be pointed
    at a file whose columns don't match what was reviewed."""
    headers, rows = _parse_order_csv(raw_csv)
    signature = data_mapper.header_signature(headers)
    rid = uuid.UUID(restaurant_id)

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """update csv_mapping_profiles
               set column_mapping = $1, status = 'confirmed', confirmed_at = now()
               where id = $2 and restaurant_id = $3 and header_signature = $4
               returning id""",
            mapping.model_dump_json(), uuid.UUID(profile_id), rid, signature,
        )
    if row is None:
        raise IngestionError(
            "Mapping profile not found, or this file's columns no longer match what was reviewed — re-upload to start over."
        )

    count = await _insert_mapped_rows(data_mapper.apply_mapping(mapping, rows), restaurant_id)
    return {"status": "ingested", "orders_ingested": count}


async def ingest_policy_document(
    text: str,
    source_name: str,
    doc_type: str,
    effective_date: date,
    restaurant_id: str,
    expiry_date: date | None = None,
) -> dict:
    if len(text) > MAX_POLICY_TEXT_CHARS:
        # Bounds embedding cost/chunk count regardless of how the oversized
        # text got here (a huge paste, or a PDF whose extracted text is far
        # larger than its byte size would suggest).
        raise IngestionError(
            f"Document text is too long ({len(text)} chars, max {MAX_POLICY_TEXT_CHARS}) — split it into smaller documents"
        )

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
