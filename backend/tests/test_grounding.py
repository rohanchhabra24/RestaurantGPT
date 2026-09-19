from app.services.grounding import strip_citation_markers, verify_citations

WEATHER_EVIDENCE = [
    {"date": "2026-09-15", "condition": "slight rain", "is_rainy": True, "precipitation_mm": 12.4},
    {"date": "2026-09-16", "condition": "clear sky", "is_rainy": False, "precipitation_mm": 0.0},
]


def test_weather_citation_matching_real_evidence_is_verified():
    answer = "It rained on 2026-09-15 [WEATHER:2026-09-15], which likely delayed deliveries."
    citations, verdict, coverage = verify_citations(answer, [], [], weather_evidence=WEATHER_EVIDENCE)
    assert verdict == "grounded"
    assert coverage == 1.0
    assert citations[0].type == "weather"
    assert citations[0].verified is True
    assert citations[0].detail == WEATHER_EVIDENCE[0]


def test_weather_citation_for_unfetched_date_is_not_verified():
    # The model cited a date that was never independently looked up this
    # turn — this is exactly the hallucination this feature exists to catch.
    answer = "It rained on 2026-09-20 [WEATHER:2026-09-20]."
    citations, verdict, coverage = verify_citations(answer, [], [], weather_evidence=WEATHER_EVIDENCE)
    assert verdict == "ungrounded"
    assert coverage == 0.0
    assert citations[0].verified is False
    assert citations[0].detail is None


def test_weather_citation_with_no_evidence_at_all_is_not_verified():
    # No weather lookups happened this turn (e.g. no restaurant location
    # configured) but the model cited weather anyway -> must fail, not
    # silently pass because weather_evidence was never provided.
    answer = "It rained that day [WEATHER:2026-09-15]."
    citations, verdict, coverage = verify_citations(answer, [], [], weather_evidence=None)
    assert verdict == "ungrounded"
    assert citations[0].verified is False


def test_mixed_order_and_weather_citations_partial_when_one_is_wrong():
    orders = [{"aggregator_order_id": "4021", "total_amount": 320}]
    answer = "Order [ORDER:4021] was delayed due to rain [WEATHER:2026-09-20]."
    citations, verdict, coverage = verify_citations(answer, orders, [], weather_evidence=WEATHER_EVIDENCE)
    assert verdict == "partial"
    assert coverage == 0.5
    by_type = {c.type: c.verified for c in citations}
    assert by_type["order"] is True
    assert by_type["weather"] is False


def test_mixed_order_and_weather_citations_grounded_when_both_correct():
    orders = [{"aggregator_order_id": "4021", "total_amount": 320}]
    answer = "Order [ORDER:4021] was delayed due to rain [WEATHER:2026-09-15]."
    citations, verdict, coverage = verify_citations(answer, orders, [], weather_evidence=WEATHER_EVIDENCE)
    assert verdict == "grounded"
    assert coverage == 1.0


def test_strip_citation_markers_removes_weather_markers():
    text = "It rained [WEATHER:2026-09-15] and order [ORDER:4021] was late per [POLICY:abc123]."
    stripped = strip_citation_markers(text)
    assert "[WEATHER:" not in stripped
    assert "[ORDER:" not in stripped
    assert "[POLICY:" not in stripped
    assert "It rained" in stripped and "was late" in stripped
