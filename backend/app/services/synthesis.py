"""Synthesis — turns SQL rows + retrieved chunks into a cited natural-language
answer. Citation markers ([ORDER:<id>], [POLICY:<chunk_id>]) are structured
tokens the model is instructed to emit inline; grounding.py parses and
verifies them before anything reaches the operator.
"""

import re

from app.config import settings
from app.services.claude_client import complete

SYSTEM = """You are RestaurantGPT, answering a restaurant operator's question
using ONLY the data provided below. Never use outside knowledge or infer
facts not present in the data.

Rules:
- Every factual claim (a number, an eligibility call, a policy interpretation)
  MUST be immediately followed by a citation marker.
- Cite an order with [ORDER:<aggregator_order_id>] — e.g. [ORDER:4021].
- Cite a policy chunk with [POLICY:<chunk_id>] using the exact chunk id given.
- Cite an independently-verified weather fact with [WEATHER:<date>] using the
  exact date given (YYYY-MM-DD) — ONLY if that date appears in the "Verified
  weather" section below. Never state that it rained/was clear on a date
  without that citation, and never claim weather for a date not listed there
  — an order's own weather_flag column is a separate, self-reported signal;
  only the "Verified weather" section is independently confirmed, so treat
  the two as different kinds of evidence and don't conflate them.
- If the provided data is insufficient to answer confidently, say so plainly
  instead of guessing — an honest "insufficient data" beats a fabricated answer.
- Be concise. Write for a busy restaurant manager, not a report.

If the question is about an operational issue, an eligibility/compensation
call, or a diagnostic root cause (not a plain lookup), end with a short
"Recommended next steps:" section — 1-3 concrete actions the operator could
take. A step that restates a fact from the data still needs its citation
marker; a step that's general operational advice (e.g. "consider adding a
courier buffer in Zone 3 during rain") does NOT need one — don't invent a
citation just to attach one to advice. Skip this section entirely for plain
lookup questions where there's nothing to act on."""

CITATION_RE = re.compile(r"\[(ORDER|POLICY|WEATHER):([^\]]+)\]")

# Response-language steering (product.md's Hindi/Hinglish-via-prompting
# phase — no translation infra, no new model, just an instruction). The
# architectural rule that makes this safe: language only ever touches the
# PROSE around a fact, never the fact itself. Every number, ₹ amount, order
# ID, and citation marker in an answer already comes from _format_sql_rows/
# _format_chunks above — real data the model copies, not something it
# free-generates — regardless of what language wraps around it.
# "Reason in English, answer in the target language" is this same rule
# stated the other way round: figure out the numbers using the English
# data as given, only translate the sentence explaining them.
#
# The instructions below exist to keep the model from "helpfully"
# translating or reformatting those tokens once it's writing in
# Hindi/Hinglish — that would turn a real ₹ amount into a possibly-wrong
# translated one, and would silently break the citation-verification
# grounding.py depends on (a citation marker's brackets/keyword/colon have
# to survive byte-for-byte or it stops being recognizable as
# [ORDER:...]/[POLICY:...] at all). This isn't just a prompt request —
# it's enforced for free by machinery that already exists:
# grounding.verify_citations() only ever matches CITATION_RE against the
# raw answer text, so a mangled marker is indistinguishable from a missing
# one and the answer comes back "ungrounded", which pipeline.py already
# retries once with the failure surfaced (see run_pipeline's
# corrective_question). A translated/garbled citation can't silently pass
# as grounded in any language.
_LANGUAGE_STEERING = {
    "english": "",
    "hindi": """

Respond in Hindi (Devanagari script) — the operator reads Hindi more
comfortably than English. This changes ONLY the prose around the facts:
work out every number, amount, and eligibility call from the English data
above exactly as given, then explain it in Hindi. Never translate,
transliterate, or re-derive a number, a ₹ amount, a date, an order id, or a
citation marker — copy each one character-for-character from the data,
exactly as you would in an English answer. Always write numerals in
Arabic/Western digits (0-9), never Devanagari digits (०-९) — "₹320" and
"38 min", not "₹३२०" or "३८ मिनट" — Hindi prose with Western numerals is
completely normal and expected, and a citation's ref_id has to match the
underlying data byte-for-byte to verify at all. A citation marker's syntax
(the square brackets, the literal word ORDER, POLICY, or WEATHER, the colon)
must stay in English even inside a Hindi sentence — e.g. "...आर्डर [ORDER:4021]
रद्द हुआ..." is correct; translating "ORDER", the brackets, or the digits
inside it is not, and breaks verification downstream.""",
    "hinglish": """

Respond in Hinglish — natural, everyday Hindi-English code-mixing in Roman
script, the way people actually text/WhatsApp, not formal textbook Hindi
and not pure English. This changes ONLY the prose around the facts: work
out every number, amount, and eligibility call from the English data above
exactly as given, then explain it in Hinglish. Never translate,
transliterate, or re-derive a number, a ₹ amount, a date, an order id, or a
citation marker — copy each one character-for-character from the data,
exactly as you would in an English answer. A citation marker's syntax (the
square brackets, the literal word ORDER, POLICY, or WEATHER, the colon) must
stay exactly as-is even inside a Hinglish sentence — e.g. "...order [ORDER:4021]
cancel ho gaya..." is correct; altering "ORDER" or the brackets is not, and
breaks verification downstream.""",
}


