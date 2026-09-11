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
- If the provided data is insufficient to answer confidently, say so plainly
  instead of guessing — an honest "insufficient data" beats a fabricated answer.
- Be concise. Write for a busy restaurant manager, not a report."""

CITATION_RE = re.compile(r"\[(ORDER|POLICY):([^\]]+)\]")


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


async def synthesize(question: str, sql_rows: list[dict], chunks: list[dict]) -> str:
    prompt = f"""Question: {question}

Order data (from SQL):
{_format_sql_rows(sql_rows)}

Policy text (from retrieval):
{_format_chunks(chunks)}

Answer the question now, citing every claim."""
    return await complete(settings.synthesis_model, SYSTEM, prompt, max_tokens=800)


def extract_citations(answer_text: str) -> list[dict]:
    return [{"type": m.group(1).lower(), "ref_id": m.group(2)} for m in CITATION_RE.finditer(answer_text)]
