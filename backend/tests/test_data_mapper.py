"""apply_mapping is the deterministic half of the Data Mapper — the LLM only
ever proposes structure (data_mapper.propose_mapping, not covered here since
it calls the API); everything that actually touches row values is pure and
tested directly.
"""

from app.services.data_mapper import (
    ColumnMapping,
    MappingProposal,
    _parse_currency,
    apply_mapping,
    header_signature,
)


def test_currency_parsing_handles_prefix_with_a_period():
    # "Rs. 500" naively strips to ".500" (0.5) if the period in "Rs." isn't
    # distinguished from a decimal point — this is the bug that mattered.
    assert _parse_currency("Rs. 500") == 500.0


def test_currency_parsing_handles_symbol_commas_and_sign():
    assert _parse_currency("₹1,234.50") == 1234.5
    assert _parse_currency("-45.20") == -45.2
    assert _parse_currency("(45.20)") == -45.2
    assert _parse_currency("") is None
    assert _parse_currency("N/A") is None


def _mapping(**overrides):
    defaults = {t: ColumnMapping(target=t, kind="not_present") for t in [
        "aggregator_order_id", "placed_at", "zone", "platform", "status",
        "total_amount", "prep_time_seconds", "delivery_time_seconds",
        "cancellation_reason", "weather_flag",
    ]}
    defaults.update(overrides)
    return MappingProposal(mappings=list(defaults.values()))


def test_direct_rename():
    mapping = _mapping(aggregator_order_id=ColumnMapping(target="aggregator_order_id", kind="direct", source="Order ID"))
    rows = apply_mapping(mapping, [{"Order ID": "SW1001"}])
    assert rows[0].aggregator_order_id == "SW1001"


def test_status_value_map_resolves_case_insensitively():
    mapping = _mapping(status=ColumnMapping(
        target="status", kind="direct", source="Order Status",
        value_map={"Completed": "delivered", "Rejected": "cancelled"},
    ))
    rows = apply_mapping(mapping, [{"Order Status": "completed"}, {"Order Status": "REJECTED"}])
    assert rows[0].status == "delivered"
    assert rows[1].status == "cancelled"


def test_status_falls_back_to_keyword_heuristic_when_unmapped():
    mapping = _mapping(status=ColumnMapping(target="status", kind="direct", source="Order Status", value_map={}))
    rows = apply_mapping(mapping, [{"Order Status": "Cancelled by restaurant"}])
    assert rows[0].status == "cancelled"


def test_timestamp_diff_computes_duration_in_seconds():
    mapping = _mapping(delivery_time_seconds=ColumnMapping(
        target="delivery_time_seconds", kind="timestamp_diff",
        start_source="Placed", end_source="Delivered",
    ))
    rows = apply_mapping(mapping, [{"Placed": "2026-01-01 10:00:00", "Delivered": "2026-01-01 10:38:00"}])
    assert rows[0].delivery_time_seconds == 38 * 60


def test_scaled_duration_converts_minutes_to_seconds():
    mapping = _mapping(prep_time_seconds=ColumnMapping(target="prep_time_seconds", kind="direct_scaled", source="Prep (min)", unit="minutes"))
    rows = apply_mapping(mapping, [{"Prep (min)": "12"}])
    assert rows[0].prep_time_seconds == 720


def test_missing_required_field_yields_none_not_a_crash():
    mapping = _mapping(aggregator_order_id=ColumnMapping(target="aggregator_order_id", kind="direct", source="Order ID"))
    rows = apply_mapping(mapping, [{"Order ID": ""}])
    assert rows[0].aggregator_order_id is None


def test_header_signature_is_order_and_case_independent():
    assert header_signature(["Order ID", "Order Time", "Area"]) == header_signature(["area", "order time", "order id"])


def test_header_signature_changes_with_different_headers():
    assert header_signature(["Order ID"]) != header_signature(["OrderID"])
