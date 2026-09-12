"""Deployment-hardening middleware: security response headers, and
structured logging of every request with extra emphasis on the
security-relevant outcomes (auth failures, rate-limit hits, server errors)
so unusual traffic patterns show up in whatever log aggregator the
deployment sends stdout to — this app doesn't ship its own log storage.
"""

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("access")

SECURITY_STATUS_CODES = {401, 403, 429}


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


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        client_ip = request.client.host if request.client else "unknown"
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.exception(
                "%s %s -> unhandled exception (client=%s, %dms)",
                request.method, request.url.path, client_ip, duration_ms,
            )
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        log_line = "%s %s -> %d (client=%s, %dms)"
        args = (request.method, request.url.path, response.status_code, client_ip, duration_ms)
        if response.status_code in SECURITY_STATUS_CODES:
            logger.warning(log_line, *args)
        elif response.status_code >= 500:
            logger.error(log_line, *args)
        else:
            logger.info(log_line, *args)
        return response
