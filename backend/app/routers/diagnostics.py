import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.encoders import jsonable_encoder

from app.config import settings
from app.db import get_pool
from app.services import anomaly_scan

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


def _serialize_card(row: dict) -> dict:
    d = dict(row)
    if isinstance(d.get("citations"), str):
        d["citations"] = json.loads(d["citations"])
    return jsonable_encoder(d)


@router.post("/scan")
async def run_scan():
    cards = await anomaly_scan.run_scan(settings.demo_restaurant_id)
    return {"zones_scanned": True, "cards_created": len(cards), "cards": cards}


@router.get("/cards")
async def list_cards(status: str | None = None):
    pool = await get_pool()
    rid = uuid.UUID(settings.demo_restaurant_id)
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
async def mark_reviewed(card_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "update diagnosis_cards set status = 'reviewed' where id = $1 returning id",
            uuid.UUID(card_id),
        )
    if row is None:
        raise HTTPException(404, "card not found")
    return {"card_id": card_id, "status": "reviewed"}