def _system_prompt(response_language: str) -> str:
    return SYSTEM + _LANGUAGE_STEERING.get(response_language, "")


def _format_sql_rows(rows: list[dict]) -> str:
    if not rows:
        return "(no matching orders)"
    lines = []
    for r in rows[:50]:
        lines.append(", ".join(f"{k}={v}" for k, v in r.items()))
    return "\n".join(lines)


def _format_chunks(chunks: list[dict]) -> str:
    if not chunks:
        return "(no matching policy text)"
    lines = []
    for c in chunks:
        lines.append(f"chunk_id={c['id']} section={c.get('section_label') or 'n/a'} source={c['source_name']}\n{c['chunk_text']}")
    return "\n---\n".join(lines)


def _format_weather(weather_evidence: list[dict]) -> str:
    if not weather_evidence:
        return "(no independently-verified weather data for this investigation)"
    lines = []
    for w in weather_evidence:
        precip = f"{w['precipitation_mm']}mm" if w.get("precipitation_mm") is not None else "unknown amount"
        lines.append(f"date={w['date']} condition={w['condition']} rainy={w['is_rainy']} precipitation={precip}")
    return "\n".join(lines)


async def synthesize(
    question: str,
    sql_rows: list[dict],
    chunks: list[dict],
    investigation_steps: str | None = None,
    usage_sink: list | None = None,
    response_language: str = "english",
    weather_evidence: list[dict] | None = None,
) -> str:
    investigation_block = (
        f"\nMulti-step investigation already performed (use these findings, don't repeat the queries):\n{investigation_steps}\n"
        if investigation_steps else ""
    )
    weather_block = (
        f"\nVerified weather (independently checked, NOT the same as an order's own weather_flag column):\n{_format_weather(weather_evidence)}\n"
        if weather_evidence else ""
    )
    prompt = f"""Question: {question}
{investigation_block}
Order data (evidence rows, from SQL):
{_format_sql_rows(sql_rows)}

Policy text (from retrieval):
{_format_chunks(chunks)}
{weather_block}
Answer the question now, citing every claim. If investigation steps are given above,
your answer should explain the root cause using those findings, not just restate the numbers."""
    return await complete(settings.synthesis_model, _system_prompt(response_language), prompt, max_tokens=800, usage_sink=usage_sink)


def extract_citations(answer_text: str) -> list[dict]:
    return [{"type": m.group(1).lower(), "ref_id": m.group(2)} for m in CITATION_RE.finditer(answer_text)]

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

async def generate_greeting(question: str, timezone: str, response_language: str = "english", usage_sink: list | None = None) -> str:
    try:
        now = datetime.now(ZoneInfo(timezone))
    except ZoneInfoNotFoundError:
        # onboarding.py validates this at intake, but this stays defensive
        # for any row written before that validation existed — a bad
        # timezone string shouldn't 500 the greeting route when "just use
        # a default" is a perfectly fine fallback for a value this route
        # only uses to decide morning/afternoon/evening/night wording.
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
    hour = now.hour
    time_context = "morning" if 5 <= hour < 12 else "afternoon" if 12 <= hour < 17 else "evening" if 17 <= hour < 21 else "night"
    
    prompt = f"The user said: '{question}'. The local time is {now.strftime('%I:%M %p')} ({time_context}). Respond as a helpful restaurant operations assistant. Wish them well for the day or night (e.g., 'Hope you have a great day of sales!' or 'Hope it was a good day for you!'). Keep it very brief, conversational, and warm."
    
    return await complete(settings.synthesis_model, _system_prompt(response_language), prompt, max_tokens=100, usage_sink=usage_sink)
