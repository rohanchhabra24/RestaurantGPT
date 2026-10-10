"""Suggested follow-up questions — shown as clickable chips under an
assistant message so the operator doesn't have to type the natural next
question from scratch. Deliberately rule-based, not an extra LLM call:
these are cheap, fast, and the project's existing cost-conscious pattern
(router already uses the cheapest model in the cascade) argues against
spending a model call just to suggest what to ask next.

Not shown for CLARIFY/GREETING (nothing substantive was answered) or an
abstained answer (there's nothing to build on — the honest next move is
narrowing the question, which the abstention message itself already says).
"""

SKIP_ROUTES = ("CLARIFY", "GREETING")

# Loose keyword check, not a route — a SQL/HYBRID answer can still be
# "about" compensation even though RETRIEVAL/the dedicated sweep flow are
# the routes that actually compute eligible amounts. This only decides
# whether the suggestion is relevant, not whether anything is eligible.
_COMPENSATION_WORDS = ("compensat", "eligib", "refund", "sla")


def suggest(route_taken: str, question: str, slots: dict | None = None) -> list[str]:
    if route_taken in SKIP_ROUTES:
        return []

    slots = slots or {}
    lowered = question.lower()
    out: list[str] = []

    if route_taken == "DIAGNOSTIC":
        out.append("What should I do about this?")
    elif any(w in lowered for w in _COMPENSATION_WORDS):
        out.append("Check for recoverable compensation")
    elif route_taken == "RETRIEVAL":
        out.append("Does this apply to a specific order of mine?")

    if slots.get("zone"):
        out.append("How does this compare across all zones?")
    elif slots.get("date_range") in ("yesterday", "today"):
        out.append("How does this compare to last week?")

    return out[:2]
