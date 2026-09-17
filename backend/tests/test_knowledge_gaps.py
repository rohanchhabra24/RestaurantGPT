from datetime import datetime, timedelta, timezone

from app.routers.insights import _normalize_question, cluster_gaps


def test_normalize_collapses_punctuation_case_and_whitespace():
    assert _normalize_question("What's your refund policy?") == "whats your refund policy"
    assert _normalize_question("  what's   your refund policy  ") == "whats your refund policy"
    assert _normalize_question("WHAT'S YOUR REFUND POLICY?") == "whats your refund policy"


def test_normalize_empty_or_punctuation_only_returns_empty():
    assert _normalize_question("   ") == ""
    assert _normalize_question("???") == ""


def test_cluster_groups_near_duplicate_phrasings():
    now = datetime.now(timezone.utc)
    rows = [
        ("What's your refund policy?", now),
        ("what's your refund policy", now - timedelta(hours=1)),
        ("WHAT'S YOUR REFUND POLICY", now - timedelta(hours=2)),
        ("Do you deliver to Zone 5?", now - timedelta(hours=3)),
    ]
    gaps = cluster_gaps(rows)
    assert len(gaps) == 2
    assert gaps[0]["occurrences"] == 3
    assert gaps[0]["example_question"] == "What's your refund policy?"
    assert gaps[1]["occurrences"] == 1


def test_cluster_ranks_by_occurrences_then_recency():
    now = datetime.now(timezone.utc)
    rows = [
        ("a", now - timedelta(hours=5)),
        ("b", now - timedelta(hours=1)),
        ("b", now - timedelta(hours=2)),
    ]
    gaps = cluster_gaps(rows)
    # "b" has 2 occurrences vs "a"'s 1 -> ranks first regardless of recency
    assert gaps[0]["example_question"] == "b"
    assert gaps[0]["occurrences"] == 2
    assert gaps[1]["example_question"] == "a"


def test_cluster_tracks_first_and_last_seen():
    t1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    t2 = datetime(2026, 1, 5, tzinfo=timezone.utc)
    t3 = datetime(2026, 1, 3, tzinfo=timezone.utc)
    gaps = cluster_gaps([("repeat me", t1), ("repeat me", t2), ("repeat me", t3)])
    assert gaps[0]["first_seen"] == t1
    assert gaps[0]["last_seen"] == t2


def test_cluster_respects_limit():
    now = datetime.now(timezone.utc)
    rows = [(f"unique question {i}", now) for i in range(30)]
    gaps = cluster_gaps(rows)
    assert len(gaps) == 20


def test_cluster_empty_input_returns_empty_list():
    assert cluster_gaps([]) == []
