import uuid
from datetime import date

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.encoders import jsonable_encoder

from app.auth import require_tenant
from app.db import get_pool
from app.services import ingestion, policy_impact

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.get("/sources")
async def list_sources(restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        order_count = await conn.fetchval("select count(*) from orders where restaurant_id = $1", rid)
        last_order = await conn.fetchval(
            "select max(created_at) from orders where restaurant_id = $1", rid
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
async def ingest_orders(file: UploadFile, restaurant_id: str = Depends(require_tenant)):
    raw = await file.read()
    count = await ingestion.ingest_orders_csv(raw, restaurant_id)
    return {"orders_ingested": count}


@router.post("/documents")
async def ingest_document(
    file: UploadFile,
    doc_type: str = Form("sla"),
    effective_date: str = Form(...),
    restaurant_id: str = Depends(require_tenant),
):
    raw = await file.read()
    if file.filename and file.filename.lower().endswith(".pdf"):
        text = ingestion.extract_pdf_text(raw)
    else:
        text = raw.decode("utf-8")

    result = await ingestion.ingest_policy_document(
        text=text,
        source_name=file.filename or "uploaded_document",
        doc_type=doc_type,
        effective_date=date.fromisoformat(effective_date),
        restaurant_id=restaurant_id,
    )

    impact_report = None
    if doc_type in ("sla", "compensation"):
        impact_report = await policy_impact.run_impact_simulation(
            result["document_id"], restaurant_id, doc_type
        )

    return {**result, "impact_report": impact_report}


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
