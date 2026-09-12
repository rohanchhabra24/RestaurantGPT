"""compensation_rules.evaluate_order computes the amount that actually gets
persisted to compensation_claims — money-affecting logic, so it's covered
here directly rather than only indirectly through the LLM pipeline.
"""

import pytest

from app.services.compensation_rules import PolicyParams, evaluate_order

BASE_ORDER = {
    "total_amount": 500.0,
    "sla_target_seconds": 2400,
}


def test_customer_cancelled_predispatch_excluded():
    order = {**BASE_ORDER, "cancellation_reason": "customer_cancelled_predispatch"}
    result = evaluate_order(order)
    assert result.eligible is False


def test_weather_delay_over_threshold_eligible():
    order = {**BASE_ORDER, "cancellation_reason": "weather_delay", "delivery_time_seconds": 2400 + 20 * 60}
    result = evaluate_order(order)
    assert result.eligible is True
    assert result.amount == pytest.approx(40.0 + 0.5 * 500.0)


def test_weather_delay_under_threshold_not_eligible():
    order = {**BASE_ORDER, "cancellation_reason": "weather_delay", "delivery_time_seconds": 2400 + 5 * 60}
    result = evaluate_order(order)
    assert result.eligible is False


def test_courier_no_show_always_eligible():
    order = {**BASE_ORDER, "cancellation_reason": "courier_no_show", "delivery_time_seconds": None}
    result = evaluate_order(order)
    assert result.eligible is True
    assert result.amount == pytest.approx(500.0)  # 100% of order value


def test_restaurant_closed_early_over_threshold_eligible():
    order = {**BASE_ORDER, "cancellation_reason": "restaurant_closed_early", "delivery_time_seconds": 2400 + 15 * 60}
    result = evaluate_order(order)
    assert result.eligible is True
    assert result.amount == pytest.approx(0.25 * 500.0)


def test_unknown_reason_not_eligible():
    order = {**BASE_ORDER, "cancellation_reason": "something_else", "delivery_time_seconds": None}
    result = evaluate_order(order)
    assert result.eligible is False


def test_missing_total_amount_defaults_to_zero():
    order = {"sla_target_seconds": 2400, "cancellation_reason": "courier_no_show"}
    result = evaluate_order(order)
    assert result.amount == 0.0


def test_custom_params_change_the_amount():
    params = PolicyParams(courier_no_show_pct_of_value=0.5)
    order = {**BASE_ORDER, "cancellation_reason": "courier_no_show"}
    result = evaluate_order(order, params)
    assert result.amount == pytest.approx(0.5 * 500.0)
