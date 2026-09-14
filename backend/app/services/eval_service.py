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
import re
import uuid
from pathlib import Path

from app.config import settings
from app.db import get_pool
from app.services.claude_client import complete
from app.services.pipeline import run_pipeline

# CI-gate usage (eval/run_eval.py) has no authenticated tenant to run
# against, so it falls back to the seeded demo restaurant. The API route
# (routers/eval.py) always passes the caller's own authenticated
# restaurant_id instead — see run_golden_set's parameter below.
_FALLBACK_RESTAURANT_ID = settings.demo_restaurant_id

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"
GOLDEN_SET_PATH = EVAL_DIR / "golden_set.json"

# One golden set per response_language this app actually supports (product.md's
# Hindi/Hinglish-via-prompting phase) — "english" reuses the original set
# rather than a translated copy, since it's already the baseline everything
# else is measured against.
GOLDEN_SETS_BY_LANGUAGE = {
    "english": GOLDEN_SET_PATH,
    "hindi": EVAL_DIR / "golden_set_hindi.json",
    "hinglish": EVAL_DIR / "golden_set_hinglish.json",
}

_DEVANAGARI_DIGITS = re.compile(r"[०-९]")


def load_golden_set(path: Path = GOLDEN_SET_PATH) -> list[dict]:
    return json.loads(Path(path).read_text())


def score_case(
    case: dict,
    *,
    route_taken: str,
    grounding_verdict: str,
    answer_text: str,
) -> dict:
    """Pure scoring logic for a single golden-set case, split out from
    run_case so it can be unit-tested without a live pipeline run (DB +
    Claude API). Takes the pipeline's raw outputs and returns the same
    route_ok/grounded_ok/content_ok/numerals_ok/passed booleans run_case
    reports.
    """
    response_language = case.get("response_language", "english")

    route_ok = case["expected_route"] is None or route_taken == case["expected_route"]
    grounded_ok = grounding_verdict in ("grounded", "no_claims", "partial") and grounding_verdict != "ungrounded"

    content_ok = True
    if case.get("answer_should_contain_any"):
        lowered = answer_text.lower()
        content_ok = any(phrase in lowered for phrase in case["answer_should_contain_any"])

    # The architectural guardrail from synthesis.py's language-steering
    # comment, made checkable: a Hindi answer must render numbers in
    # Arabic/Western digits, never Devanagari digits — Devanagari digits
    # inside a citation marker's ref_id would already fail grounded_ok
    # (grounding.py matches byte-for-byte against the real data), but a
    # Devanagari-digit ₹ amount OUTSIDE a citation marker wouldn't trip
    # that check, so it needs its own test.
    numerals_ok = True
    if response_language == "hindi":
        numerals_ok = not _DEVANAGARI_DIGITS.search(answer_text)

    return {
        "route_ok": route_ok,
        "grounded_ok": grounded_ok,
        "content_ok": content_ok,
        "numerals_ok": numerals_ok,
        "passed": route_ok and grounded_ok and content_ok and numerals_ok,
    }


async def run_case(case: dict, restaurant_id: str) -> dict:
    response_language = case.get("response_language", "english")
    result = await run_pipeline(case["question"], restaurant_id, response_language)

    score = score_case(
        case,
        route_taken=result.route_taken,
        grounding_verdict=result.grounding_verdict,
        answer_text=result.answer_text,
    )

    return {
        "id": case["id"],
        "question": case["question"],
        "response_language": response_language,
        "expected_route": case["expected_route"],
        "actual_route": result.route_taken,
        "grounding_verdict": result.grounding_verdict,
        "citation_coverage": result.citation_coverage,
        "answer_preview": result.answer_text[:220],
        **score,
    }


async def run_golden_set(restaurant_id: str | None = None, golden_set_path: Path = GOLDEN_SET_PATH) -> dict:
    cases = load_golden_set(golden_set_path)
    rid = restaurant_id or _FALLBACK_RESTAURANT_ID
    results = [await run_case(c, rid) for c in cases]
    passed = sum(1 for r in results if r["passed"])
    avg_coverage = sum(r["citation_coverage"] for r in results) / len(results) if results else 0.0
    return {
        "total": len(results),
        "passed": passed,
        "pass_rate": round(passed / len(results), 3) if results else 0.0,
        "avg_citation_coverage": round(avg_coverage, 3),
        "results": results,
    }


# How far a non-English language's pass rate is allowed to trail the
# English baseline before it's a release-blocker, not just "lower" — an
# arbitrary language-specific bar would be meaningless on a 6-question set;
# what matters is "does this language perform materially worse than the
# language we already trust in production."
LANGUAGE_TOLERANCE = 0.15


def gate_for_language(language: str, pass_rate: float, baseline: float) -> dict:
    """Pure comparison logic behind the release gate, split out so the
    tolerance math can be unit-tested without running any golden set.
    "english" is always the baseline itself, so it always clears.
    """
    if language == "english":
        return {"pass_rate": pass_rate, "cleared": True, "reason": "baseline"}

    # Rounded before comparison — pass rates are already rounded to 3
    # decimals by run_golden_set, but raw float subtraction (e.g.
    # 0.9 - 0.15) can still land a hair past the boundary due to binary
    # float representation, which would wrongly block an exact-tolerance case.
    delta = round(baseline - pass_rate, 6)
    cleared = delta <= LANGUAGE_TOLERANCE
    return {
        "pass_rate": pass_rate,
        "baseline_pass_rate": baseline,
        "delta_from_baseline": round(delta, 3),
        "cleared": cleared,
        "reason": "within tolerance of English baseline" if cleared
        else f"trails English baseline by {delta:.1%}, exceeds {LANGUAGE_TOLERANCE:.0%} tolerance",
    }


async def run_multilingual_gate(restaurant_id: str | None = None) -> dict:
    """Stage 2F's actual release gate: run every language's golden set and
    compare each non-English pass rate against the English baseline. A
    language only clears the gate if its pass rate is within
    LANGUAGE_TOLERANCE of English — this is what should decide whether
    Hindi/Hinglish answers are trusted for financial/compensation
    questions, not a standalone "did it get some fraction right" number.
    """
    by_language = {}
    for language, path in GOLDEN_SETS_BY_LANGUAGE.items():
        by_language[language] = await run_golden_set(restaurant_id, path)

    baseline = by_language["english"]["pass_rate"]
    gate = {
        language: gate_for_language(language, report["pass_rate"], baseline)
        for language, report in by_language.items()
    }

    return {"by_language": by_language, "gate": gate}


NAIVE_SYSTEM = (
    "You are a helpful assistant for a restaurant operator. Answer their question "
    "using the data dump below as best you can."
)


async def naive_vs_grounded(question: str, restaurant_id: str) -> dict:
    """Runs the same question through (a) a naive single-shot call with a raw,
    unfiltered data dump and no citation requirement — roughly what "paste your
    CSV into a chatbot" looks like — and (b) the real grounded pipeline. Both
    run against the same underlying data, live, so the contrast is genuine
    rather than a scripted example.
    """
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
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

    grounded = await run_pipeline(question, restaurant_id)

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
