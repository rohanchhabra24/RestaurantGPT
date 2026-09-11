"""Text-to-SQL engine — deterministic answers over structured order data.

Generation is LLM-driven; execution is not trusted blindly. Every generated
query passes through validate_sql() before it touches the database: SELECT
only, mandatory tenant filter, no multi-statement injection, row cap. This
is the guardrail described in product.md §2.6 — a regex/keyword allow-list
rather than a full SQL AST parser, which is the honest trade-off for this
build's scope (an AST-based validator via sqlglot is the noted upgrade path
for production, not required to demonstrate the technique).
"""

import re

from app.config import settings
from app.db import get_pool
from app.services.claude_client import complete

SCHEMA = """
orders(
  id uuid, restaurant_id uuid, aggregator_order_id text, placed_at timestamptz,
  zone text, platform text, status text, total_amount numeric,
  prep_time_seconds int, delivery_time_seconds int, sla_target_seconds int,
  is_cancelled boolean, cancellation_reason text, is_refunded boolean,
  refund_amount numeric, weather_flag boolean
)
"""

SYSTEM = f"""You write a single read-only PostgreSQL SELECT query against this schema:
{SCHEMA}

Rules:
- SELECT only. Never write INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/GRANT.
- Always filter on restaurant_id = '{{restaurant_id}}' (a literal placeholder you must include verbatim).
- Always include the `id`, `aggregator_order_id`, `platform`, `zone`, `status`,
  `cancellation_reason`, `delivery_time_seconds`, `sla_target_seconds`,
  `weather_flag`, `total_amount`, and `placed_at` columns in the SELECT list if
  individual orders are being listed (not just aggregated), so results can be
  cited and inspected in full.
- Use relative date math (now(), interval) for date_range slots like "yesterday" or "last week".
- Cap results at 200 rows with LIMIT unless the query is already an aggregate (COUNT/AVG/SUM).
- Respond with ONLY the SQL query, no explanation, no markdown fence."""

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|grant|revoke|attach|copy|create|call|do)\b",
    re.IGNORECASE,
)


class SQLValidationError(Exception):
    pass


def validate_sql(sql: str, restaurant_id: str) -> str:
    stripped = sql.strip().rstrip(";")
    if not re.match(r"^\s*select\b", stripped, re.IGNORECASE):
        raise SQLValidationError("Generated query is not a SELECT statement")
    if ";" in stripped:
        raise SQLValidationError("Multiple statements are not allowed")
    if FORBIDDEN.search(stripped):
        raise SQLValidationError("Generated query contains a forbidden keyword")
    if restaurant_id not in stripped:
        raise SQLValidationError("Generated query is missing the tenant filter")
    if not re.search(r"\blimit\b", stripped, re.IGNORECASE) and not re.search(
        r"\b(count|avg|sum|min|max)\s*\(", stripped, re.IGNORECASE
    ):
        stripped += " LIMIT 200"
    return stripped


async def generate_sql(question: str, slots: dict, restaurant_id: str) -> str:
    prompt = f"Question: {question}\nSlots: {slots}\nrestaurant_id placeholder: '{restaurant_id}'"
    raw = await complete(settings.sql_model, SYSTEM, prompt, max_tokens=400)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(sql)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.MULTILINE)
    return validate_sql(raw, restaurant_id)


async def execute_sql(sql: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
    return [dict(r) for r in rows]
