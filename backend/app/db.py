import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        # ssl="require" so the connection is always encrypted even if the
        # DSN doesn't itself specify sslmode — never silently fall back to
        # a plaintext session to a database that lives outside this process.
        _pool = await asyncpg.create_pool(settings.supabase_db_url, min_size=1, max_size=10, ssl="require")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
