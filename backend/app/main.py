from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import close_pool, get_pool
from app.routers import compensation, conversations, diagnostics, eval, ingest, insights, traces


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(title="RestaurantGPT API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversations.router)
app.include_router(ingest.router)
app.include_router(traces.router)
app.include_router(eval.router)
app.include_router(compensation.router)
app.include_router(diagnostics.router)
app.include_router(insights.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
