from app.services.pricing import estimate_cost_usd


def test_known_model_cost():
    # claude-sonnet-5: $2.00/$10.00 per MTok input/output
    cost = estimate_cost_usd("claude-sonnet-5", input_tokens=1_000_000, output_tokens=1_000_000)
    assert cost == 12.00


def test_zero_tokens_costs_nothing():
    assert estimate_cost_usd("claude-sonnet-5", 0, 0) == 0.0


def test_unknown_model_costs_nothing_rather_than_raising():
    assert estimate_cost_usd("some-future-model-not-in-the-table", 1000, 1000) == 0.0
