import json
import logging
import re

import openai
from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# Both bound the worst case of a single request: without a timeout, a
# hung connection to Groq can block a request (and the worker handling
# it) indefinitely, since nothing above this client enforces its own
# per-request deadline. max_retries lets the SDK's own exponential
# backoff absorb a transient 429/500/502/503/504 or connection error
# before it ever reaches callers as a failure.
client = AsyncOpenAI(
    api_key=settings.groq_api_key,
    base_url="https://api.groq.com/openai/v1",
    timeout=30.0,
    max_retries=2,
)


class LLMUnavailableError(Exception):
    """Raised when the underlying LLM call fails after the SDK's own
    retries are exhausted (timeout, rate limit, connection error, or an
    API-side error) — callers catch this specifically rather than a bare
    Exception, so a real bug elsewhere in this module still surfaces as
    itself instead of being folded into "the AI is unavailable". The
    original openai.OpenAIError is logged in full here (model, real
    exception type/message) since that detail is what an on-call
    engineer needs to tell "actually down" apart from "misconfigured
    model/API key" — callers only need to know it failed, not why."""


async def _create(model: str, **kwargs):
    try:
        return await client.chat.completions.create(model=model, **kwargs)
    except openai.OpenAIError as e:
        logger.error("LLM call failed for model %s: %s: %s", model, type(e).__name__, e)
        raise LLMUnavailableError(f"LLM call failed for model {model}") from e

async def complete(model: str, system: str, user: str, max_tokens: int = 1024, usage_sink: list | None = None) -> str:
    resp = await _create(
        model,
        max_tokens=max_tokens,
        temperature=0.0,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
    )
    if usage_sink is not None and resp.usage:
        usage_sink.append({
            "model": model,
            "input_tokens": resp.usage.prompt_tokens,
            "output_tokens": resp.usage.completion_tokens,
        })
    return resp.choices[0].message.content

async def complete_json(model: str, system: str, user: str, max_tokens: int = 512, usage_sink: list | None = None) -> dict:
    resp = await _create(
        model,
        max_tokens=max_tokens,
        temperature=0.0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
    )
    if usage_sink is not None and resp.usage:
        usage_sink.append({
            "model": model,
            "input_tokens": resp.usage.prompt_tokens,
            "output_tokens": resp.usage.completion_tokens,
        })
    text = resp.choices[0].message.content
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError(f"No JSON object found in model output: {text!r}")
        return json.loads(match.group(0))
