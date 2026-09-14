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

# Shared with the Live Feed integration (app/services/demo_order_generator.py,
# used by app/routers/demo_feed.py) — one set of distributions/per-order
# logic instead of two copies that can drift apart. This script's own job
# is just the day-range loop and the multi-day weather-event scatter,
# which the live feed's single-day generator doesn't need.
from app.services.demo_order_generator import (
    HOUR_WEIGHTS,
    WEEKDAY_MULT,
    generate_one_order,
    weighted_choice,
)

SLA_TARGET_S = 2400  # 40 min — matches compensation_rules.py's SLA target


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

            # Whether this order is even still "in flight" — only possible
            # for the last couple of hours of the whole range.
            order_seq += rng.randint(1, 6)
            row = generate_one_order(rng, order_seq, placed_at, is_weather_day, allow_in_progress=day_offset == 0, now=now)
            # CSV needs string-typed cells; generate_one_order returns native
            # None/bool (correct for demo_feed.py's JSON response) — convert
            # here rather than changing what that function returns.
            row["delivery_time_seconds"] = row["delivery_time_seconds"] if row["delivery_time_seconds"] is not None else ""
            row["cancellation_reason"] = row["cancellation_reason"] or ""
            row["weather_flag"] = "true" if row["weather_flag"] else "false"
            rows.append(row)

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
