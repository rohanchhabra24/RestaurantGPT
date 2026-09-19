"""/api/health/ready — added during the production-readiness audit.
/api/health alone (a cheap liveness check, unchanged) can't tell an
orchestrator "the process is up but can't reach its database", which
would otherwise keep serving traffic to an instance where every real
request 500s. Calls health_ready directly with a mocked pool rather than
spinning up the full app + lifespan (which opens a real DB connection on
startup) — this suite otherwise touches no DB or network at all.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Response

from app.main import health_ready


@pytest.mark.asyncio
async def test_ready_when_db_reachable():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=1)
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

    with patch("app.main.get_pool", new=AsyncMock(return_value=pool)):
        response = Response()
        result = await health_ready(response)

    assert result == {"status": "ok", "db": "reachable"}
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_degraded_when_db_unreachable():
    with patch("app.main.get_pool", new=AsyncMock(side_effect=ConnectionError("db down"))):
        response = Response()
        result = await health_ready(response)

    assert result == {"status": "degraded", "db": "unreachable"}
    assert response.status_code == 503
