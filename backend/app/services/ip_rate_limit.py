"""Per-IP request throttling — a blanket defense against scripted abuse
(bots hammering an endpoint, scraping, repeated account creation) that
applies before authentication is even checked, layered on top of (not
instead of) the per-tenant Postgres limiter in rate_limit.py.

Why both: the per-tenant limiter only kicks in once a request carries a
valid, onboarded restaurant_id — it can't stop an attacker who scripts
fresh signups to get a new quota each time, or unauthenticated noise
against endpoints that don't require a tenant at all. This one keys on
client IP and applies globally via middleware, plus tighter per-route
limits on the most sensitive actions (account creation, AI generation).

In-memory storage (slowapi's default): correct for this single-process
deployment. Counts are not shared across processes, so before running
more than one backend worker, point this at slowapi's Redis storage_uri
instead — see https://slowapi.readthedocs.io for the option.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.ip_rate_limit_default])
