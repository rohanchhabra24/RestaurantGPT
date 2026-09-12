import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import AuthContext, get_current_user
from app.config import settings
from app.db import get_pool
from app.services.ip_rate_limit import limiter

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


@router.get("/me")
async def me(ctx: AuthContext = Depends(get_current_user)):
    return {"user_id": ctx.user_id, "has_restaurant": ctx.restaurant_id is not None,
            "restaurant_id": ctx.restaurant_id}


class CreateRestaurantIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    aggregator_platform: str = Field(default="multi", max_length=50)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)


@router.post("/restaurant")
@limiter.limit(settings.ip_rate_limit_account_create)
async def create_restaurant(
    request: Request, body: CreateRestaurantIn, ctx: AuthContext = Depends(get_current_user)
):
    if ctx.restaurant_id:
        raise HTTPException(400, "This account is already linked to a restaurant.")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """insert into restaurants (name, aggregator_platform, timezone)
                   values ($1, $2, $3) returning id""",
                body.name, body.aggregator_platform, body.timezone,
            )
            await conn.execute(
                "insert into restaurant_members (restaurant_id, user_id, role) values ($1, $2, 'owner')",
                row["id"], uuid.UUID(ctx.user_id),
            )

    return {
        "restaurant_id": str(row["id"]),
        "note": "Sign out and back in (or refresh your session) to get a token carrying the new restaurant_id claim.",
    }
