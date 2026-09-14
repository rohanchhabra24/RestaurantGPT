"""Shared synthetic-order generation core — the same distributions
seed/generate_demo_csv.py uses for the big historical demo CSV, factored
out so the Live Feed integration (demo_feed.py's API endpoint) can
generate one day at a time instead of duplicating this logic. Both call
sites produce rows in the exact shape ingestion.py already expects
(same fields as orders_sample.csv), so there's one place these
distributions live, not two copies that can drift apart.

Not a claim about any real restaurant — this is clearly-synthetic demo
data, generated deterministically from (date, seed) so the same day
always reproduces the same rows on repeat calls (useful for testing and
for making a re-run of a sync idempotent-in-content, even though the
actual idempotency guarantee comes from the DB's unique constraint on
(restaurant_id, aggregator_order_id) — see live_feed_sync.py).
"""

import random
from datetime import date as date_cls, datetime, timedelta

ZONES = ["Zone 1", "Zone 2", "Zone 3"]
ZONE_WEIGHTS = [0.32, 0.33, 0.35]
PLATFORMS = ["swiggy", "zomato"]
PLATFORM_WEIGHTS = [0.55, 0.45]

BASE_CANCEL_REASONS = [
    ("customer_cancelled_predispatch", 0.26),
    ("courier_no_show", 0.18),
    ("item_unavailable", 0.16),
    ("kitchen_overload", 0.12),
    ("restaurant_closed_early", 0.09),
    ("address_issue", 0.07),
    ("weather_delay", 0.06),
    ("payment_failed", 0.04),
    ("restaurant_rejected", 0.02),
]

# Meal-rush shape: relative order volume by hour of day — two sharp peaks
# (lunch, dinner), not a flat distribution across hours.
HOUR_WEIGHTS = [
    0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.6,
    0.9, 1.0, 0.9, 1.3, 2.6, 3.0, 2.2, 1.1,
    1.0, 1.3, 2.0, 3.2, 3.6, 3.0, 2.0, 1.0,
]
WEEKDAY_MULT = [1.0, 0.95, 0.95, 1.0, 1.15, 1.3, 1.2]  # Mon..Sun, Fri/Sat/Sun busier

DEFAULT_ORDERS_PER_DAY_RANGE = (35, 70)


def weighted_choice(rng, items, weights):
    return rng.choices(items, weights=weights, k=1)[0]


def generate_one_order(rng, order_id, placed_at, is_weather_day, allow_in_progress, now):
    """One order's full field set. `now` bounds in-progress/future-order
    logic — pass the actual current time when placed_at could be "today"
    (allow_in_progress=True), or anything >= placed_at otherwise (the
    live feed always generates a past day, so allow_in_progress=False and
    `now` is unused for that path beyond satisfying the signature).
    """
    zone = weighted_choice(rng, ZONES, ZONE_WEIGHTS)
    platform = weighted_choice(rng, PLATFORMS, PLATFORM_WEIGHTS)

    # Rain hits Zone 3 hardest — matches the seeded demo narrative
    # (seed.py / generate_demo_csv.py) so a diagnostic question or the
    # anomaly scan has a real, consistent signal to find regardless of
    # which generator produced the data.
    weather_flag = False
    zone_weather_severity = 0.0
    if is_weather_day:
        if zone == "Zone 3":
            weather_flag = rng.random() < 0.85
            zone_weather_severity = 1.0
        else:
            weather_flag = rng.random() < 0.35
            zone_weather_severity = 0.35

    amount = round(rng.gammavariate(4.2, 78))
    amount = max(99, min(amount, 2400))

    hour = placed_at.hour
    rush_load = HOUR_WEIGHTS[hour] / 3.6
    prep_s = round(rng.uniform(360, 1100) * (1 + 0.35 * rush_load))

    can_be_in_progress = allow_in_progress and (now - placed_at) < timedelta(minutes=110)

    cancel_prob = 0.09 + 0.11 * zone_weather_severity
    is_cancelled = (not can_be_in_progress) and rng.random() < cancel_prob

    status = "delivered"
    delivery_s = None
    reason = None

    if can_be_in_progress and rng.random() < 0.55:
        status = "in_progress"
    elif is_cancelled:
        status = "cancelled"
        if is_weather_day and zone_weather_severity > 0 and rng.random() < 0.7:
            reason = "weather_delay"
        else:
            reasons, weights = zip(*BASE_CANCEL_REASONS)
            reason = weighted_choice(rng, list(reasons), list(weights))
        if reason != "customer_cancelled_predispatch":
            travel_s = rng.uniform(700, 1500) * (1 + 0.9 * zone_weather_severity)
            delivery_s = round(prep_s + travel_s)
    else:
        travel_s = rng.uniform(650, 1350) * (1 + 0.55 * zone_weather_severity)
        delivery_s = round(prep_s + travel_s)

    return {
        "order_id": str(order_id),
        "placed_at": placed_at.strftime("%Y-%m-%dT%H:%M:%S"),
        "zone": zone,
        "platform": platform,
        "status": status,
        "total_amount": amount,
        "prep_time_seconds": prep_s if status != "in_progress" else round(prep_s * rng.uniform(0.3, 0.9)),
        "delivery_time_seconds": delivery_s,
        "cancellation_reason": reason,
        "weather_flag": weather_flag,
    }


def generate_day(day: date_cls, seed_extra: str = "", orders_per_day_range=DEFAULT_ORDERS_PER_DAY_RANGE) -> list[dict]:
    """One day's worth of orders. Deterministic in (day, seed_extra) — the
    same day always reproduces the same rows, which is what lets
    demo_feed.py's endpoint be safely re-fetched without the caller
    worrying about getting a different answer each time.

    `seed_extra` lets two different callers (e.g. two demo restaurants)
    get distinct-but-stable data for the same calendar day instead of
    identical rows — pass something caller-specific (a restaurant id) if
    that matters to you; the default (empty) is fine for a single-feed demo.
    """
    rng = random.Random(f"{day.isoformat()}:{seed_extra}")
    now = datetime.combine(day, datetime.min.time())  # a past day — nothing is "in progress"

    weekday = day.weekday()
    is_weather_day = rng.random() < 0.15
    base_count = rng.randint(*orders_per_day_range)
    count = max(3, round(base_count * WEEKDAY_MULT[weekday]))

    order_seq = 900_000 + rng.randint(0, 5000)  # distinct numeric range from the bulk CSV generator's 480k+ ids
    rows = []
    for _ in range(count):
        hour = weighted_choice(rng, list(range(24)), HOUR_WEIGHTS)
        minute = rng.randint(0, 59)
        placed_at = now.replace(hour=hour, minute=minute, second=rng.randint(0, 59))
        order_seq += rng.randint(1, 6)
        rows.append(generate_one_order(rng, order_seq, placed_at, is_weather_day, allow_in_progress=False, now=now))

    rows.sort(key=lambda r: r["placed_at"])
    return rows
