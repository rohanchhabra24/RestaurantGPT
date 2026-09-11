"""The core query pipeline — routes, executes, synthesizes, and verifies a
single question. This is what §2.4 of product.md describes step by step;
every stage here writes its timing into latency_ms_by_stage so a trace is
fully replayable.

If grounding comes back "ungrounded", we regenerate once with the failure
fed back into the prompt (product.md step 9) rather than silently shipping
an unverified claim.
"""

import time

from app.services import grounding, intent_router, multi_agent_investigator, retrieval_engine, sql_engine, synthesis


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
        self.investigation_steps: list[str] = []


def _timed(stage: str, start: float, result: PipelineResult) -> None:
    result.latency_ms_by_stage[stage] = int((time.perf_counter() - start) * 1000)


async def run_pipeline(question: str, restaurant_id: str) -> PipelineResult:
    result = PipelineResult()

    t0 = time.perf_counter()
    routing = await intent_router.classify_intent(question)
    _timed("routing", t0, result)
    result.route_taken = routing["route"]
    slots = routing.get("slots", {})

    if result.route_taken == "CLARIFY":
        result.answer_text = (
            "I need a bit more detail to answer that precisely — which time window, "
            "zone, or order status are you asking about?"
        )
        result.grounding_verdict = "no_claims"
        result.citation_coverage = 1.0
        return result

    investigation_steps_text = None

    if result.route_taken in ("SQL", "HYBRID"):
        t1 = time.perf_counter()
        try:
            sql = await sql_engine.generate_sql(question, slots, restaurant_id)
            result.generated_sql = sql
            result.sql_rows = await sql_engine.execute_sql(sql)
        except sql_engine.SQLValidationError as e:
            result.sql_rows = []
            result.generated_sql = f"-- rejected by validator: {e}"
        _timed("sql", t1, result)

    if result.route_taken in ("RETRIEVAL", "HYBRID"):
        t2 = time.perf_counter()
        result.chunks = await retrieval_engine.hybrid_search(question, restaurant_id)
        _timed("retrieval", t2, result)

    if result.route_taken == "DIAGNOSTIC":
        t2b = time.perf_counter()
        investigation = await multi_agent_investigator.investigate(question, restaurant_id, slots)
        result.sql_rows = investigation.order_evidence
        result.chunks = investigation.chunks
        result.investigation_steps = [f"[{s.agent}] {s.description}" for s in investigation.steps]
        investigation_steps_text = investigation.steps_summary_text
        _timed("investigation", t2b, result)

    t3 = time.perf_counter()
    raw_answer = await synthesis.synthesize(question, result.sql_rows, result.chunks, investigation_steps_text)
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
        raw_answer = await synthesis.synthesize(corrective_question, result.sql_rows, result.chunks, investigation_steps_text)
        citations, verdict, coverage = grounding.verify_citations(raw_answer, result.sql_rows, result.chunks)
        result.regenerated = True

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
