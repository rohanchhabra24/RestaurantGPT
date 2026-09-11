import json
import re

from anthropic import AsyncAnthropic

from app.config import settings

client = AsyncAnthropic(api_key=settings.anthropic_api_key)


async def complete(model: str, system: str, user: str, max_tokens: int = 1024) -> str:
    resp = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in resp.content if block.type == "text")


async def complete_json(model: str, system: str, user: str, max_tokens: int = 512) -> dict:
    """Ask for a single JSON object back and parse it defensively — models
    occasionally wrap JSON in prose or a code fence despite instructions."""
    text = await complete(model, system, user, max_tokens)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in model output: {text!r}")
    return json.loads(match.group(0))
