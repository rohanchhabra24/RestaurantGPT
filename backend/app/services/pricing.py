"""Per-model $/MTok rates for cost tracking. Anthropic first-party API
pricing (checked against the current models table — update if pricing
changes)."""

RATES_PER_MTOK = {
    "claude-sonnet-5": {"input": 2.00, "output": 10.00},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
}


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = RATES_PER_MTOK.get(model)
    if rates is None:
        return 0.0
    return round((input_tokens / 1_000_000) * rates["input"] + (output_tokens / 1_000_000) * rates["output"], 6)
