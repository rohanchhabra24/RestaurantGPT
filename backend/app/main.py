import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

from app.config import settings
from app.db import close_pool, get_pool
from app.middleware import AccessLogMiddleware, SecurityHeadersMiddleware
from app.routers import compensation, conversations, demo_feed, diagnostics, eval, events, ingest, insights, onboarding, orders, settings as settings_router, traces
from app.services import embeddings
from app.services.ip_rate_limit import limiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Both independent (network to Supabase vs. loading a local model file
    # from disk) — run concurrently so startup pays the slower of the two,
    # not both back to back. Warming the embedding model here means the
    # first real request that touches retrieval or the semantic cache
    # doesn't have to eat that load cost live (it's blocking CPU/disk work,
    # hence to_thread rather than awaiting it directly on the event loop).
    await asyncio.gather(get_pool(), asyncio.to_thread(embeddings.warm))
    yield
    await close_pool()


app = FastAPI(title="RestaurantGPT API", lifespan=lifespan)

# Blanket per-IP throttle (bot/scraping defense) — applies to every route,
# authenticated or not, before the per-tenant AI-cost limiter even runs.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_allowed_origins = [o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.force_https:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AccessLogMiddleware)

app.include_router(conversations.router)
app.include_router(ingest.router)
app.include_router(traces.router)
app.include_router(eval.router)
app.include_router(compensation.router)
app.include_router(diagnostics.router)
app.include_router(insights.router)
app.include_router(onboarding.router)
app.include_router(orders.router)
app.include_router(settings_router.router)
app.include_router(events.router)
app.include_router(demo_feed.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
