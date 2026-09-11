"""Per-tenant rate limiting — a request-log + COUNT() window rather than a
bucketed counter table or Redis. Consistent with the semantic cache's "one
fewer moving part" call, and fine at this build's scale; revisit if a
tenant's write volume to api_requests itself becomes the bottleneck.
"""

import uuid

from fastapi import HTTPException

from app.config import settings
from app.db import get_pool


class RateLimitExceeded(HTTPException):
    def __init__(self, window: str, limit: int):
        super().__init__(429, f"Rate limit exceeded: {limit} requests per {window}. Try again shortly.")


async def check_and_record(restaurant_id: str, route: str) -> None:
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)

    async with pool.acquire() as conn:
        minute_count = await conn.fetchval(
            "select count(*) from api_requests where restaurant_id = $1 and created_at >= now() - interval '1 minute'",
            rid,
        )
        if minute_count >= settings.rate_limit_per_minute:
            raise RateLimitExceeded("minute", settings.rate_limit_per_minute)

        day_count = await conn.fetchval(
            "select count(*) from api_requests where restaurant_id = $1 and created_at >= now() - interval '1 day'",
            rid,
        )
        if day_count >= settings.rate_limit_per_day:
            raise RateLimitExceeded("day", settings.rate_limit_per_day)

        await conn.execute(
            "insert into api_requests (restaurant_id, route) values ($1, $2)", rid, route
        )
