"""Stage 2D: proactive compensation digest.

Instead of requiring the operator to click "Check for recoverable
compensation" (the manual sweep in routers/compensation.py), this computes
the same eligibility scan automatically, at most once per (restaurant, UTC
day), and surfaces it as a small "morning brief" the Dashboard shows
unprompted. No narrative synthesis here — that's what makes it cheap enough
to compute lazily on page load rather than needing a real scheduler: it's
scan_and_draft_claims() (deterministic, no LLM call) plus a row recording
that day's total, not the full grounded pipeline the manual sweep also runs.
"""

import uuid
from datetime import date, datetime, timezone

import asyncpg

from app.services.compensation_sweep import scan_and_draft_claims


def _today() -> date:
    return datetime.now(timezone.utc).date()


async def get_or_create_today_digest(pool: asyncpg.Pool, restaurant_id: str) -> dict:
    rid = uuid.UUID(restaurant_id)
    today = _today()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "select * from compensation_digests where restaurant_id = $1 and digest_date = $2",
            rid, today,
        )
    if existing:
        return dict(existing)

    _, drafted = await scan_and_draft_claims(pool, rid)
    new_recoverable = round(sum(d.amount for d in drafted), 2)
    claim_ids = [uuid.UUID(d.claim_id) for d in drafted]

    async with pool.acquire() as conn:
        # A concurrent request could race to create today's row (e.g. two
        # tabs open at once) — on conflict, just return whichever row won,
        # rather than drafting the same claims twice under two digest rows.
        row = await conn.fetchrow(
            """insert into compensation_digests
               (restaurant_id, digest_date, new_claims_count, new_recoverable_amount, claim_ids)
               values ($1,$2,$3,$4,$5)
               on conflict (restaurant_id, digest_date) do update set restaurant_id = excluded.restaurant_id
               returning *""",
            rid, today, len(drafted), new_recoverable, claim_ids,
        )
    return dict(row)


async def mark_viewed(pool: asyncpg.Pool, restaurant_id: str, digest_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """update compensation_digests set status = 'viewed', viewed_at = coalesce(viewed_at, now())
               where id = $1 and restaurant_id = $2 and status = 'new' returning *""",
            uuid.UUID(digest_id), uuid.UUID(restaurant_id),
        )
    return dict(row) if row else None


async def dismiss(pool: asyncpg.Pool, restaurant_id: str, digest_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """update compensation_digests set status = 'dismissed', viewed_at = coalesce(viewed_at, now())
               where id = $1 and restaurant_id = $2 returning *""",
            uuid.UUID(digest_id), uuid.UUID(restaurant_id),
        )
    return dict(row) if row else None
