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

# `join`/`union`/`intersect`/`except` are banned outright rather than just
# discouraged: the schema exposes exactly one table, so no legitimate query
# ever needs any of them, and each is a known way to smuggle in an
# unfiltered second read of `orders` (e.g. `... WHERE restaurant_id = 'X'
# UNION SELECT ... FROM orders` still contains the tenant id as a substring
# elsewhere in the query, which the old check alone would have let through).
# pg_catalog/information_schema/pg_sleep close off metadata/DoS probing.
FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|grant|revoke|attach|copy|create|call|do|"
    r"union|intersect|except|join|into|pg_sleep|pg_catalog|information_schema|pg_read_file)\b",
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
    if "--" in stripped or "/*" in stripped:
        # Comments are never needed in a generated query and can otherwise
        # hide a fake tenant filter from the regex checks below (e.g.
        # `WHERE 1=1 -- restaurant_id = '<real id>'`) while a stripped
        # comment leaves an entirely unfiltered query underneath.
        raise SQLValidationError("Comments are not allowed in generated SQL")
    if FORBIDDEN.search(stripped):
        raise SQLValidationError("Generated query contains a forbidden keyword")
    if not re.search(r"\bfrom\s+orders\b", stripped, re.IGNORECASE):
        raise SQLValidationError("Generated query must read from the orders table")

    # Substring presence isn't enough on its own — it doesn't distinguish an
    # actual filter from the id merely appearing (e.g. in a comment, or
    # negated). Require it as a real equality comparison, and reject a
    # negated form (!=, <>, NOT ... =) that would exclude the tenant's own
    # rows and imply the rest of the WHERE clause is scoping to everyone else.
    escaped_id = re.escape(restaurant_id)
    if not re.search(rf"restaurant_id\s*=\s*'{escaped_id}'", stripped, re.IGNORECASE):
        raise SQLValidationError("Generated query is missing the tenant filter")
    if re.search(rf"(!=|<>)\s*'{escaped_id}'", stripped, re.IGNORECASE) or re.search(
        rf"\bnot\b[^=]{{0,20}}=\s*'{escaped_id}'", stripped, re.IGNORECASE
    ):
        raise SQLValidationError("Generated query negates the tenant filter")

    if not re.search(r"\blimit\b", stripped, re.IGNORECASE) and not re.search(
        r"\b(count|avg|sum|min|max)\s*\(", stripped, re.IGNORECASE
    ):
        stripped += " LIMIT 200"
    return stripped


async def generate_sql(question: str, slots: dict, restaurant_id: str, usage_sink: list | None = None) -> str:
    prompt = f"Question: {question}\nSlots: {slots}\nrestaurant_id placeholder: '{restaurant_id}'"
    raw = await complete(settings.sql_model, SYSTEM, prompt, max_tokens=400, usage_sink=usage_sink)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(sql)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.MULTILINE)
    return validate_sql(raw, restaurant_id)


async def execute_sql(sql: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
    return [dict(r) for r in rows]
