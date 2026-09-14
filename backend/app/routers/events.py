from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import AuthContext, require_tenant, require_tenant_context
from app.services import events as events_service

router = APIRouter(prefix="/api/events", tags=["events"])


class EventIn(BaseModel):
    event_type: str = Field(min_length=1, max_length=100)
    properties: dict = Field(default_factory=dict)


@router.post("")
async def record_event(body: EventIn, ctx: AuthContext = Depends(require_tenant_context)):
    recorded = await events_service.record_event(ctx.restaurant_id, ctx.user_id, body.event_type, body.properties)
    return {"recorded": recorded}


@router.get("/summary")
async def summary(restaurant_id: str = Depends(require_tenant)):
    return await events_service.summarize(restaurant_id)
