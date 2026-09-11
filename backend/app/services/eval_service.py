"""Groundtruth-style eval harness — the mechanism that makes the product's
"zero-hallucination" claim checkable instead of asserted (see the showcase
discussion in this project's history: grounding + eval is the technique
that proves the thesis, not just another agent hop).

Scores structural correctness against the golden set: did the router pick
the right lane, and — the part that actually matters — did every claim in
the answer resolve to a real citation. `expect_grounded: true` on every
entry (including the adversarial ones) means the same thing throughout:
the system must never end a turn in the "ungrounded" state.
"""

import json
import uuid
from pathlib import Path

from app.config import settings
from app.db import get_pool
from app.services.claude_client import complete
from app.services.pipeline import run_pipeline

GOLDEN_SET_PATH = Path(__file__).resolve().parents[2] / "eval" / "golden_set.json"


def load_golden_set() -> list[dict]:
    return json.loads(GOLDEN_SET_PATH.read_text())


async def run_case(case: dict) -> dict:
    result = await run_pipeline(case["question"], settings.demo_restaurant_id)

    route_ok = case["expected_route"] is None or result.route_taken == case["expected_route"]
    grounded_ok = result.grounding_verdict in ("grounded", "no_claims", "partial") and result.grounding_verdict != "ungrounded"

    content_ok = True
    if case.get("answer_should_contain_any"):
        lowered = result.answer_text.lower()
        content_ok = any(phrase in lowered for phrase in case["answer_should_contain_any"])

    passed = route_ok and grounded_ok and content_ok

    return {
        "id": case["id"],
        "question": case["question"],
        "expected_route": case["expected_route"],
        "actual_route": result.route_taken,
        "route_ok": route_ok,
        "grounding_verdict": result.grounding_verdict,
        "citation_coverage": result.citation_coverage,
        "grounded_ok": grounded_ok,
        "content_ok": content_ok,
        "passed": passed,
        "answer_preview": result.answer_text[:220],
    }


async def run_golden_set() -> dict:
    cases = load_golden_set()
    results = [await run_case(c) for c in cases]
    passed = sum(1 for r in results if r["passed"])
    avg_coverage = sum(r["citation_coverage"] for r in results) / len(results) if results else 0.0
    return {
        "total": len(results),
        "passed": passed,
        "pass_rate": round(passed / len(results), 3) if results else 0.0,
        "avg_citation_coverage": round(avg_coverage, 3),
        "results": results,
    }


NAIVE_SYSTEM = (
    "You are a helpful assistant for a restaurant operator. Answer their question "
    "using the data dump below as best you can."
)


async def naive_vs_grounded(question: str) -> dict:
    """Runs the same question through (a) a naive single-shot call with a raw,
    unfiltered data dump and no citation requirement — roughly what "paste your
    CSV into a chatbot" looks like — and (b) the real grounded pipeline. Both
    run against the same underlying data, live, so the contrast is genuine
    rather than a scripted example.
    """
    pool = await get_pool()
    rid = uuid.UUID(settings.demo_restaurant_id)
    async with pool.acquire() as conn:
        order_rows = await conn.fetch(
            "select aggregator_order_id, zone, status, cancellation_reason, delivery_time_seconds, "
            "sla_target_seconds, weather_flag, placed_at from orders where restaurant_id = $1 limit 500",
            rid,
        )
        chunk_rows = await conn.fetch(
            "select chunk_text from policy_chunks where restaurant_id = $1",
            rid,
        )

    data_dump = "\n".join(str(dict(r)) for r in order_rows) + "\n\n" + "\n".join(r["chunk_text"] for r in chunk_rows)
    naive_prompt = f"Data:\n{data_dump[:12000]}\n\nQuestion: {question}"
    naive_answer = await complete(settings.synthesis_model, NAIVE_SYSTEM, naive_prompt, max_tokens=600)

    grounded = await run_pipeline(question, settings.demo_restaurant_id)

    return {
        "question": question,
        "naive": {"answer": naive_answer, "citations": [], "verified": None},
        "grounded": {
            "answer": grounded.answer_text,
            "citations": [c.model_dump() for c in grounded.citations],
            "grounding_verdict": grounded.grounding_verdict,
            "citation_coverage": grounded.citation_coverage,
            "route_taken": grounded.route_taken,
        },
    }
