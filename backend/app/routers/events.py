import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth import AuthContext, require_tenant, require_tenant_context, require_tenant_sse
from app.db import get_pool
from app.services import compensation_digest
from app.services import events as events_service

router = APIRouter(prefix="/api/events", tags=["events"])
logger = logging.getLogger("events_stream")


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


# Phase 4 of the Dashboard plan: push the two findings worth interrupting
# a shift for — a new compensation find, and an SLA breach count that's
# crossed a "worth a look" threshold — instead of requiring the operator
# to have the app open and looking at the right tab. No scheduled worker
# behind this (this build deliberately doesn't have one — see
# compensation_digest.py's header comment): each open SSE connection runs
# its own polling loop against the DB, the same "compute lazily on an open
# request, not on a timer" approach the digest already uses. That trades
# one DB round-trip per connection per poll for not needing any new
# infrastructure — fine at this app's scale, worth revisiting with a real
# pub/sub channel if concurrent open tabs ever became large.
EVENTS_POLL_INTERVAL_SECONDS = 25
SLA_BREACH_SPIKE_THRESHOLD = 5


def _sse(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@router.get("/stream")
async def stream(request: Request, restaurant_id: str = Depends(require_tenant_sse)):
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)

    async def event_stream():
        # Per-connection memory only, not persisted — re-opening the
        # connection (a page reload) can re-send the current state once.
        # The frontend dedupes that against what it already notified for
        # via sessionStorage, the same pattern this app already uses for
        # per-tab "have I shown this yet" state elsewhere.
        last_digest_id = None
        spike_active = False
        try:
            # One immediate check before the first sleep — a connection
            # that opens right after a breach already crossed the
            # threshold shouldn't have to wait a full poll interval to
            # hear about it.
            while True:
                if await request.is_disconnected():
                    break
                try:
                    digest = await compensation_digest.get_or_create_today_digest(pool, restaurant_id)
                    digest_id = str(digest["id"])
                    if digest["new_claims_count"] > 0 and digest_id != last_digest_id:
                        last_digest_id = digest_id
                        yield _sse("compensation_found", {
                            "digest_id": digest_id,
                            "new_claims_count": digest["new_claims_count"],
                            "new_recoverable_amount": float(digest["new_recoverable_amount"]),
                        })

                    async with pool.acquire() as conn:
                        breaches_today = await conn.fetchval(
                            """select count(*) from orders
                               where restaurant_id = $1 and placed_at >= date_trunc('day', now())
                                 and delivery_time_seconds is not null and sla_target_seconds is not null
                                 and delivery_time_seconds > sla_target_seconds""",
                            rid,
                        )
                    if breaches_today >= SLA_BREACH_SPIKE_THRESHOLD and not spike_active:
                        spike_active = True
                        yield _sse("sla_breach_spike", {
                            "breaches_today": breaches_today,
                            "threshold": SLA_BREACH_SPIKE_THRESHOLD,
                        })
                    elif breaches_today < SLA_BREACH_SPIKE_THRESHOLD:
                        spike_active = False
                except asyncio.CancelledError:
                    raise
                except Exception:
                    # A transient DB hiccup shouldn't kill the whole
                    # connection — just skip this poll and try again next
                    # interval rather than forcing the client to reconnect.
                    logger.exception("events/stream poll failed for restaurant %s", restaurant_id)
                await asyncio.sleep(EVENTS_POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
