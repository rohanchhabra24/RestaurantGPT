"""Month-to-date spend per tenant, computed from the real per-query costs
recorded in query_traces (see pipeline.py's PipelineResult.estimated_cost_usd
and conversations.py, where it's persisted). Alert-only, by design: this
never blocks a tenant's queries — it surfaces the number so the restaurant
owner (and us) can see it, in Insights.
"""

import logging
import uuid

from app.config import settings
from app.db import get_pool

logger = logging.getLogger("usage_tracking")


async def month_to_date_cost(restaurant_id: str) -> float:
    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval(
            """select coalesce(sum(estimated_cost_usd), 0) from query_traces
               where restaurant_id = $1 and created_at >= date_trunc('month', now())""",
            uuid.UUID(restaurant_id),
        )
    return float(total)


async def check_cost_alert(restaurant_id: str) -> dict:
    spend = await month_to_date_cost(restaurant_id)
    over = spend >= settings.cost_alert_threshold_usd
    if over:
        logger.warning("Restaurant %s is over its cost alert threshold: $%.4f >= $%.2f",
                        restaurant_id, spend, settings.cost_alert_threshold_usd)
    return {
        "month_to_date_usd": round(spend, 4),
        "threshold_usd": settings.cost_alert_threshold_usd,
        "over_threshold": over,
    }
