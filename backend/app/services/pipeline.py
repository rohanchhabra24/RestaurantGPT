"""The core query pipeline — routes, executes, synthesizes, and verifies a
single question. This is what §2.4 of product.md describes step by step;
every stage here writes its timing into latency_ms_by_stage so a trace is
fully replayable.

If grounding comes back "ungrounded", we regenerate once with the failure
fed back into the prompt (product.md step 9) rather than silently shipping
an unverified claim.
"""

import asyncio
import time

from app.services import grounding, intent_router, multi_agent_investigator, pricing, retrieval_engine, sql_engine, synthesis


class PipelineResult:
    def __init__(self):
        self.route_taken: str = ""
        self.generated_sql: str | None = None
        self.sql_rows: list[dict] = []
        self.chunks: list[dict] = []
        self.answer_text: str = ""
        self.citations = []
        self.grounding_verdict: str = ""
        self.citation_coverage: float = 0.0
        self.latency_ms_by_stage: dict[str, int] = {}
        self.regenerated: bool = False
        self.abstained: bool = False
        self.investigation_steps: list[str] = []
        self.usage: list[dict] = []  # one {"model","input_tokens","output_tokens"} per Claude call this turn

    @property
    def total_input_tokens(self) -> int:
        return sum(u["input_tokens"] for u in self.usage)

    @property
    def total_output_tokens(self) -> int:
        return sum(u["output_tokens"] for u in self.usage)

    @property
    def estimated_cost_usd(self) -> float:
        return round(sum(
            pricing.estimate_cost_usd(u["model"], u["input_tokens"], u["output_tokens"]) for u in self.usage
        ), 6)


def _timed(stage: str, start: float, result: PipelineResult) -> None:
    result.latency_ms_by_stage[stage] = int((time.perf_counter() - start) * 1000)


async def _run_sql(question: str, slots: dict, restaurant_id: str, result: PipelineResult) -> None:
    t1 = time.perf_counter()
    try:
        sql = await sql_engine.generate_sql(question, slots, restaurant_id, usage_sink=result.usage)
        result.generated_sql = sql
        result.sql_rows = await sql_engine.execute_sql(sql)
    except sql_engine.SQLValidationError as e:
        result.sql_rows = []
        result.generated_sql = f"-- rejected by validator: {e}"
    _timed("sql", t1, result)


async def _run_retrieval(question: str, restaurant_id: str, result: PipelineResult) -> None:
    t2 = time.perf_counter()
    result.chunks = await retrieval_engine.hybrid_search(question, restaurant_id)
    _timed("retrieval", t2, result)


_CLARIFY_MESSAGES = {
    "english": "I need a bit more detail to answer that precisely — which time window, zone, or order status are you asking about?",
    "hindi": "इसका सही जवाब देने के लिए मुझे थोड़ी और जानकारी चाहिए — आप किस समय अवधि, ज़ोन, या ऑर्डर स्टेटस के बारे में पूछ रहे हैं?",
    "hinglish": "Iska sahi jawaab dene ke liye mujhe thodi aur detail chahiye — aap kaunse time window, zone, ya order status ke baare mein pooch rahe hain?",
}

# Stage 2E: what the operator sees when grounding still fails after the
# corrective retry below. Deterministic, not model-generated — same
# philosophy as compensation_rules.py computing amounts in plain Python
# rather than trusting an LLM's prose for something trust-critical. The
# corrective retry's own prompt already asks the model to say "the data is
# insufficient" itself, but that's a request, not a guarantee; this is the
# actual guarantee. Overriding the answer text (not just flagging it) is
# what makes "zero-hallucination" hold even on the failure path — an
# operator reading a still-confident-sounding paragraph next to a small red
# tag is exactly the failure mode a real abstention message has to prevent.
_ABSTENTION_MESSAGES = {
    "english": (
        "I couldn't verify a confident answer to that from your actual orders or "
        "policies. Rather than guess, I'm going to say so — try narrowing the time "
        "window or zone, or rephrasing the question, and I'll try again."
    ),
    "hindi": (
        "मैं आपके असली ऑर्डर या पॉलिसी डेटा से इसका भरोसेमंद जवाब नहीं दे पाया। अंदाज़ा लगाने "
        "की बजाय मैं यह साफ़ बता रहा हूँ — समय अवधि या ज़ोन को और सटीक बनाकर, या सवाल को "
        "दोबारा पूछकर देखें।"
    ),
    "hinglish": (
        "Main aapke actual orders ya policy data se iska bharosemand jawaab nahi de "
        "paaya. Guess karne ke bajaay main yeh saaf bata raha hoon — time window ya "
        "zone thoda specific karke, ya sawaal dobara pooch ke dekhein."
    ),
}


