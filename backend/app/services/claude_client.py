import json
import re

from anthropic import AsyncAnthropic

from app.config import settings

client = AsyncAnthropic(api_key=settings.anthropic_api_key)


async def complete(model: str, system: str, user: str, max_tokens: int = 1024, usage_sink: list | None = None) -> str:
    """`usage_sink`, when given a list, gets a {"model", "input_tokens",
    "output_tokens"} dict appended — this is how pipeline.py accumulates
    real per-query cost across several calls without every call site
    having to unpack a usage object it doesn't otherwise need."""
    resp = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    if usage_sink is not None:
        usage_sink.append({
            "model": model,
            "input_tokens": resp.usage.input_tokens,
            "output_tokens": resp.usage.output_tokens,
        })
    return "".join(block.text for block in resp.content if block.type == "text")


async def complete_json(model: str, system: str, user: str, max_tokens: int = 512, usage_sink: list | None = None) -> dict:
    """Ask for a single JSON object back and parse it defensively — models
    occasionally wrap JSON in prose or a code fence despite instructions."""
    text = await complete(model, system, user, max_tokens, usage_sink=usage_sink)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in model output: {text!r}")
    return json.loads(match.group(0))
