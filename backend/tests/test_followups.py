"""Suggested follow-up chips — deterministic, rule-based (see
followups.py's module docstring for why this isn't an extra LLM call).
"""

from app.services.followups import suggest


def test_clarify_and_greeting_get_no_suggestions():
    assert suggest("CLARIFY", "huh?") == []
    assert suggest("GREETING", "good morning") == []


def test_diagnostic_suggests_next_action():
    assert suggest("DIAGNOSTIC", "Why did delivery time spike in Zone 3?") == ["What should I do about this?"]


def test_compensation_keyword_suggests_the_sweep_flow():
    out = suggest("HYBRID", "Which cancelled orders are eligible for compensation?")
    assert "Check for recoverable compensation" in out


def test_retrieval_suggests_applying_to_a_specific_order():
    assert suggest("RETRIEVAL", "What counts as a late delivery?") == ["Does this apply to a specific order of mine?"]


def test_zone_slot_adds_cross_zone_comparison():
    out = suggest("SQL", "How many orders were cancelled in Zone 3?", {"zone": "Zone 3"})
    assert "How does this compare across all zones?" in out


def test_narrow_date_range_adds_last_week_comparison():
    out = suggest("SQL", "How many orders yesterday?", {"date_range": "yesterday"})
    assert "How does this compare to last week?" in out


def test_capped_at_two_suggestions():
    out = suggest("DIAGNOSTIC", "Why did Zone 3 spike, is it compensation eligible?", {"zone": "Zone 3"})
    assert len(out) <= 2


def test_plain_sql_lookup_with_no_slots_gets_nothing_forced():
    assert suggest("SQL", "How many orders do we have total?") == []
