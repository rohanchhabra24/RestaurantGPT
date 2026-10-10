"""Multi-turn chat context — each message used to be answered in total
isolation (see pipeline.py/intent_router.py module docstrings), so a
follow-up like "what about Zone 4?" had no way to resolve against the
previous question. These cover the two mechanisms that fix that: slot
merging (a value the router omits this turn is inherited from what the
conversation already knew) and the CLARIFY fallback (a follow-up that's
only ambiguous in isolation reuses the previous turn's route instead of
dead-ending into the generic "I need more detail" message).
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services import intent_router
from app.services.pipeline import run_pipeline
from app.services.synthesis import _format_history


RID = "00000000-0000-0000-0000-000000000001"


def _patched(route, new_slots):
    return patch(
        "app.services.pipeline.intent_router.classify_intent",
        new=AsyncMock(return_value={"route": route, "slots": new_slots}),
    )


@pytest.mark.asyncio
async def test_new_slot_overrides_known_slot():
    with _patched("SQL", {"zone": "Zone 4"}), \
         patch("app.services.pipeline.sql_engine.generate_sql", new=AsyncMock(return_value="SELECT 1")) as gen_sql, \
         patch("app.services.pipeline.sql_engine.execute_sql", new=AsyncMock(return_value=[])), \
         patch("app.services.pipeline.synthesis.synthesize", new=AsyncMock(return_value="No data available.")):
        result = await run_pipeline(
            "what about Zone 4?", RID, known_slots={"zone": "Zone 3", "date_range": "yesterday"},
        )

    # The router explicitly returned a new zone this turn — it wins over
    # the inherited one. date_range wasn't mentioned this turn, so it's
    # carried forward unchanged.
    assert result.slots == {"zone": "Zone 4", "date_range": "yesterday"}
    gen_sql.assert_awaited_once()
    assert gen_sql.await_args.args[1] == {"zone": "Zone 4", "date_range": "yesterday"}


@pytest.mark.asyncio
async def test_omitted_slot_is_inherited_unchanged():
    with _patched("SQL", {}), \
         patch("app.services.pipeline.sql_engine.generate_sql", new=AsyncMock(return_value="SELECT 1")), \
         patch("app.services.pipeline.sql_engine.execute_sql", new=AsyncMock(return_value=[])), \
         patch("app.services.pipeline.synthesis.synthesize", new=AsyncMock(return_value="No data available.")):
        result = await run_pipeline(
            "and how many were cancelled?", RID, known_slots={"zone": "Zone 3", "date_range": "yesterday"},
        )

    assert result.slots == {"zone": "Zone 3", "date_range": "yesterday"}


@pytest.mark.asyncio
async def test_clarify_falls_back_to_previous_route_when_slots_carry_forward():
    with _patched("CLARIFY", {}), \
         patch("app.services.pipeline.sql_engine.generate_sql", new=AsyncMock(return_value="SELECT 1")), \
         patch("app.services.pipeline.sql_engine.execute_sql", new=AsyncMock(return_value=[{"aggregator_order_id": "1"}])), \
         patch("app.services.pipeline.synthesis.synthesize", new=AsyncMock(return_value="Plain answer, no citations.")):
        result = await run_pipeline(
            "and yesterday?", RID,
            known_slots={"zone": "Zone 3", "date_range": "last week"},
            previous_route="SQL",
        )

    # Never dead-ends into the generic clarify message when there's
    # already enough carried-forward context and a previous route to
    # continue on.
    assert result.route_taken == "SQL"


@pytest.mark.asyncio
async def test_clarify_stays_clarify_with_no_prior_context():
    with _patched("CLARIFY", {}):
        result = await run_pipeline("what about that?", RID)

    # No known_slots, no previous_route — a genuinely ambiguous opening
    # question (the original, pre-multi-turn behavior) must still dead-end
    # honestly rather than guessing a route.
    assert result.route_taken == "CLARIFY"
    assert result.grounding_verdict == "no_claims"


@pytest.mark.asyncio
async def test_clarify_stays_clarify_when_previous_route_itself_was_clarify():
    # Guards against chaining two CLARIFYs into a route neither question
    # actually supports — CLARIFY/GREETING are excluded from the fallback
    # on purpose (see pipeline.py).
    with _patched("CLARIFY", {}):
        result = await run_pipeline(
            "huh?", RID, known_slots={"zone": "Zone 3"}, previous_route="CLARIFY",
        )
    assert result.route_taken == "CLARIFY"


def test_router_history_formatting_caps_turns_and_length():
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": "x" * 400} for i in range(10)]
    formatted = intent_router._format_history(history)
    # Only the last 6 messages are included (plus the header line).
    assert sum(formatted.count(p) for p in ("Operator:", "Assistant:")) == 6
    assert "x" * 400 not in formatted


def test_synthesis_history_strips_citation_markers():
    history = [{"role": "assistant", "content": "Zone 3 was delayed [ORDER:4021] due to rain [WEATHER:2026-01-01]."}]
    formatted = _format_history(history)
    assert "[ORDER:" not in formatted
    assert "[WEATHER:" not in formatted
    assert "Zone 3 was delayed" in formatted
