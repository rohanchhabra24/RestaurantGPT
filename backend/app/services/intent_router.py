"""Query routing — the dispatcher deciding SQL vs. retrieval vs. both vs.
multi-hop diagnosis. This runs on every single query, so it uses the
cheapest model in the cascade (see product.md §2.5). A wrong route here
means everything downstream is wrong, so the prompt is deliberately
narrow: classify and extract slots, nothing else.
"""

from app.config import settings
from app.services.claude_client import complete_json

ROUTES = ("SQL", "RETRIEVAL", "HYBRID", "DIAGNOSTIC", "CLARIFY", "GREETING")

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
Omit slot keys that aren't present in the question rather than guessing."""


async def classify_intent(question: str, usage_sink: list | None = None) -> dict:
    try:
        result = await complete_json(settings.router_model, SYSTEM, question, max_tokens=256, usage_sink=usage_sink)
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
