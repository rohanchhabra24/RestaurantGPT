"""Query routing — the dispatcher deciding SQL vs. retrieval vs. both vs.
multi-hop diagnosis. This runs on every single query, so it uses the
cheapest model in the cascade (see product.md §2.5). A wrong route here
means everything downstream is wrong, so the prompt is deliberately
narrow: classify and extract slots, nothing else.

history/known_slots (added for multi-turn support) let a follow-up like
"what about Zone 4?" resolve against the previous turn instead of routing
to CLARIFY — without them this function (and therefore the whole
pipeline) had no idea a question was a follow-up at all, since each
message used to be classified in complete isolation.
"""

from app.config import settings
from app.services.claude_client import complete_json

ROUTES = ("SQL", "RETRIEVAL", "HYBRID", "DIAGNOSTIC", "CLARIFY", "GREETING")

# The only slot keys this router (and sql_engine's prompt) understands —
# shared with pipeline.py's merge step so both sides agree on what's
# carry-forward-able context vs. noise.
SLOT_KEYS = ("date_range", "zone", "status")

SYSTEM = """You are the intent router for a restaurant operations assistant.
Classify the operator's question into exactly one route:

- SQL: answerable purely from structured order/delivery data (counts, averages, time windows, zones).
- RETRIEVAL: answerable purely from policy documents (SLA terms, compensation rules, definitions).
- HYBRID: needs both — a data lookup AND a policy interpretation joined together,
  about a SPECIFIC, already-known set of orders (e.g. "which of yesterday's
  cancellations are compensation-eligible").
- DIAGNOSTIC: asks WHY a metric changed, spiked, dropped, or is trending — this
  needs multi-step investigation (quantify the change, find what correlates
  with it, then check policy), not a single lookup. Trigger words: "why",
  "spike", "increase", "dropped", "trend", "what's driving", "root cause".
- GREETING: The user is saying hello, hi, good morning, or making casual conversation not related to operations.
- CLARIFY: too ambiguous to route (no clear time window, metric, or subject).

Also extract slots if present: date_range (e.g. "yesterday", "last week", or an
explicit range), zone, status (cancelled/delivered/in_progress).

Respond with ONLY a JSON object: {"route": "...", "slots": {"date_range": "...", "zone": "...", "status": "..."}}
Omit slot keys that aren't present in the question rather than guessing.

If a "Conversation so far" section is given below, the new question may be a
follow-up to it — e.g. "what about Zone 4?" after a Zone 3 question is a new
SQL/HYBRID/DIAGNOSTIC question with zone=Zone 4, not CLARIFY. Only emit a
slot key when THIS question changes or repeats it; an omitted key is filled
in automatically from the conversation's known context, so never copy an old
slot value forward yourself — that would prevent the caller from detecting
that the operator changed it. When the new question is short and doesn't
carry enough on its own to pick a route, and the conversation already
established one (a data lookup, a policy question, a diagnosis), stay on
that same route rather than falling back to CLARIFY."""


def _format_history(history: list[dict] | None) -> str:
    if not history:
        return ""
    # Last 3 turns only, each answer trimmed — this block exists to resolve
    # pronouns/references and give the route-switching heuristic above
    # something to go on, not to re-derive facts from (the question still
    # gets answered fresh from this turn's real SQL/retrieval results).
    lines = ["\nConversation so far:"]
    for turn in history[-6:]:
        role = "Operator" if turn["role"] == "user" else "Assistant"
        content = turn["content"][:240]
        lines.append(f"{role}: {content}")
    return "\n".join(lines) + "\n"


def _format_known_slots(known_slots: dict | None) -> str:
    filled = {k: v for k, v in (known_slots or {}).items() if k in SLOT_KEYS and v}
    if not filled:
        return ""
    return f"\nKnown context from earlier in this conversation: {filled}\n"


async def classify_intent(
    question: str,
    usage_sink: list | None = None,
    history: list[dict] | None = None,
    known_slots: dict | None = None,
) -> dict:
    user_prompt = (
        _format_history(history) + _format_known_slots(known_slots) + f"\nNew question: {question}"
        if history or known_slots
        else question
    )
    try:
        result = await complete_json(settings.router_model, SYSTEM, user_prompt, max_tokens=256, usage_sink=usage_sink)
        route = result.get("route")
        if route not in ROUTES:
            raise ValueError(f"unexpected route {route!r}")
        result.setdefault("slots", {})
        return result
    except Exception:
        # Heuristic fallback keeps the demo alive if the router call fails —
        # never block the whole pipeline on a single classification error.
        lowered = question.lower()
        mentions_diagnostic = any(w in lowered for w in ("why did", "why is", "spike", "spiked", "increase", "increased", "dropped", "trend", "driving", "root cause"))
        mentions_policy = any(w in lowered for w in ("sla", "policy", "eligib", "compensat", "qualify", "clause"))
        mentions_data = any(w in lowered for w in ("orders", "cancel", "average", "delivery time", "zone", "how many", "yesterday", "last week"))
        if mentions_diagnostic and mentions_data:
            route = "DIAGNOSTIC"
        elif mentions_policy and mentions_data:
            route = "HYBRID"
        elif mentions_policy:
            route = "RETRIEVAL"
        elif mentions_data:
            route = "SQL"
        else:
            route = "CLARIFY"
        return {"route": route, "slots": {}}
