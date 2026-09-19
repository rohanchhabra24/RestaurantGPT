"""Per-user and per-restaurant settings — the response-language preference
(product.md's Hindi/Hinglish-via-prompting phase, per-member) and the
restaurant's city (per-restaurant, shared by every member — powers
weather_service.py's DIAGNOSTIC-route weather lookups; unset until an
owner adds it in this UI, and deliberately optional). Deliberately its
own small router rather than folded into onboarding.py: onboarding is
about getting a user attached to a restaurant, this is about an
already-onboarded user's ongoing preferences, and the two will keep
growing independently.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth import AuthContext, require_tenant_context
from app.db import get_pool

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Kept in one place and imported by synthesis.py too, so the set of valid
# values can't drift between "what the DB will accept" and "what the
# prompt knows how to steer toward".
VALID_RESPONSE_LANGUAGES = {"english", "hindi", "hinglish"}


class SettingsUpdate(BaseModel):
    # Both optional and independently applied — response_language is a
    # per-member preference (restaurant_members), city is a per-restaurant
    # one (restaurants); a caller only ever changes one of the two at a
    # time in the current UI, but there's no reason to force both fields
    # on every request just because they're both "settings".
    response_language: str | None = None
    city: str | None = Field(default=None, max_length=100)

    @field_validator("response_language")
    @classmethod
    def _known_language(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_RESPONSE_LANGUAGES:
            raise ValueError(f"response_language must be one of {sorted(VALID_RESPONSE_LANGUAGES)}")
        return v


@router.get("")
async def get_settings(ctx: AuthContext = Depends(require_tenant_context)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        member_row = await conn.fetchrow(
            "select response_language from restaurant_members where restaurant_id = $1 and user_id = $2",
            uuid.UUID(ctx.restaurant_id), uuid.UUID(ctx.user_id),
        )
        restaurant_row = await conn.fetchrow(
            "select city from restaurants where id = $1", uuid.UUID(ctx.restaurant_id)
        )
    # A missing member row (shouldn't happen for an onboarded user, but the
    # column also carries its own DB-level default) falls back the same way
    # the column itself does, rather than a 404 on what's meant to be a
    # low-stakes preferences read.
    return {
        "response_language": member_row["response_language"] if member_row else "english",
        "city": restaurant_row["city"] if restaurant_row else None,
    }


@router.patch("")
async def update_settings(body: SettingsUpdate, ctx: AuthContext = Depends(require_tenant_context)):
    if body.response_language is None and body.city is None:
        raise HTTPException(400, "Provide at least one of response_language or city")

    pool = await get_pool()
    result = {}
    async with pool.acquire() as conn:
        if body.response_language is not None:
            row = await conn.fetchrow(
                """update restaurant_members set response_language = $1
                   where restaurant_id = $2 and user_id = $3
                   returning response_language""",
                body.response_language, uuid.UUID(ctx.restaurant_id), uuid.UUID(ctx.user_id),
            )
            if row is None:
                raise HTTPException(404, "No membership found for this account and restaurant")
            result["response_language"] = row["response_language"]

        if body.city is not None:
            # A changed city invalidates any cached lat/long from the old
            # one — clear both so weather_service.get_coordinates()
            # re-geocodes from the new city on next use instead of silently
            # keeping stale coordinates for the previous location.
            city_value = body.city.strip() or None
            row = await conn.fetchrow(
                """update restaurants set city = $1, latitude = null, longitude = null
                   where id = $2 returning city""",
                city_value, uuid.UUID(ctx.restaurant_id),
            )
            result["city"] = row["city"]

    return result
