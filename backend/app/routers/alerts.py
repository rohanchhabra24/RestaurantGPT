"""POST /api/alerts/check — what a scheduled job (GitHub Actions cron,
same pattern as ingest.py's /live-feed/sync-all) calls once a day to push
the cost and ungrounded-rate alerts that were previously pull-only (see
app/services/alerting.py's module docstring). Cron-secret-gated with the
same CRON_SYNC_SECRET the live-feed sync endpoint already uses — same
threat model (an unauthenticated caller shouldn't be able to trigger
either), no reason for a second secret.
"""

import hmac

from fastapi import APIRouter, Header, HTTPException

from app.config import settings
from app.db import get_pool
from app.services import alerting

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.post("/check")
async def check_alerts(x_cron_secret: str = Header(default="")):
    if not settings.cron_sync_secret:
        raise HTTPException(404, "not configured")
    if not hmac.compare_digest(x_cron_secret, settings.cron_sync_secret):
        raise HTTPException(403, "invalid or missing X-Cron-Secret header")

    pool = await get_pool()
    return await alerting.check_all_restaurants(pool)
