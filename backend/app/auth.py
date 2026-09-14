"""Tenant authentication — every route derives `restaurant_id` from a
verified Supabase-issued JWT, never from a request body/query param and
never from a hardcoded constant. This is the fix for the exposure gap:
before this, every endpoint ran against one hardcoded demo restaurant with
no credential check at all.

Verification is against Supabase's JWKS endpoint (asymmetric ES256 keys),
not a shared HS256 secret — this project (like any created after Supabase's
JWT Signing Keys rollout) signs tokens with a rotating ECC key, and the
legacy shared secret is only kept around for tokens issued before the
rotation. PyJWKClient handles fetching/caching the public keys and picking
the right one by the token's `kid`, including transparently picking up a
new key after a rotation.

`restaurant_id` is a custom claim injected by the Postgres
`custom_access_token_hook` function (migrations/006) registered in the
Supabase dashboard — see that migration's header comment for the manual
enablement step. A user who hasn't created/joined a restaurant yet gets a
valid token with no `restaurant_id` claim; `require_tenant` treats that as
"needs onboarding," not an auth failure.
"""

import logging

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger("auth")

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")
    return _jwks_client


class AuthContext:
    def __init__(self, user_id: str, restaurant_id: str | None):
        self.user_id = user_id
        self.restaurant_id = restaurant_id


def _decode(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
            # Issuer check ties the token to *this* Supabase project, not just
            # to "some key JWKS happened to match" — belt-and-suspenders on
            # top of the key lookup itself already being project-scoped.
            # require=[...] makes a token missing exp/sub fail closed rather
            # than silently skipping a check that isn't present. PyJWT
            # verifies exp (and rejects an expired token) by default whenever
            # the claim is present.
            issuer=f"{settings.supabase_url}/auth/v1",
            options={"require": ["exp", "sub", "iss"]},
        )
    except jwt.PyJWTError as e:
        # Logged server-side with the specific reason (useful for spotting a
        # credential-stuffing/token-replay pattern); the client only gets a
        # generic message so a scripted attacker can't use error detail to
        # narrow down which part of verification is failing.
        logger.warning("JWT verification failed: %s", e)
        raise HTTPException(401, "Invalid or expired token")


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


async def require_tenant_context(authorization: str | None = Header(None)) -> AuthContext:
    """Same gate as require_tenant, but for the handful of routes (e.g.
    per-user settings) that need to know *which member* of the restaurant
    is calling, not just which restaurant — returns the full context
    instead of collapsing it to the restaurant_id string."""
    ctx = await get_current_user(authorization)
    if not ctx.restaurant_id:
        raise HTTPException(
            403,
            "Your account isn't linked to a restaurant yet — complete onboarding first "
            "(POST /api/onboarding/restaurant).",
        )
    return ctx
