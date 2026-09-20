"""_serialize (routers/orders.py) is what turns a joined orders/
compensation_claims/policy_chunks row into the JSON the Dashboard reads.
Added during a pass that started persisting a claim's reason/clause
(previously computed at draft time and thrown away — see migration 015)
and surfacing them as a real, clickable citation into the policy text,
reusing the same Citation shape grounding.py already builds for chat
answers. Pure-function tests — no DB needed, just a fake joined row.
"""

from datetime import datetime, timezone

from app.routers.orders import _serialize

BASE_ROW = {
    "id": "11111111-1111-1111-1111-111111111111",
    "aggregator_order_id": "4021",
    "placed_at": datetime(2026, 9, 15, 14, 0, tzinfo=timezone.utc),
    "zone": "Zone 1",
    "platform": "swiggy",
    "status": "cancelled",
    "total_amount": 300.0,
    "prep_time_seconds": 600,
    "delivery_time_seconds": 3600,
    "sla_target_seconds": 2400,
    "is_cancelled": True,
    "cancellation_reason": "weather_delay",
    "is_refunded": False,
    "refund_amount": None,
    "weather_flag": True,
    "claim_id": None,
    "claim_status": None,
    "claim_amount": None,
    "claim_reason": None,
    "claim_clause": None,
    "claim_chunk_id": None,
    "claim_chunk_section_label": None,
    "claim_chunk_text": None,
    "claim_chunk_source_name": None,
}


def test_no_claim_is_none():
    order = _serialize(dict(BASE_ROW))
    assert order["claim"] is None
    # Still eligible (computed live) — weather_delay with delay > threshold
    assert order["eligible"] is True


def test_claim_with_linked_policy_chunk_gets_a_citation():
    row = dict(BASE_ROW, **{
        "claim_id": "22222222-2222-2222-2222-222222222222",
        "claim_status": "drafted",
        "claim_amount": 190.0,
        "claim_reason": "Weather delay of 20 min exceeds the 15 min threshold.",
        "claim_clause": "§4.2 Weather & Force Majeure",
        "claim_chunk_id": "33333333-3333-3333-3333-333333333333",
        "claim_chunk_section_label": "SLA Policy §4.2",
        "claim_chunk_text": "In the event of weather delays exceeding 15 minutes...",
        "claim_chunk_source_name": "sla_policy_v3.md",
    })
    order = _serialize(row)

    assert order["claim"]["computed_amount"] == 190.0
    assert order["claim"]["reason"] == "Weather delay of 20 min exceeds the 15 min threshold."
    assert order["claim"]["clause"] == "§4.2 Weather & Force Majeure"

    citation = order["claim"]["citation"]
    assert citation["type"] == "policy"
    assert citation["ref_id"] == "33333333-3333-3333-3333-333333333333"
    assert citation["label"] == "SLA Policy §4.2"
    assert citation["verified"] is True
    assert citation["detail"] == {
        "section_label": "SLA Policy §4.2",
        "source_name": "sla_policy_v3.md",
        "chunk_text": "In the event of weather delays exceeding 15 minutes...",
    }


def test_claim_with_no_linked_chunk_has_no_citation():
    # Can happen if hybrid_search found nothing at draft time — the claim
    # (amount, reason, clause) still exists, it just has nothing to link to.
    row = dict(BASE_ROW, **{
        "claim_id": "22222222-2222-2222-2222-222222222222",
        "claim_status": "drafted",
        "claim_amount": 190.0,
        "claim_reason": "Weather delay of 20 min exceeds the 15 min threshold.",
        "claim_clause": "§4.2 Weather & Force Majeure",
    })
    order = _serialize(row)
    assert order["claim"]["citation"] is None
    assert order["claim"]["clause"] == "§4.2 Weather & Force Majeure"


def test_citation_label_falls_back_to_clause_when_chunk_has_no_section_label():
    row = dict(BASE_ROW, **{
        "claim_id": "22222222-2222-2222-2222-222222222222",
        "claim_status": "drafted",
        "claim_amount": 190.0,
        "claim_reason": "Weather delay of 20 min exceeds the 15 min threshold.",
        "claim_clause": "§4.2 Weather & Force Majeure",
        "claim_chunk_id": "33333333-3333-3333-3333-333333333333",
        "claim_chunk_section_label": None,
        "claim_chunk_text": "In the event of weather delays exceeding 15 minutes...",
        "claim_chunk_source_name": "sla_policy_v3.md",
    })
    order = _serialize(row)
    assert order["claim"]["citation"]["label"] == "§4.2 Weather & Force Majeure"
