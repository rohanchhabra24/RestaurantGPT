import json
import re
from openai import AsyncOpenAI
from app.config import settings

client = AsyncOpenAI(
    api_key=settings.groq_api_key,
    base_url="https://api.groq.com/openai/v1"
)

async def complete(model: str, system: str, user: str, max_tokens: int = 1024, usage_sink: list | None = None) -> str:
    resp = await client.chat.completions.create(
        model=model,
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
    resp = await client.chat.completions.create(
        model=model,
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
