"""Deployment-hardening middleware: security response headers, and
structured logging of every request with extra emphasis on the
security-relevant outcomes (auth failures, rate-limit hits, server errors)
so unusual traffic patterns show up in whatever log aggregator the
deployment sends stdout to — this app doesn't ship its own log storage.

Also where the per-request correlation id is minted (RequestIdMiddleware)
— the piece that lets a line in this log actually be tied back to the
query_traces row it produced, see routers that accept `request: Request`
and read `request.state.request_id`.
"""

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("access")

SECURITY_STATUS_CODES = {401, 403, 429}

REQUEST_ID_HEADER = "X-Request-ID"


class JsonLogFormatter(logging.Formatter):
    """One JSON object per line instead of a hand-formatted string — the
    shape a real log aggregator (CloudWatch, Datadog, whatever stdout
    ends up in) can actually index and filter on, rather than having to
    regex a free-text message apart. Anything passed via `extra={...}` on
    a log call becomes its own top-level JSON field (see
    AccessLogMiddleware below), alongside the always-present
    timestamp/level/logger/message.
    """

    # Attributes every LogRecord carries regardless of what the caller
    # passed as `extra` — used to find the *extra* ones to surface as
    # their own JSON fields without hardcoding their names here.
    _STANDARD_ATTRS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys())

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in self._STANDARD_ATTRS and key != "message":
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        # Only meaningful once the deployment is actually served over HTTPS
        # (a reverse proxy/load balancer terminating TLS in front of this
        # app) — harmless to send otherwise, since browsers ignore it on a
        # plain HTTP response.
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Mints (or honors an upstream-supplied) correlation id for every
    request, before AccessLogMiddleware or any route handler runs — both
    read it off `request.state.request_id`. Registered outermost (see
    main.py's add_middleware order: last-added runs first) so every other
    middleware's own log lines can carry it too.
    """

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(REQUEST_ID_HEADER)
        # A deployment behind a proxy/CDN that already assigns its own
        # correlation id should keep using that one end-to-end rather than
        # this app silently minting a second, unrelated id for the same
        # request — but never trust it blindly as something to echo back
        # or log without validating its shape first (header injection).
        request_id = incoming if incoming and _looks_like_uuid(incoming) else str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


def _looks_like_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        client_ip = request.client.host if request.client else "unknown"
        request_id = getattr(request.state, "request_id", None)
        extra = {"method": request.method, "path": request.url.path, "client_ip": client_ip, "request_id": request_id}

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.exception(
                "unhandled exception",
                extra={**extra, "duration_ms": duration_ms},
            )
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        extra = {**extra, "status": response.status_code, "duration_ms": duration_ms}
        message = f"{request.method} {request.url.path} -> {response.status_code}"
        if response.status_code in SECURITY_STATUS_CODES:
            logger.warning(message, extra=extra)
        elif response.status_code >= 500:
            logger.error(message, extra=extra)
        else:
            logger.info(message, extra=extra)
        return response
