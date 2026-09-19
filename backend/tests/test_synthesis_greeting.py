"""generate_greeting's timezone fallback — defensive coverage for any row
written before onboarding.py's timezone validation existed (see
test_onboarding.py). Mocks claude_client.complete so this never makes a
real LLM call; only the ZoneInfo handling is under test here.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.synthesis import generate_greeting


@pytest.mark.asyncio
async def test_valid_timezone_used_directly():
    with patch("app.services.synthesis.complete", new=AsyncMock(return_value="Good morning!")) as mock_complete:
        result = await generate_greeting("hi", "America/New_York")
    assert result == "Good morning!"
    mock_complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_invalid_timezone_falls_back_instead_of_raising():
    # This is the actual bug under test: before the fallback existed,
    # ZoneInfo("Not/A_Real_Zone") raised ZoneInfoNotFoundError here and
    # 500'd the whole greeting route instead of just using a default.
    with patch("app.services.synthesis.complete", new=AsyncMock(return_value="Good evening!")):
        result = await generate_greeting("hi", "Not/A_Real_Zone")
    assert result == "Good evening!"
