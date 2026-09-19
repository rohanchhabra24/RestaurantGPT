"""validate_sql is the guardrail standing between an LLM-generated query
and the database — these cases are the exploit patterns considered during
the security hardening pass (see README's "Privacy & tenant isolation"),
encoded as regression tests so a future change to the regex can't silently
reopen one.
"""

import pytest

from app.services.sql_engine import SQLValidationError, validate_sql

RID = "550e8400-e29b-41d4-a716-446655440000"
OTHER_RID = "00000000-0000-0000-0000-000000000099"


def test_valid_query_passes():
    sql = f"SELECT id, aggregator_order_id FROM orders WHERE restaurant_id = '{RID}' AND is_cancelled = true"
    result = validate_sql(sql, RID)
    assert "LIMIT 200" in result


def test_aggregate_query_not_given_a_limit():
    sql = f"SELECT count(*) FROM orders WHERE restaurant_id = '{RID}'"
    result = validate_sql(sql, RID)
    assert "LIMIT" not in result.upper()


def test_missing_tenant_filter_rejected():
    with pytest.raises(SQLValidationError):
        validate_sql("SELECT id FROM orders WHERE is_cancelled = true", RID)


def test_union_bypass_rejected():
    sql = f"SELECT id FROM orders WHERE restaurant_id = '{RID}' UNION SELECT id FROM orders WHERE restaurant_id != '{RID}'"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_negated_filter_rejected():
    sql = f"SELECT id FROM orders WHERE restaurant_id != '{OTHER_RID}'"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_comment_hiding_fake_filter_rejected():
    sql = f"SELECT id FROM orders WHERE 1=1 -- restaurant_id = '{RID}'"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_block_comment_hiding_fake_filter_rejected():
    sql = f"SELECT id FROM orders WHERE 1=1 /* restaurant_id = '{RID}' */"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_multi_statement_rejected():
    sql = f"SELECT id FROM orders WHERE restaurant_id = '{RID}'; DROP TABLE orders"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_non_orders_table_rejected():
    sql = f"SELECT restaurant_id FROM policy_chunks WHERE restaurant_id = '{RID}'"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_non_select_rejected():
    with pytest.raises(SQLValidationError):
        validate_sql(f"UPDATE orders SET total_amount = 0 WHERE restaurant_id = '{RID}'", RID)


def test_other_tenant_id_elsewhere_in_query_is_fine():
    # The real tenant's id must be a genuine filter — but nothing stops the
    # id appearing elsewhere too (e.g. inside a legitimate string literal).
    sql = f"SELECT id FROM orders WHERE restaurant_id = '{RID}' AND cancellation_reason = 'mentions {OTHER_RID}'"
    validate_sql(sql, RID)  # should not raise


def test_top_level_or_bypass_rejected():
    # Containing the filter isn't the same as being scoped by it — a bare
    # OR after the tenant filter still matches the substring/negation
    # checks above while returning every tenant's rows.
    sql = f"SELECT id FROM orders WHERE restaurant_id = '{RID}' OR 1=1"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_top_level_or_bypass_rejected_when_widening_condition_first():
    sql = f"SELECT id FROM orders WHERE total_amount > -1 OR restaurant_id = '{RID}'"
    with pytest.raises(SQLValidationError):
        validate_sql(sql, RID)


def test_parenthesized_or_scoped_by_tenant_filter_is_fine():
    # An OR is safe once it's nested inside a group that the tenant filter
    # itself ANDs with — it can never widen past that AND.
    sql = (
        f"SELECT id FROM orders WHERE restaurant_id = '{RID}' "
        "AND (status = 'cancelled' OR delivery_time_seconds > sla_target_seconds)"
    )
    validate_sql(sql, RID)  # should not raise


def test_or_inside_string_literal_is_fine():
    # The word "or" inside an actual string value (not SQL structure)
    # must not be mistaken for a widening top-level OR.
    sql = f"SELECT id FROM orders WHERE restaurant_id = '{RID}' AND cancellation_reason = 'refused or unreachable'"
    validate_sql(sql, RID)  # should not raise
