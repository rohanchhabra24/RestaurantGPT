"""Generates a large, statistically realistic order-history CSV for demoing
the app at scale (thousands of rows, same schema as orders_sample.csv)
instead of that file's 10 hand-picked rows.

This isn't just noise at volume — it reproduces the same demo narrative
seed.py already tells (a multi-day rain event that slows deliveries and
spikes cancellations specifically in Zone 3), so uploading this file and
then asking "why did delivery times spike in Zone 3?" or running the
anomaly scan actually has a real signal to find, and the SLA/compensation
flow has real eligible cancellations to work with — not just a bigger
pile of random numbers.

Dates are relative to "now" (like seed.py), so the file stays useful
whenever it's regenerated rather than going stale. Run from backend/:

    python -m seed.generate_demo_csv
    python -m seed.generate_demo_csv --days 120 --out seed/orders_demo_big.csv
"""

import argparse
import csv
import random
from datetime import datetime, timedelta, timezone

ZONES = ["Zone 1", "Zone 2", "Zone 3"]
ZONE_WEIGHTS = [0.32, 0.33, 0.35]
PLATFORMS = ["swiggy", "zomato"]
PLATFORM_WEIGHTS = [0.55, 0.45]

# Baseline cancellation mix on an ordinary day (weights, not percentages —
# normalized at selection time). weather_delay is deliberately non-trivial
# even at baseline (rain happens outside the flagged "event" days too);
# it just dominates the mix *during* an event, handled separately below.
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

SLA_TARGET_S = 2400  # 40 min — matches compensation_rules.py's SLA target

# Meal-rush shape: relative order volume by hour of day (24 values). Real
# delivery platforms see two sharp peaks (lunch, dinner) and a long
# overnight trough, not a flat distribution across hours.
HOUR_WEIGHTS = [
    0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.6,   # 0–7: overnight → early breakfast trickle
    0.9, 1.0, 0.9, 1.3, 2.6, 3.0, 2.2, 1.1,       # 8–15: breakfast, lunch rush (12–13), taper
    1.0, 1.3, 2.0, 3.2, 3.6, 3.0, 2.0, 1.0,       # 16–23: evening build, dinner rush (19–20), wind-down
]
# Weekend volume multiplier (Fri/Sat/Sun busier — index 4,5,6 = Fri,Sat,Sun
# for a Monday=0 week).
WEEKDAY_MULT = [1.0, 0.95, 0.95, 1.0, 1.15, 1.3, 1.2]


def weighted_choice(rng, items, weights):
    return rng.choices(items, weights=weights, k=1)[0]


def pick_weather_events(rng, days):
    """A handful of multi-day rain spells scattered through the range,
    rather than isolated random days — real weather doesn't arrive as
    independent single-day coin flips."""
    events = []
    day = 6
    while day < days - 3:
        if rng.random() < 0.16:
            length = rng.choice([1, 1, 2, 2, 3])
            events.append((day, min(day + length, days - 1)))
            day += length + rng.randint(8, 20)
        else:
            day += 1
    return events


def in_any_event(day_index, events):
    return any(start <= day_index <= end for start, end in events)


