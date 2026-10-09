"""Push delivery for the cost and ungrounded-rate alerts
(usage_tracking.check_cost_alert, insights.check_ungrounded_alert) — both
were alert-only in the sense of "never blocks a tenant," but also
pull-only: nothing surfaced either one unless someone opened the Insights
dashboard. This is the push half: a Slack webhook and/or an SMTP email,
each independently optional and off unless configured (see config.py) —
fired from POST /api/alerts/check (app/routers/alerts.py), which a
scheduled job (GitHub Actions cron, same pattern as
daily-live-feed-sync.yml) calls once a day for every restaurant.

Deliberately best-effort: a Slack outage or a bad SMTP credential must
never be the reason an unrelated cron run fails or raises — see notify()'s
try/except around each channel. Logged either way, so a delivery failure
is at least visible in the structured access/app logs even though it
doesn't propagate as an exception.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

import httpx

from app.config import settings

logger = logging.getLogger("alerting")

REQUEST_TIMEOUT_S = 10.0


async def _send_slack(text: str) -> bool:
    if not settings.slack_webhook_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            resp = await client.post(settings.slack_webhook_url, json={"text": text})
            resp.raise_for_status()
        return True
    except httpx.HTTPError as e:
        logger.warning("Slack alert delivery failed: %s", e)
        return False


def _send_email_sync(subject: str, body: str) -> bool:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.alert_email_from
    msg["To"] = settings.alert_email_to
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=REQUEST_TIMEOUT_S) as server:
        server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)
    return True


async def _send_email(subject: str, body: str) -> bool:
    if not (settings.smtp_host and settings.alert_email_to):
        return False
    try:
        # smtplib is synchronous (blocking socket I/O) — off the event
        # loop via to_thread rather than stalling every other in-flight
        # request on this process for the duration of the SMTP handshake.
        return await asyncio.to_thread(_send_email_sync, subject, body)
    except (smtplib.SMTPException, OSError) as e:
        logger.warning("Email alert delivery failed: %s", e)
        return False


async def notify(subject: str, text: str) -> dict:
    """Fires every configured channel for one alert. Returns which
    channels were actually attempted and whether each succeeded — the
    caller (alerts.py) surfaces this in its response so a misconfigured
    channel (e.g. a bad SMTP password) is visible in the cron job's own
    output instead of silently doing nothing.
    """
    slack_sent = await _send_slack(text)
    email_sent = await _send_email(subject, text)
    return {"slack_sent": slack_sent, "email_sent": email_sent}


async def check_all_restaurants(pool) -> dict:
    """What POST /api/alerts/check actually runs — every restaurant,
    both alert types, same threshold logic the Insights dashboard already
    uses (usage_tracking.check_cost_alert, insights.check_ungrounded_alert)
    so a push alert and what the dashboard shows can never disagree about
    whether something is actually over threshold.

    No new "already alerted today" state: this only fires from the daily
    cron, so at most one push per restaurant per alert type per day is
    already the natural ceiling — adding dedup state would be solving a
    problem this call pattern doesn't have.
    """
    # Deferred imports: usage_tracking has no reason to import alerting
    # (and shouldn't), and insights.py is a router, not a service — both
    # import cleanly here but importing them at module load time would be
    # the unusual direction (a service reaching into a router module).
    from app.routers.insights import check_ungrounded_alert
    from app.services.usage_tracking import check_cost_alert

    async with pool.acquire() as conn:
        restaurant_ids = [str(r["id"]) for r in await conn.fetch("select id from restaurants")]

    results = {}
    for rid in restaurant_ids:
        cost = await check_cost_alert(rid)
        ungrounded = await check_ungrounded_alert(rid)
        sent = {}
        if cost["over_threshold"]:
            sent["cost"] = await notify(
                "RestaurantGPT cost alert",
                f"Restaurant {rid} is over its monthly cost alert threshold: "
                f"${cost['month_to_date_usd']:.2f} >= ${cost['threshold_usd']:.2f} month-to-date.",
            )
        if ungrounded["over_threshold"]:
            sent["ungrounded"] = await notify(
                "RestaurantGPT answer-confidence alert",
                f"Restaurant {rid}: {ungrounded['ungrounded_rate_pct']}% of questions in the last "
                f"{ungrounded['window_hours']}h couldn't be confidently answered "
                f"(threshold {ungrounded['threshold_pct']}%).",
            )
        if sent:
            results[rid] = sent

    return {"restaurants_checked": len(restaurant_ids), "alerts_sent": results}
