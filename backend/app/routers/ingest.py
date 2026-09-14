import uuid
from datetime import date

from fastapi import APIRouter, Depends, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, ValidationError

from app.auth import require_tenant
from app.config import settings
from app.db import get_pool
from app.services import data_mapper, ingestion, live_feed_sync, policy_impact, rate_limit
from app.services.ip_rate_limit import limiter

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# Starlette's UploadFile doesn't cap size on its own — an unbounded upload
# is both a storage-cost and memory-exhaustion vector (the whole file is
# read into memory below). 25MB comfortably covers a multi-year order-history
# backfill CSV (see MAX_ORDER_ROWS in ingestion.py) and any real policy PDF —
# still far short of a size that would strain a single request.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _check_upload_size(raw: bytes) -> None:
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large — max {MAX_UPLOAD_BYTES // (1024 * 1024)}MB")


@router.get("/sources")
async def list_sources(restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        order_count = await conn.fetchval("select count(*) from orders where restaurant_id = $1", rid)
        last_order = await conn.fetchval(
            "select max(created_at) from orders where restaurant_id = $1", rid
        )
        live_feed_count = await conn.fetchval(
            "select count(*) from orders where restaurant_id = $1 and source = 'live_feed'", rid
        )
        restaurant_row = await conn.fetchrow(
            "select live_feed_url, live_feed_last_synced_date from restaurants where id = $1", rid,
        )
        docs = await conn.fetch(
            """select pd.id, pd.source_name, pd.doc_type, pd.effective_date, pd.version,
                      count(pc.id) as chunk_count,
                      count(pc.id) filter (where pc.flagged) as flagged_count
               from policy_documents pd
               left join policy_chunks pc on pc.policy_document_id = pd.id
               where pd.restaurant_id = $1
               group by pd.id
               order by pd.created_at desc""",
            rid,
        )
    return {
        "orders": {"count": order_count, "last_synced": last_order.isoformat() if last_order else None},
        "documents": [dict(d) for d in docs],
        "live_feed": {
            "configured_url": restaurant_row["live_feed_url"],
            "using_default_feed": restaurant_row["live_feed_url"] is None,
            "last_synced_date": restaurant_row["live_feed_last_synced_date"].isoformat()
                if restaurant_row["live_feed_last_synced_date"] else None,
            "orders_from_feed": live_feed_count,
        },
    }


@router.get("/flagged")
async def list_flagged_chunks(restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """select pc.id, pc.chunk_text, pc.section_label, pc.flag_reason, pd.source_name
               from policy_chunks pc join policy_documents pd on pd.id = pc.policy_document_id
               where pc.restaurant_id = $1 and pc.flagged = true
               order by pc.created_at desc""",
            rid,
        )
    return [dict(r) for r in rows]


@router.post("/flagged/{chunk_id}/approve")
async def approve_flagged_chunk(chunk_id: str, restaurant_id: str = Depends(require_tenant)):
    """Operator reviewed the chunk and it's fine — clear the flag so it
    re-enters retrieval."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "update policy_chunks set flagged = false where id = $1 and restaurant_id = $2 returning id",
            uuid.UUID(chunk_id), uuid.UUID(restaurant_id),
        )
    if row is None:
        raise HTTPException(404, "chunk not found")
    return {"chunk_id": chunk_id, "flagged": False}


@router.delete("/flagged/{chunk_id}")
async def remove_flagged_chunk(chunk_id: str, restaurant_id: str = Depends(require_tenant)):
    """Operator reviewed the chunk and it's genuinely bad — remove it
    entirely rather than just leaving it quarantined."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "delete from policy_chunks where id = $1 and restaurant_id = $2 returning id",
            uuid.UUID(chunk_id), uuid.UUID(restaurant_id),
        )
    if row is None:
        raise HTTPException(404, "chunk not found")
    return {"chunk_id": chunk_id, "removed": True}


@router.post("/orders")
@limiter.limit(settings.ip_rate_limit_ai)
async def ingest_orders(request: Request, file: UploadFile, restaurant_id: str = Depends(require_tenant)):
    """First step of the Data Mapper flow. If this restaurant's export
    format (by header shape) has a confirmed mapping already, this inserts
    directly. Otherwise it proposes a mapping via the LLM and returns it for
    review — response `status` is "ingested" or "mapping_required"; the
    frontend re-submits to /orders/confirm in the latter case."""
    await rate_limit.check_and_record(restaurant_id, "ingest_orders")
    raw = await file.read()
    _check_upload_size(raw)
    try:
        result = await ingestion.ingest_orders_csv(raw, restaurant_id)
    except (KeyError, ValueError, UnicodeDecodeError) as e:
        raise HTTPException(400, f"Malformed order CSV or column mapping: {e}")
    return jsonable_encoder(result)


@router.post("/orders/confirm")
@limiter.limit(settings.ip_rate_limit_ai)
async def confirm_orders_mapping(
    request: Request,
    file: UploadFile,
    profile_id: str = Form(...),
    mapping_json: str = Form(...),
    restaurant_id: str = Depends(require_tenant),
):
    """Second step — the operator has reviewed (and possibly edited) the
    proposed mapping; this persists it as confirmed for this header shape
    and inserts. The same file must be re-submitted alongside it (nothing
    is held server-side between propose and confirm)."""
    await rate_limit.check_and_record(restaurant_id, "ingest_orders_confirm")
    try:
        mapping = data_mapper.MappingProposal.model_validate_json(mapping_json)
    except ValidationError as e:
        raise HTTPException(400, f"Invalid column mapping: {e}")

    raw = await file.read()
    _check_upload_size(raw)
    try:
        result = await ingestion.ingest_orders_csv_with_mapping(raw, restaurant_id, profile_id, mapping)
    except (KeyError, ValueError, UnicodeDecodeError) as e:
        raise HTTPException(400, f"Malformed order CSV or column mapping: {e}")
    return jsonable_encoder(result)


@router.post("/documents")
@limiter.limit(settings.ip_rate_limit_ai)
async def ingest_document(
    request: Request,
    file: UploadFile,
    doc_type: str = Form("sla"),
    effective_date: str = Form(...),
    restaurant_id: str = Depends(require_tenant),
):
    await rate_limit.check_and_record(restaurant_id, "ingest_document")
    try:
        parsed_effective_date = date.fromisoformat(effective_date)
    except ValueError:
        raise HTTPException(400, "Invalid effective_date — expected YYYY-MM-DD")

    raw = await file.read()
    _check_upload_size(raw)
    if file.filename and file.filename.lower().endswith(".pdf"):
        text = ingestion.extract_pdf_text(raw)
    else:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(400, "File must be UTF-8 text or a PDF")

    try:
        result = await ingestion.ingest_policy_document(
            text=text,
            source_name=file.filename or "uploaded_document",
            doc_type=doc_type,
            effective_date=parsed_effective_date,
            restaurant_id=restaurant_id,
        )
    except ingestion.IngestionError as e:
        raise HTTPException(400, str(e))

    impact_report = None
    if doc_type in ("sla", "compensation"):
        impact_report = await policy_impact.run_impact_simulation(
            result["document_id"], restaurant_id, doc_type
        )

    return {**result, "impact_report": impact_report}


class LiveFeedConfigIn(BaseModel):
    # Empty/omitted clears back to the built-in default demo feed.
    live_feed_url: str | None = Field(default=None, max_length=2000)


@router.post("/live-feed/config")
async def configure_live_feed(body: LiveFeedConfigIn, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "update restaurants set live_feed_url = $1 where id = $2",
            body.live_feed_url or None, uuid.UUID(restaurant_id),
        )
    return {"live_feed_url": body.live_feed_url or None}


@router.post("/live-feed/sync")
async def sync_live_feed(restaurant_id: str = Depends(require_tenant)):
    """Manual/lazy trigger — same pattern as the compensation digest: safe
    to call any time, it only does real work once per calendar day."""
    pool = await get_pool()
    return await live_feed_sync.sync_yesterday(pool, restaurant_id)


@router.post("/live-feed/backfill")
@limiter.limit(settings.ip_rate_limit_ai)
async def backfill_live_feed(
    request: Request,
    days: int = Query(30, ge=1, le=live_feed_sync.MAX_BACKFILL_DAYS),
    restaurant_id: str = Depends(require_tenant),
):
    """Populate several days of history through the Live Feed at once,
    instead of waiting one real day per sync — the actual way to get a
    realistic-looking demo dataset flowing through this integration
    rather than through a CSV upload. See docs/live-feed-data-source.md."""
    await rate_limit.check_and_record(restaurant_id, "live_feed_backfill")
    pool = await get_pool()
    return await live_feed_sync.backfill(pool, restaurant_id, days)


@router.post("/live-feed/sync-all")
async def sync_live_feed_all(x_cron_secret: str = Header(default="")):
    """What a scheduled job (GitHub Actions cron, or any other scheduler)
    calls once a day to get real "runs every morning, unattended"
    behavior — see docs/live-feed-data-source.md. Disabled unless
    CRON_SYNC_SECRET is set; an unset secret must never mean "open"."""
    if not settings.cron_sync_secret:
        raise HTTPException(404, "not configured")
    if x_cron_secret != settings.cron_sync_secret:
        raise HTTPException(403, "invalid or missing X-Cron-Secret header")

    pool = await get_pool()
    return await live_feed_sync.sync_all(pool)


@router.get("/policy-impact-reports")
async def list_policy_impact_reports(restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """select pir.*, old_pd.source_name as old_source_name, old_pd.version as old_version,
                      new_pd.source_name as new_source_name, new_pd.version as new_version
               from policy_impact_reports pir
               join policy_documents new_pd on new_pd.id = pir.new_policy_document_id
               left join policy_documents old_pd on old_pd.id = pir.old_policy_document_id
               where pir.restaurant_id = $1
               order by pir.created_at desc""",
            rid,
        )
    return jsonable_encoder([dict(r) for r in rows])
