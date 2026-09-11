import uuid
from datetime import date

from fastapi import APIRouter, Form, UploadFile

from app.config import settings
from app.db import get_pool
from app.services import ingestion

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.get("/sources")
async def list_sources():
    pool = await get_pool()
    rid = uuid.UUID(settings.demo_restaurant_id)
    async with pool.acquire() as conn:
        order_count = await conn.fetchval("select count(*) from orders where restaurant_id = $1", rid)
        last_order = await conn.fetchval(
            "select max(created_at) from orders where restaurant_id = $1", rid
        )
        docs = await conn.fetch(
            """select pd.id, pd.source_name, pd.doc_type, pd.effective_date, pd.version,
                      count(pc.id) as chunk_count
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


@router.post("/orders")
async def ingest_orders(file: UploadFile):
    raw = await file.read()
    count = await ingestion.ingest_orders_csv(raw, settings.demo_restaurant_id)
    return {"orders_ingested": count}


@router.post("/documents")
async def ingest_document(
    file: UploadFile,
    doc_type: str = Form("sla"),
    effective_date: str = Form(...),
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
        restaurant_id=settings.demo_restaurant_id,
    )
    return result
