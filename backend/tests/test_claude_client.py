"""claude_client is the single chokepoint every LLM call in this app goes
through — previously untested, including the retry/timeout config and the
LLMUnavailableError wrapping added during the production-readiness audit
(a hung/failing LLM call used to propagate as a raw, unhandled exception
all the way to a 500). Mocks the underlying openai client so these never
make a real network call.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import openai
import pytest

from app.services.claude_client import LLMUnavailableError, complete, complete_json


def _fake_response(content: str):
    resp = MagicMock()
    resp.choices = [MagicMock(message=MagicMock(content=content))]
    resp.usage = MagicMock(prompt_tokens=10, completion_tokens=5)
    return resp


@pytest.mark.asyncio
async def test_complete_returns_content_on_success():
    with patch("app.services.claude_client.client.chat.completions.create", new=AsyncMock(return_value=_fake_response("hello"))):
        result = await complete("some-model", "system", "user")
    assert result == "hello"


@pytest.mark.asyncio
async def test_complete_records_usage():
    sink = []
    with patch("app.services.claude_client.client.chat.completions.create", new=AsyncMock(return_value=_fake_response("hi"))):
        await complete("some-model", "system", "user", usage_sink=sink)
    assert sink == [{"model": "some-model", "input_tokens": 10, "output_tokens": 5}]


@pytest.mark.asyncio
async def test_complete_wraps_openai_error_as_llm_unavailable():
    # This is the actual fix under test: previously an openai.APITimeoutError
    # (or a rate limit / connection error, after the SDK's own retries are
    # exhausted) propagated to callers as itself — an exception type nothing
    # upstream was watching for, so it reached the user as a raw 500. It
    # must now surface as the app's own LLMUnavailableError instead.
    timeout_error = openai.APITimeoutError(request=MagicMock())
    with patch("app.services.claude_client.client.chat.completions.create", new=AsyncMock(side_effect=timeout_error)):
        with pytest.raises(LLMUnavailableError):
            await complete("some-model", "system", "user")


@pytest.mark.asyncio
async def test_complete_json_wraps_openai_error_as_llm_unavailable():
    rate_limit_error = openai.RateLimitError(message="rate limited", response=MagicMock(status_code=429, headers={}), body=None)
    with patch("app.services.claude_client.client.chat.completions.create", new=AsyncMock(side_effect=rate_limit_error)):
        with pytest.raises(LLMUnavailableError):
            await complete_json("some-model", "system", "user")


@pytest.mark.asyncio
async def test_non_openai_error_is_not_wrapped():
    # Only openai.OpenAIError subclasses get wrapped — a bug in this
    # module itself (or something else entirely) should surface as
    # itself, not be folded into "the AI is unavailable".
    with patch("app.services.claude_client.client.chat.completions.create", new=AsyncMock(side_effect=ValueError("boom"))):
        with pytest.raises(ValueError):
            await complete("some-model", "system", "user")
