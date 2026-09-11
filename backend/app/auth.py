"""Tenant authentication — every route derives `restaurant_id` from a
verified Supabase-issued JWT, never from a request body/query param and
never from a hardcoded constant. This is the fix for the exposure gap:
before this, every endpoint ran against one hardcoded demo restaurant with
no credential check at all.

`restaurant_id` is a custom claim injected by the Postgres
`custom_access_token_hook` function (migrations/006) registered in the
Supabase dashboard — see that migration's header comment for the manual
enablement step. A user who hasn't created/joined a restaurant yet gets a
valid token with no `restaurant_id` claim; `require_tenant` treats that as
"needs onboarding," not an auth failure.
"""

import jwt
from fastapi import Header, HTTPException

from app.config import settings


class AuthContext:
    def __init__(self, user_id: str, restaurant_id: str | None):
        self.user_id = user_id
        self.restaurant_id = restaurant_id


def _decode(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}")


async def get_current_user(authorization: str | None = Header(None)) -> AuthContext:
    """Verifies the token and returns the caller's identity, without
    requiring a restaurant yet — use this for the onboarding endpoints,
    which a freshly signed-up user must be able to call before they have
    a restaurant_id claim."""
    claims = _decode(authorization)
    return AuthContext(user_id=claims["sub"], restaurant_id=claims.get("restaurant_id"))


async def require_tenant(authorization: str | None = Header(None)) -> str:
    """The dependency every tenant-scoped route uses. Returns just the
    restaurant_id string so route signatures stay simple."""
    ctx = await get_current_user(authorization)
    if not ctx.restaurant_id:
        raise HTTPException(
            403,
            "Your account isn't linked to a restaurant yet — complete onboarding first "
            "(POST /api/onboarding/restaurant).",
        )
    return ctx.restaurant_id
