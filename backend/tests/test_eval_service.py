"""score_case and gate_for_language are the pure-logic core of the eval
harness (routing/grounding/numeral scoring, and the Stage 2F multilingual
release-gate tolerance math) — covered directly here since run_case and
run_multilingual_gate themselves need a live DB + Claude API to run.
"""

import pytest

from app.services.eval_service import LANGUAGE_TOLERANCE, gate_for_language, score_case

BASE_CASE = {
    "expected_route": "SQL",
    "response_language": "english",
}


def test_score_case_all_ok_passes():
    result = score_case(
        BASE_CASE,
        route_taken="SQL",
        grounding_verdict="grounded",
        answer_text="Average delivery time was 28 minutes [#4021].",
    )
    assert result["passed"] is True
    assert result["route_ok"] is True
    assert result["grounded_ok"] is True
    assert result["numerals_ok"] is True


def test_score_case_wrong_route_fails():
    result = score_case(BASE_CASE, route_taken="RETRIEVAL", grounding_verdict="grounded", answer_text="x")
    assert result["route_ok"] is False
    assert result["passed"] is False


def test_score_case_expected_route_none_always_route_ok():
    case = {**BASE_CASE, "expected_route": None}
    result = score_case(case, route_taken="HYBRID", grounding_verdict="grounded", answer_text="x")
    assert result["route_ok"] is True


def test_score_case_ungrounded_fails():
    result = score_case(BASE_CASE, route_taken="SQL", grounding_verdict="ungrounded", answer_text="x")
    assert result["grounded_ok"] is False
    assert result["passed"] is False


@pytest.mark.parametrize("verdict", ["grounded", "no_claims", "partial"])
def test_score_case_non_ungrounded_verdicts_are_grounded_ok(verdict):
    result = score_case(BASE_CASE, route_taken="SQL", grounding_verdict=verdict, answer_text="x")
    assert result["grounded_ok"] is True


def test_score_case_content_check_requires_any_match():
    case = {**BASE_CASE, "answer_should_contain_any": ["not eligible", "excluded"]}
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="This order is excluded.")
    assert result["content_ok"] is True

    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="This order qualifies.")
    assert result["content_ok"] is False
    assert result["passed"] is False


def test_score_case_english_ignores_devanagari_check():
    # numerals_ok only applies to response_language == "hindi" — an English
    # case with (nonsensical, but hypothetical) Devanagari digits shouldn't
    # be penalized for it.
    result = score_case(BASE_CASE, route_taken="SQL", grounding_verdict="grounded", answer_text="₹५६० was refunded.")
    assert result["numerals_ok"] is True


def test_score_case_hindi_devanagari_digits_fail_numerals():
    case = {**BASE_CASE, "response_language": "hindi"}
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="कुल राशि ₹५६० थी।")
    assert result["numerals_ok"] is False
    assert result["passed"] is False


def test_score_case_hindi_arabic_digits_pass_numerals():
    case = {**BASE_CASE, "response_language": "hindi"}
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="कुल राशि ₹560 थी।")
    assert result["numerals_ok"] is True
    assert result["passed"] is True


def test_score_case_no_expected_sql_result_defaults_ok():
    # Cases without expected_sql_result (the vast majority) shouldn't be
    # penalized for it, and don't need to pass sql_rows at all.
    result = score_case(BASE_CASE, route_taken="SQL", grounding_verdict="grounded", answer_text="x")
    assert result["sql_result_ok"] is True
    assert result["passed"] is True


def test_score_case_row_count_match_passes():
    case = {**BASE_CASE, "expected_sql_result": {"row_count": 2}}
    rows = [{"aggregator_order_id": "1"}, {"aggregator_order_id": "2"}]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is True
    assert result["passed"] is True


def test_score_case_row_count_mismatch_fails():
    case = {**BASE_CASE, "expected_sql_result": {"row_count": 6}}
    rows = [{"aggregator_order_id": "1"}]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is False
    assert result["passed"] is False


def test_score_case_any_value_equals_finds_value_regardless_of_column_name():
    # The LLM could phrase the aggregate as "count", "total", "n" — any
    # column name — so this deliberately doesn't bind to one.
    case = {**BASE_CASE, "expected_sql_result": {"any_value_equals": 2}}
    rows = [{"weather_cancellations": 2}]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is True


def test_score_case_any_value_equals_not_found_fails():
    case = {**BASE_CASE, "expected_sql_result": {"any_value_equals": 2}}
    rows = [{"count": 5}]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is False
    assert result["passed"] is False


def test_score_case_any_value_equals_ignores_non_numeric_cells():
    # A row with a mix of numeric and non-numeric columns (e.g. a zone
    # name alongside a count) shouldn't raise on the non-numeric ones.
    case = {**BASE_CASE, "expected_sql_result": {"any_value_equals": 2}}
    rows = [{"zone": "Zone 3", "weather_cancellations": 2}]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is True


def test_score_case_min_row_count_floor_passes_when_exceeded():
    # The floor variant — what golden_set.json's real cases actually use,
    # since seed.py's randomly-generated spread can add extra rows beyond
    # the fixed deterministic set (see _sql_result_matches's docstring).
    case = {**BASE_CASE, "expected_sql_result": {"min_row_count": 6}}
    rows = [{"id": i} for i in range(9)]  # 3 extra from the random spread
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is True


def test_score_case_min_row_count_floor_fails_when_under():
    case = {**BASE_CASE, "expected_sql_result": {"min_row_count": 6}}
    rows = [{"id": i} for i in range(4)]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is False


def test_score_case_any_value_at_least_passes_when_exceeded():
    case = {**BASE_CASE, "expected_sql_result": {"any_value_at_least": 2}}
    rows = [{"weather_cancellations": 5}]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is True


def test_score_case_any_value_at_least_fails_when_under():
    case = {**BASE_CASE, "expected_sql_result": {"any_value_at_least": 2}}
    rows = [{"weather_cancellations": 1}]
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x", sql_rows=rows)
    assert result["sql_result_ok"] is False


def test_score_case_sql_rows_defaults_to_empty_when_not_passed():
    # A case that expects a SQL result but the caller forgot to pass
    # sql_rows should fail closed (empty rows), not silently pass.
    case = {**BASE_CASE, "expected_sql_result": {"row_count": 1}}
    result = score_case(case, route_taken="SQL", grounding_verdict="grounded", answer_text="x")
    assert result["sql_result_ok"] is False


def test_gate_english_is_always_baseline():
    gate = gate_for_language("english", pass_rate=0.9, baseline=0.9)
    assert gate == {"pass_rate": 0.9, "cleared": True, "reason": "baseline"}


def test_gate_within_tolerance_clears():
    baseline = 0.9
    pass_rate = baseline - LANGUAGE_TOLERANCE  # exactly at the boundary
    gate = gate_for_language("hindi", pass_rate=pass_rate, baseline=baseline)
    assert gate["cleared"] is True
    assert gate["delta_from_baseline"] == pytest.approx(LANGUAGE_TOLERANCE)


def test_gate_beyond_tolerance_blocks():
    baseline = 0.9
    pass_rate = baseline - LANGUAGE_TOLERANCE - 0.01
    gate = gate_for_language("hinglish", pass_rate=pass_rate, baseline=baseline)
    assert gate["cleared"] is False
    assert "exceeds" in gate["reason"]


def test_gate_language_beating_baseline_clears():
    gate = gate_for_language("hindi", pass_rate=1.0, baseline=0.8)
    assert gate["cleared"] is True
    assert gate["delta_from_baseline"] == pytest.approx(-0.2)
