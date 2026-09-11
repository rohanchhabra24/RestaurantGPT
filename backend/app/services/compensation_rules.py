"""Deterministic compensation eligibility — mirrors sla_policy_v3.md §4.
Amounts written into compensation_claims are money-affecting, so they're
computed here in plain Python rather than parsed out of an LLM's prose: the
grounded pipeline still explains a claim to the operator (see pipeline.py),
but the number that actually gets persisted never passes through a language
model at query time.

Rule *thresholds* are parameterized (PolicyParams) rather than hardcoded so
the same evaluation logic can run against two different policy versions —
that's what the Policy Change Impact Simulator (policy_impact.py) needs:
apply the old version's numbers and the new version's numbers to the same
historical orders and diff the outcome.

Nominal delivery fee: orders don't carry a separate delivery-fee column,
so a flat ₹40 is used for the §4.2 "delivery fee + 50% of order value"
clause — documented here rather than silently assumed.
"""

from dataclasses import dataclass

SLA_DEFAULT_SECONDS = 2400
NOMINAL_DELIVERY_FEE = 40.0


@dataclass
class PolicyParams:
    weather_min_delay_seconds: int = 15 * 60
    weather_pct_of_value: float = 0.5
    courier_no_show_pct_of_value: float = 1.0
    restaurant_min_delay_seconds: int = 10 * 60
    restaurant_pct_of_value: float = 0.25


DEFAULT_PARAMS = PolicyParams()


@dataclass
class EligibilityResult:
    eligible: bool
    clause: str | None
    clause_search_query: str | None
    amount: float | None
    reason: str


def evaluate_order(order: dict, params: PolicyParams = DEFAULT_PARAMS) -> EligibilityResult:
    reason_code = order.get("cancellation_reason")
    total_amount = float(order["total_amount"]) if order.get("total_amount") is not None else 0.0
    delivery_s = order.get("delivery_time_seconds")
    sla_s = order.get("sla_target_seconds") or SLA_DEFAULT_SECONDS
    delay_s = (delivery_s - sla_s) if delivery_s is not None else None

    if reason_code == "customer_cancelled_predispatch":
        return EligibilityResult(False, None, None, None, "Customer cancelled before dispatch — excluded under §4.5.")

    if reason_code == "weather_delay":
        if delay_s is not None and delay_s > params.weather_min_delay_seconds:
            amount = NOMINAL_DELIVERY_FEE + params.weather_pct_of_value * total_amount
            return EligibilityResult(True, "§4.2 Weather & Force Majeure", "weather force majeure delay compensation", amount,
                                      f"Weather delay of {delay_s // 60:.0f} min exceeds the {params.weather_min_delay_seconds // 60:.0f} min threshold.")
        return EligibilityResult(False, None, None, None, "Weather delay did not exceed the §4.2 threshold.")

    if reason_code == "courier_no_show":
        amount = params.courier_no_show_pct_of_value * total_amount
        return EligibilityResult(True, "§4.3 Courier No-Show", "courier no-show compensation", amount,
                                  "Courier no-show is eligible for compensation under §4.3.")

    if reason_code == "restaurant_closed_early":
        if delay_s is not None and delay_s > params.restaurant_min_delay_seconds:
            amount = params.restaurant_pct_of_value * total_amount
            return EligibilityResult(True, "§4.4 Restaurant-Caused Delay", "restaurant caused delay compensation", amount,
                                      f"Restaurant-caused delay of {delay_s // 60:.0f} min exceeds the {params.restaurant_min_delay_seconds // 60:.0f} min threshold.")
        return EligibilityResult(False, None, None, None, "Restaurant-caused delay did not exceed the §4.4 threshold.")

    return EligibilityResult(False, None, None, None, f"No compensation clause matches reason '{reason_code}'.")
