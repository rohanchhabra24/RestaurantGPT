"""Grounding verification — the mechanism behind the "zero-hallucination"
claim. Every citation the model emits is checked against the actual data
retrieved THIS turn, not re-judged by another LLM call: an [ORDER:4021]
marker is only "verified" if order 4021 is actually in this turn's SQL
result set, a [POLICY:<chunk_id>] marker only if that chunk id is
actually among this turn's retrieved chunks, and a [WEATHER:<date>]
marker only if that date is among the dates weather_service actually
looked up this turn (see multi_agent_investigator.py's weather_agent
step) — an external API is held to exactly the same bar as internal
data, not trusted more just because it's a "real" API. This is a
deliberately mechanical check — deterministic where the claim type
allows it, per product.md §2.5.
"""

from app.models import Citation
from app.services.synthesis import extract_citations


def verify_citations(
    answer_text: str, sql_rows: list[dict], chunks: list[dict], weather_evidence: list[dict] | None = None
) -> tuple[list[Citation], str, float]:
    orders_by_id = {str(r.get("aggregator_order_id")): r for r in sql_rows}
    chunk_lookup = {str(c["id"]): c for c in chunks}
    weather_by_date = {w["date"]: w for w in (weather_evidence or [])}

    raw_citations = extract_citations(answer_text)
    if not raw_citations:
        # An answer with real data behind it and zero citations is a red
        # flag, not a pass — but an honest "insufficient data" response has
        # nothing to cite, and that's correct behavior, not ungrounded.
        insufficiency_markers = ("insufficient data", "don't have enough", "cannot confirm", "not enough data")
        if any(m in answer_text.lower() for m in insufficiency_markers):
            return [], "no_claims", 1.0
        if sql_rows or chunks:
            return [], "ungrounded", 0.0
        return [], "no_claims", 1.0

    verified_list: list[Citation] = []
    verified_count = 0
    for c in raw_citations:
        if c["type"] == "order":
            order = orders_by_id.get(c["ref_id"])
            ok = order is not None
            label = f"Order #{c['ref_id']}"
            detail = _order_detail(order) if order else None
        elif c["type"] == "weather":
            # Verified exactly like an order or policy chunk: a [WEATHER:x]
            # marker is only "verified" if that date is actually among the
            # dates weather_service independently looked up THIS turn — the
            # model cannot cite a date it wasn't given real data for, same
            # mechanical check as everything else in this function.
            weather = weather_by_date.get(c["ref_id"])
            ok = weather is not None
            label = f"Weather on {c['ref_id']}"
            detail = weather if weather else None
        else:
            chunk = chunk_lookup.get(c["ref_id"])
            ok = chunk is not None
            label = chunk["section_label"] if chunk and chunk.get("section_label") else f"Policy chunk {c['ref_id'][:8]}"
            detail = _policy_detail(chunk) if chunk else None
        verified_count += int(ok)
        verified_list.append(Citation(type=c["type"], ref_id=c["ref_id"], label=label, verified=ok, detail=detail))

    coverage = verified_count / len(raw_citations)
    verdict = "grounded" if coverage == 1.0 else ("partial" if coverage > 0 else "ungrounded")
    return verified_list, verdict, round(coverage, 3)


def _order_detail(order: dict) -> dict:
    return {
        "aggregator_order_id": order.get("aggregator_order_id"),
        "platform": order.get("platform"),
        "zone": order.get("zone"),
        "status": order.get("status"),
        "cancellation_reason": order.get("cancellation_reason"),
        "delivery_time_seconds": order.get("delivery_time_seconds"),
        "sla_target_seconds": order.get("sla_target_seconds"),
        "weather_flag": order.get("weather_flag"),
        "total_amount": float(order["total_amount"]) if order.get("total_amount") is not None else None,
        "placed_at": order["placed_at"].isoformat() if order.get("placed_at") else None,
    }


def _policy_detail(chunk: dict) -> dict:
    return {
        "section_label": chunk.get("section_label"),
        "source_name": chunk.get("source_name"),
        "chunk_text": chunk.get("chunk_text"),
    }


def strip_citation_markers(answer_text: str) -> str:
    """Human-facing text shouldn't show raw [ORDER:4021] tokens — the
    frontend renders citations as clickable tags from the structured list
    instead, positioned via the same marker text this strips."""
    import re

    return re.sub(r"\[(ORDER|POLICY|WEATHER):[^\]]+\]", "", answer_text)
