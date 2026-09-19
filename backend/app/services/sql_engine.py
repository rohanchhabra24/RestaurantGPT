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
- If you need OR logic (e.g. "cancelled or delayed"), always wrap it in
  parentheses and AND it with the tenant filter, e.g.
  `restaurant_id = '{{restaurant_id}}' AND (status = 'cancelled' OR delivery_time_seconds > sla_target_seconds)`.
  Never write OR outside parentheses at the top level of the WHERE clause —
  it will be rejected.
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


def _mask_string_literals(sql: str) -> str:
    """Blanks out the contents of every '...' literal (keeping the quotes
    and length) so paren-depth tracking and keyword scanning below can't
    be thrown off by parens or the word "or" appearing inside a string
    value rather than as actual SQL structure."""
    return re.sub(r"'(?:[^']|'')*'", lambda m: "'" + " " * (len(m.group(0)) - 2) + "'", sql)


def _has_top_level_or(where_clause: str) -> bool:
    """True if `or` appears at paren-depth 0 in the WHERE clause text —
    i.e. not safely nested under the mandatory tenant-filter AND.

    Substring presence of `restaurant_id = '<id>'` isn't enough to prove
    a query is actually scoped to that tenant: `where restaurant_id = 'X'
    or 1=1` contains the filter but returns every row regardless of it,
    since a bare OR at the top level of a WHERE clause widens past
    whatever AND-chain precedes it. `where restaurant_id = 'X' and
    (status = 'a' or status = 'b')` is fine — that OR only ever applies
    inside the parenthesized group, which is itself AND-scoped to the
    tenant filter. This is a paren-depth scan, not a full parser, which
    matches this module's existing regex/allow-list approach rather than
    the sqlglot-based AST validator noted as the production upgrade path.
    """
    masked = _mask_string_literals(where_clause)
    depth = 0
    for match in re.finditer(r"\(|\)|\bor\b", masked, re.IGNORECASE):
        token = match.group(0)
        if token == "(":
            depth += 1
        elif token == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            return True
    return False


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

    # Containing the filter isn't the same as being SCOPED by it — a top-
    # level `OR` after `restaurant_id = '<id>'` (e.g. `... OR 1=1`) still
    # matches the check above while returning every tenant's rows. Only
    # the WHERE clause matters here (ORDER BY/GROUP BY/LIMIT can't smuggle
    # a widening OR into the row filter itself).
    where_match = re.search(r"\bwhere\b(.*)$", stripped, re.IGNORECASE | re.DOTALL)
    where_clause = where_match.group(1) if where_match else ""
    where_clause = re.split(
        r"\bgroup\s+by\b|\border\s+by\b|\blimit\b", where_clause, maxsplit=1, flags=re.IGNORECASE
    )[0]
    if _has_top_level_or(where_clause):
        raise SQLValidationError(
            "Generated query has a top-level OR that could widen past the tenant filter "
            "(wrap OR conditions in parentheses, ANDed with the tenant filter)"
        )

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
