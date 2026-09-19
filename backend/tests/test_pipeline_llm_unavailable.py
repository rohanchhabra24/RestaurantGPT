"""run_pipeline's graceful-degradation wrapper (added during the
production-readiness audit): every stage of the pipeline makes at least
one LLM call, and previously a timeout/rate-limit/outage propagated as an
unhandled exception all the way to a 500. This checks the wrapper actually
catches claude_client.LLMUnavailableError raised from deep inside the
pipeline (via intent_router.classify_intent, the very first call) and
returns a normal-shaped PipelineResult with the distinct "AI unavailable"
message — not the "insufficient data" abstention message, which would
mislead the operator about what actually went wrong.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.claude_client import LLMUnavailableError
from app.services.pipeline import _LLM_UNAVAILABLE_MESSAGES, run_pipeline


@pytest.mark.asyncio
async def test_llm_outage_returns_graceful_message_not_a_raw_exception():
    with patch("app.services.pipeline.intent_router.classify_intent", new=AsyncMock(side_effect=LLMUnavailableError("boom"))):
        result = await run_pipeline("How many orders today?", "00000000-0000-0000-0000-000000000001")

    assert result.answer_text == _LLM_UNAVAILABLE_MESSAGES["english"]
    assert result.abstained is True
    assert result.grounding_verdict == "no_claims"
    assert result.citations == []


@pytest.mark.asyncio
async def test_llm_outage_message_is_localized():
    with patch("app.services.pipeline.intent_router.classify_intent", new=AsyncMock(side_effect=LLMUnavailableError("boom"))):
        result = await run_pipeline(
            "aaj kitne orders the?", "00000000-0000-0000-0000-000000000001", response_language="hinglish",
        )
    assert result.answer_text == _LLM_UNAVAILABLE_MESSAGES["hinglish"]


@pytest.mark.asyncio
async def test_non_llm_exception_still_propagates():
    # Only LLMUnavailableError is caught here — a genuine bug elsewhere in
    # the pipeline must still surface as itself (a real 500 an engineer
    # can find), not be silently folded into "AI unavailable".
    with patch("app.services.pipeline.intent_router.classify_intent", new=AsyncMock(side_effect=RuntimeError("bug"))):
        with pytest.raises(RuntimeError):
            await run_pipeline("How many orders today?", "00000000-0000-0000-0000-000000000001")
