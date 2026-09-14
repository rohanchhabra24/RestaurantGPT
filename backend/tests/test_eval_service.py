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
