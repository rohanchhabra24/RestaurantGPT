"""Cross-cutting engagement instrumentation — lightweight, no third-party
analytics dependency (nothing like that is configured in this build, and
inventing a fake integration would be worse than not having one). Events
land in app_events (migration 010) and are queryable directly, or via
GET /api/events/summary for a basic per-type count.

KNOWN_EVENT_TYPES is a real allowlist, not decoration: an unbounded
event_type string from the client would let a typo (or a compromised
frontend) silently fragment a metric across two spellings forever, with
no server-side signal that anything was wrong. Recording an event is
never allowed to break the feature that triggered it — see
record_event's try/except — so this validates rather than raises.
"""

import logging
import uuid

from app.db import get_pool

logger = logging.getLogger(__name__)

KNOWN_EVENT_TYPES = {
    # Stage 1A: does a new operator lean on the example prompts, or type
    # their own question, on the very first message of a conversation?
    "chat_message_sent",
    # Stage 1B: does anyone ever move off the "english" default?
    "answer_language_changed",
    # Stage 2D: does the proactive digest get looked at, or just dismissed?
    "digest_reviewed",
    "digest_dismissed",
}


def is_known_event_type(event_type: str) -> bool:
    return event_type in KNOWN_EVENT_TYPES


async def record_event(restaurant_id: str, user_id: str | None, event_type: str, properties: dict | None = None) -> bool:
    """Returns whether the event was recorded. Never raises — a broken
    analytics write must not break the request that triggered it (sending
    a chat message, changing a setting, dismissing a banner all still need
    to succeed even if this fails or the event_type isn't recognized).
    """
    if not is_known_event_type(event_type):
        logger.warning("dropped unknown event_type: %r", event_type)
        return False

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "insert into app_events (restaurant_id, user_id, event_type, properties) values ($1,$2,$3,$4)",
                uuid.UUID(restaurant_id),
                uuid.UUID(user_id) if user_id else None,
                event_type,
                properties or {},
            )
        return True
    except Exception:
        logger.exception("failed to record event %r", event_type)
        return False


async def summarize(restaurant_id: str, days: int = 30) -> dict:
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """select event_type, count(*) as count
               from app_events
               where restaurant_id = $1 and created_at >= now() - ($2 || ' days')::interval
               group by event_type
               order by count desc""",
            rid, str(days),
        )
    return {"days": days, "by_event_type": {r["event_type"]: r["count"] for r in rows}}
