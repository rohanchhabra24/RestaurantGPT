"""alerting.py's channel functions are the one place network/SMTP calls
would happen — covered here only for the part that's genuinely pure
logic and safe to assert without a real network: each channel must do
nothing at all (no delivery attempt) when its own config is unset. The
actual Slack POST / SMTP send is integration-level and out of scope for
this pure-logic suite, same reasoning as the rest of backend/tests/.
"""

import pytest

from app.config import settings
from app.services import alerting


@pytest.fixture(autouse=True)
def _reset_alert_settings():
    # Every test in this file should start from "nothing configured" —
    # alerting must be opt-in, so that's the state worth protecting by
    # default, and the settings object is a module-level singleton other
    # tests could otherwise leak into.
    original = {
        "slack_webhook_url": settings.slack_webhook_url,
        "alert_email_to": settings.alert_email_to,
        "smtp_host": settings.smtp_host,
        "smtp_username": settings.smtp_username,
        "smtp_password": settings.smtp_password,
    }
    settings.slack_webhook_url = ""
    settings.alert_email_to = ""
    settings.smtp_host = ""
    yield
    for key, value in original.items():
        setattr(settings, key, value)


@pytest.mark.asyncio
async def test_slack_disabled_by_default_sends_nothing():
    sent = await alerting._send_slack("test alert")
    assert sent is False


@pytest.mark.asyncio
async def test_email_disabled_without_smtp_host():
    settings.alert_email_to = "owner@example.com"  # recipient alone isn't enough
    sent = await alerting._send_email("subject", "body")
    assert sent is False


@pytest.mark.asyncio
async def test_email_disabled_without_recipient():
    settings.smtp_host = "smtp.example.com"  # host alone isn't enough
    sent = await alerting._send_email("subject", "body")
    assert sent is False


@pytest.mark.asyncio
async def test_notify_reports_nothing_sent_when_unconfigured():
    result = await alerting.notify("subject", "body")
    assert result == {"slack_sent": False, "email_sent": False}