def generate_rows(rng, days, orders_per_day_range, now):
    weather_events = pick_weather_events(rng, days)
    rows = []
    order_seq = 480_000 + rng.randint(0, 5000)  # a plausible-looking platform ID range, not 1/2/3…

    for day_offset in range(days, -1, -1):
        day_date = now - timedelta(days=day_offset)
        weekday = day_date.weekday()
        is_weather_day = in_any_event(days - day_offset, weather_events)

        base_count = rng.randint(*orders_per_day_range)
        count = max(3, round(base_count * WEEKDAY_MULT[weekday]))

        for _ in range(count):
            hour = weighted_choice(rng, list(range(24)), HOUR_WEIGHTS)
            minute = rng.randint(0, 59)
            placed_at = day_date.replace(hour=hour, minute=minute, second=rng.randint(0, 59), microsecond=0)
            if placed_at > now:
                continue  # don't generate future orders on the final ("today") day

            zone = weighted_choice(rng, ZONES, ZONE_WEIGHTS)
            platform = weighted_choice(rng, PLATFORMS, PLATFORM_WEIGHTS)

            # Rain hits Zone 3 hardest (the app's whole demo narrative is
            # built around this) and other zones somewhat less.
            weather_flag = False
            zone_weather_severity = 0.0
            if is_weather_day:
                if zone == "Zone 3":
                    weather_flag = rng.random() < 0.85
                    zone_weather_severity = 1.0
                else:
                    weather_flag = rng.random() < 0.35
                    zone_weather_severity = 0.35

            # Order value: right-skewed — lots of ₹200–450 solo/small
            # orders, a longer tail of bigger group orders.
            amount = round(rng.gammavariate(4.2, 78))
            amount = max(99, min(amount, 2400))

            # Prep time: rush hours load the kitchen more.
            rush_load = HOUR_WEIGHTS[hour] / 3.6
            prep_s = round(rng.uniform(360, 1100) * (1 + 0.35 * rush_load))

            # Whether this order is even still "in flight" — only possible
            # for the last couple of hours of the whole range.
            can_be_in_progress = day_offset == 0 and (now - placed_at) < timedelta(minutes=110)

            # Baseline cancellation rate ~9%, roughly doubling on a
            # weather-hit Zone 3 day — this is the spike a diagnostic
            # question or the anomaly scan should actually be able to find.
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
                # A pre-dispatch cancellation never accrued delivery time.
                if reason != "customer_cancelled_predispatch":
                    travel_s = rng.uniform(700, 1500) * (1 + 0.9 * zone_weather_severity)
                    delivery_s = round(prep_s + travel_s)
            else:
                status = "delivered"
                travel_s = rng.uniform(650, 1350) * (1 + 0.55 * zone_weather_severity)
                delivery_s = round(prep_s + travel_s)

            order_seq += rng.randint(1, 6)
            rows.append({
                "order_id": str(order_seq),
                "placed_at": placed_at.strftime("%Y-%m-%dT%H:%M:%S"),
                "zone": zone,
                "platform": platform,
                "status": status,
                "total_amount": amount,
                "prep_time_seconds": prep_s if status != "in_progress" else round(prep_s * rng.uniform(0.3, 0.9)),
                "delivery_time_seconds": delivery_s if delivery_s is not None else "",
                "cancellation_reason": reason or "",
                "weather_flag": "true" if weather_flag else "false",
            })

    rows.sort(key=lambda r: r["placed_at"])
    return rows, weather_events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=90, help="How many days of history to generate (default 90)")
    parser.add_argument("--min-per-day", type=int, default=35)
    parser.add_argument("--max-per-day", type=int, default=70)
    parser.add_argument("--seed", type=int, default=42, help="RNG seed — reproducible by default")
    parser.add_argument("--out", type=str, default=None, help="Output path (default: seed/orders_demo.csv next to this script)")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    rows, weather_events = generate_rows(rng, args.days, (args.min_per_day, args.max_per_day), now)

    out_path = args.out or (__file__.rsplit("/", 1)[0] + "/orders_demo.csv")
    fieldnames = ["order_id", "placed_at", "zone", "platform", "status", "total_amount",
                  "prep_time_seconds", "delivery_time_seconds", "cancellation_reason", "weather_flag"]
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    cancelled = sum(1 for r in rows if r["status"] == "cancelled")
    in_progress = sum(1 for r in rows if r["status"] == "in_progress")
    weather_rows = sum(1 for r in rows if r["weather_flag"] == "true")
    print(f"Wrote {len(rows)} rows to {out_path}")
    print(f"  delivered={len(rows) - cancelled - in_progress} cancelled={cancelled} in_progress={in_progress}")
    print(f"  weather_flag=true on {weather_rows} rows")
    print(f"  weather events (day offsets from range start): {weather_events}")


if __name__ == "__main__":
    main()
