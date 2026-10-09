"""JsonLogFormatter and the request-id validation helper are pure logic
(no DB/network), split out from the middleware classes themselves so they
can be unit-tested directly — RequestIdMiddleware/AccessLogMiddleware's
end-to-end behavior (header set, logged, honored vs. rejected) is
exercised via a live TestClient request instead, since that's what
actually proves the wiring, not just the pieces.
"""

import json
import logging

from app.middleware import JsonLogFormatter, _looks_like_uuid


def _format(record: logging.LogRecord) -> dict:
    return json.loads(JsonLogFormatter().format(record))


def _make_record(msg="hello", extra=None, exc_info=None):
    record = logging.LogRecord(
        name="access", level=logging.INFO, pathname=__file__, lineno=1,
        msg=msg, args=(), exc_info=exc_info,
    )
    for key, value in (extra or {}).items():
        setattr(record, key, value)
    return record


def test_format_includes_standard_fields():
    payload = _format(_make_record("GET /api/health -> 200"))
    assert payload["level"] == "INFO"
    assert payload["logger"] == "access"
    assert payload["message"] == "GET /api/health -> 200"
    assert "timestamp" in payload


def test_format_surfaces_extra_fields_as_top_level_keys():
    payload = _format(_make_record(extra={"request_id": "abc-123", "status": 200, "duration_ms": 42}))
    assert payload["request_id"] == "abc-123"
    assert payload["status"] == 200
    assert payload["duration_ms"] == 42


def test_format_output_is_single_line_valid_json():
    # json.dumps never embeds a literal newline for plain scalar values —
    # this is what actually matters for "one JSON object per line" log
    # aggregation to work at all.
    line = JsonLogFormatter().format(_make_record("multi\nline message"))
    assert "\n" not in line
    json.loads(line)  # raises if malformed


def test_format_handles_non_json_serializable_extra_values():
    class Weird:
        def __str__(self):
            return "weird-object"

    payload = _format(_make_record(extra={"thing": Weird()}))
    assert payload["thing"] == "weird-object"


def test_looks_like_uuid_accepts_valid_uuid():
    assert _looks_like_uuid("11111111-1111-1111-1111-111111111111") is True


def test_looks_like_uuid_rejects_garbage():
    # The exact threat this guards against: an upstream caller (or a
    # direct client) setting X-Request-ID to something that isn't a safe,
    # bounded value — this must never be echoed back or logged verbatim.
    assert _looks_like_uuid("<script>evil</script>") is False
    assert _looks_like_uuid("") is False
    assert _looks_like_uuid("not-a-uuid") is False
