"""Per-user settings — currently just the response-language preference
(product.md's Hindi/Hinglish-via-prompting phase). Deliberately its own
small router rather than folded into onboarding.py: onboarding is about
getting a user attached to a restaurant, this is about an already-onboarded
user's ongoing preferences, and the two will keep growing independently.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.auth import AuthContext, require_tenant_context
from app.db import get_pool

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Kept in one place and imported by synthesis.py too, so the set of valid
# values can't drift between "what the DB will accept" and "what the
# prompt knows how to steer toward".
VALID_RESPONSE_LANGUAGES = {"english", "hindi", "hinglish"}


class SettingsUpdate(BaseModel):
    response_language: str

    @field_validator("response_language")
    @classmethod
    def _known_language(cls, v: str) -> str:
        if v not in VALID_RESPONSE_LANGUAGES:
            raise ValueError(f"response_language must be one of {sorted(VALID_RESPONSE_LANGUAGES)}")
        return v


@router.get("")
async def get_settings(ctx: AuthContext = Depends(require_tenant_context)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select response_language from restaurant_members where restaurant_id = $1 and user_id = $2",
            uuid.UUID(ctx.restaurant_id), uuid.UUID(ctx.user_id),
        )
    # A missing row (shouldn't happen for an onboarded user, but the column
    # also carries its own DB-level default) falls back the same way the
    # column itself does, rather than a 404 on what's meant to be a
    # low-stakes preferences read.
    return {"response_language": row["response_language"] if row else "english"}


@router.patch("")
async def update_settings(body: SettingsUpdate, ctx: AuthContext = Depends(require_tenant_context)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """update restaurant_members set response_language = $1
               where restaurant_id = $2 and user_id = $3
               returning response_language""",
            body.response_language, uuid.UUID(ctx.restaurant_id), uuid.UUID(ctx.user_id),
        )
    if row is None:
        raise HTTPException(404, "No membership found for this account and restaurant")
    return {"response_language": row["response_language"]}
