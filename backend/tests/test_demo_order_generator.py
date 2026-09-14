"""generate_day is what both the bulk CSV generator (seed/generate_demo_csv.py)
and the Live Feed API endpoint (demo_feed.py) build on — covered directly
since it's pure (no DB/API) and its determinism is a real property other
code relies on (demo_feed.py documents a re-fetch of the same date as safe
specifically because of this).
"""

from datetime import date

from app.services.demo_order_generator import generate_day

A_MONDAY = date(2026, 9, 7)


def test_generate_day_returns_nonempty_rows():
    rows = generate_day(A_MONDAY)
    assert len(rows) > 0


def test_generate_day_is_deterministic_for_same_inputs():
    rows_a = generate_day(A_MONDAY)
    rows_b = generate_day(A_MONDAY)
    assert rows_a == rows_b


def test_generate_day_differs_by_date():
    rows_a = generate_day(A_MONDAY)
    rows_b = generate_day(date(2026, 9, 8))
    assert rows_a != rows_b


def test_generate_day_differs_by_seed_extra():
    rows_a = generate_day(A_MONDAY, seed_extra="restaurant-1")
    rows_b = generate_day(A_MONDAY, seed_extra="restaurant-2")
    assert rows_a != rows_b


def test_generate_day_rows_have_expected_fields():
    rows = generate_day(A_MONDAY)
    expected_keys = {
        "order_id", "placed_at", "zone", "platform", "status", "total_amount",
        "prep_time_seconds", "delivery_time_seconds", "cancellation_reason", "weather_flag",
    }
    for row in rows:
        assert set(row.keys()) == expected_keys
        assert row["status"] in ("delivered", "cancelled")  # never in_progress — always a past day
        assert 99 <= row["total_amount"] <= 2400
        assert isinstance(row["weather_flag"], bool)


def test_generate_day_no_order_ids_repeat_within_a_day():
    rows = generate_day(A_MONDAY)
    ids = [r["order_id"] for r in rows]
    assert len(ids) == len(set(ids))


def test_generate_day_cancelled_orders_have_a_reason():
    rows = generate_day(A_MONDAY)
    for row in rows:
        if row["status"] == "cancelled":
            assert row["cancellation_reason"] is not None
        else:
            assert row["cancellation_reason"] is None


def test_generate_day_rows_sorted_by_placed_at():
    rows = generate_day(A_MONDAY)
    timestamps = [r["placed_at"] for r in rows]
    assert timestamps == sorted(timestamps)
