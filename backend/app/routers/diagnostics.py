import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder

from app.auth import require_tenant
from app.config import settings
from app.db import get_pool
from app.services import anomaly_scan, rate_limit
from app.services.ip_rate_limit import limiter

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


def _serialize_card(row: dict) -> dict:
    d = dict(row)
    if isinstance(d.get("citations"), str):
        d["citations"] = json.loads(d["citations"])
    return jsonable_encoder(d)


@router.post("/scan")
@limiter.limit(settings.ip_rate_limit_ai)
async def run_scan(request: Request, restaurant_id: str = Depends(require_tenant)):
    await rate_limit.check_and_record(restaurant_id, "anomaly_scan")
    cards = await anomaly_scan.run_scan(restaurant_id)
    return {"zones_scanned": True, "cards_created": len(cards), "cards": cards}


@router.get("/cards")
async def list_cards(status: str | None = None, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    query = "select * from diagnosis_cards where restaurant_id = $1"
    args = [rid]
    if status:
        query += " and status = $2"
        args.append(status)
    query += " order by created_at desc"

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *args)
    return [_serialize_card(r) for r in rows]


@router.post("/cards/{card_id}/mark-reviewed")
async def mark_reviewed(card_id: str, restaurant_id: str = Depends(require_tenant)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "update diagnosis_cards set status = 'reviewed' where id = $1 and restaurant_id = $2 returning id",
            uuid.UUID(card_id), uuid.UUID(restaurant_id),
        )
    if row is None:
        raise HTTPException(404, "card not found")
    return {"card_id": card_id, "status": "reviewed"}