async def run_pipeline(question: str, restaurant_id: str, response_language: str = "english") -> PipelineResult:
    result = PipelineResult()

    t0 = time.perf_counter()
    routing = await intent_router.classify_intent(question, usage_sink=result.usage)
    _timed("routing", t0, result)
    result.route_taken = routing["route"]
    slots = routing.get("slots", {})

    if result.route_taken == "CLARIFY":
        result.answer_text = _CLARIFY_MESSAGES.get(response_language, _CLARIFY_MESSAGES["english"])
        result.grounding_verdict = "no_claims"
        result.citation_coverage = 1.0
        return result

    investigation_steps_text = None

    # HYBRID needs both SQL and retrieval, and neither depends on the
    # other's result — running them concurrently instead of one after the
    # other shaves the slower of the two off the total instead of paying
    # for both back to back.
    if result.route_taken == "HYBRID":
        await asyncio.gather(
            _run_sql(question, slots, restaurant_id, result),
            _run_retrieval(question, restaurant_id, result),
        )
    elif result.route_taken == "SQL":
        await _run_sql(question, slots, restaurant_id, result)
    elif result.route_taken == "RETRIEVAL":
        await _run_retrieval(question, restaurant_id, result)

    if result.route_taken == "DIAGNOSTIC":
        t2b = time.perf_counter()
        investigation = await multi_agent_investigator.investigate(question, restaurant_id, slots)
        result.sql_rows = investigation.order_evidence
        result.chunks = investigation.chunks
        result.investigation_steps = [f"[{s.agent}] {s.description}" for s in investigation.steps]
        investigation_steps_text = investigation.steps_summary_text
        _timed("investigation", t2b, result)

    t3 = time.perf_counter()
    raw_answer = await synthesis.synthesize(
        question, result.sql_rows, result.chunks, investigation_steps_text,
        usage_sink=result.usage, response_language=response_language,
    )
    _timed("synthesis", t3, result)

    t4 = time.perf_counter()
    citations, verdict, coverage = grounding.verify_citations(raw_answer, result.sql_rows, result.chunks)

    if verdict == "ungrounded":
        # One retry with the failure surfaced, per product.md step 9 —
        # never ship an unverified claim silently.
        corrective_question = (
            question
            + "\n\n(Your previous answer cited sources that don't exist in the "
            "provided data. Answer again using ONLY the order IDs and policy chunk "
            "ids actually present below, or say the data is insufficient.)"
        )
        raw_answer = await synthesis.synthesize(
            corrective_question, result.sql_rows, result.chunks, investigation_steps_text,
            usage_sink=result.usage, response_language=response_language,
        )
        citations, verdict, coverage = grounding.verify_citations(raw_answer, result.sql_rows, result.chunks)
        result.regenerated = True

        if verdict == "ungrounded":
            # Still ungrounded after the one retry — stop trusting the
            # model's prose and hand back the deterministic abstention
            # message instead. No citation markers survive into it, so
            # there's nothing left for the frontend to render as a chip.
            raw_answer = _ABSTENTION_MESSAGES.get(response_language, _ABSTENTION_MESSAGES["english"])
            citations, coverage = [], 0.0
            result.abstained = True

    _timed("grounding", t4, result)

    # Citation markers are kept in the text (not stripped) so the frontend
    # can render each [ORDER:x]/[POLICY:x] token as an inline citation chip
    # at the exact point the claim is made, rather than only listing sources
    # at the bottom of the answer.
    result.answer_text = raw_answer.strip()
    result.citations = citations
    result.grounding_verdict = verdict
    result.citation_coverage = coverage
    return result
