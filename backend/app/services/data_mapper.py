"""LLM-powered CSV Data Mapper — every restaurant/POS system exports order
data with different column names, units, and status vocabulary (Zomato,
Swiggy, and a custom POS export are never shaped the same way). Rather than
hard-coding one CSV schema, the LLM proposes a mapping from the restaurant's
actual headers onto our fixed `orders` columns; our own code then applies
that mapping deterministically, row by row. The LLM never touches an actual
data value — it only ever decides *structure* (which header means what),
the same split used everywhere else in this app (text-to-SQL generates a
query, the query executes deterministically; this generates a mapping, the
mapping applies deterministically).

The proposal is never trusted blindly: every referenced source header is
checked against the real CSV headers, the response is schema-validated, and
nothing gets inserted until an operator confirms the mapping — see
ingestion.py's propose/confirm flow. A confirmed mapping is cached by a hash
of the header row (header_signature), so a restaurant's recurring export
format only ever needs one LLM call, ever.
"""

import hashlib
import re
from datetime import datetime
from typing import Literal

from dateutil import parser as dateutil_parser
from pydantic import BaseModel, field_validator

from app.config import settings
from app.services.claude_client import complete_json

# aggregator_order_id and placed_at are load-bearing — a row missing either
# can't be inserted at all. Everything else degrades gracefully to null.
TARGET_COLUMNS = [
    "aggregator_order_id",
    "placed_at",
    "zone",
    "platform",
    "status",
    "total_amount",
    "prep_time_seconds",
    "delivery_time_seconds",
    "cancellation_reason",
    "weather_flag",
]
REQUIRED_TARGET_COLUMNS = {"aggregator_order_id", "placed_at"}
VALID_STATUSES = {"delivered", "cancelled", "in_progress"}


class ColumnMapping(BaseModel):
    target: str
    kind: Literal["direct", "direct_scaled", "direct_currency", "timestamp_diff", "not_present"]
    source: str | None = None
    start_source: str | None = None
    end_source: str | None = None
    unit: Literal["seconds", "minutes", "hours"] | None = None
    # Only meaningful for target="status" — the DB's status column has a
    # hard CHECK constraint (delivered/cancelled/in_progress), so free-text
    # status values from the source system need an explicit raw->canonical
    # mapping, not just a column rename.
    value_map: dict[str, str] | None = None

    @field_validator("target")
    @classmethod
    def _target_is_known(cls, v: str) -> str:
        if v not in TARGET_COLUMNS:
            raise ValueError(f"Unknown target column {v!r} — must be one of {TARGET_COLUMNS}")
        return v


class MappingProposal(BaseModel):
    mappings: list[ColumnMapping]


SYSTEM = f"""You map a restaurant's raw order-export CSV columns onto this fixed schema:

- aggregator_order_id (text, required) — the platform's order id
- placed_at (timestamp, required) — when the order was placed
- zone (text) — delivery zone / area / locality
- platform (text) — aggregator name, e.g. swiggy, zomato
- status (text) — one of exactly: delivered, cancelled, in_progress
- total_amount (numeric) — order bill amount
- prep_time_seconds (int, seconds) — kitchen prep duration
- delivery_time_seconds (int, seconds) — total delivery duration, placed to delivered
- cancellation_reason (text)
- weather_flag (boolean) — true if weather caused a delay

For EVERY one of the 10 target columns above, output exactly one mapping object, chosen from:
- {{"target": "...", "kind": "direct", "source": "<their header>"}} — direct rename, value used as-is
- {{"target": "...", "kind": "direct_scaled", "source": "<their header>", "unit": "minutes"|"hours"|"seconds"}} — a duration column in a different unit than seconds
- {{"target": "prep_time_seconds"|"delivery_time_seconds", "kind": "timestamp_diff", "start_source": "<header>", "end_source": "<header>"}} — when the duration must be computed as the difference between two timestamp columns instead of reading a precomputed duration
- {{"target": "total_amount", "kind": "direct_currency", "source": "<their header>"}} — a money column that may carry a currency symbol or thousands separators
- {{"target": "status", "kind": "direct", "source": "<their header>", "value_map": {{"<raw value seen in the sample>": "delivered"|"cancelled"|"in_progress", ...}}}} — status is free text in most exports; map every distinct raw value you see in the sample rows to exactly one of the three canonical values
- {{"target": "...", "kind": "not_present"}} — no reasonable source column exists for this target in this file

Rules:
- "source"/"start_source"/"end_source" must always be EXACTLY one of the real CSV headers given to you — never invent, translate, or guess a header name that isn't in the list.
- Prefer "direct" over "not_present" whenever any header is a plausible match, even if the name doesn't match exactly (e.g. "Dropoff_Time" is very likely delivery_time_seconds if its sample values look like a duration, or the timestamp_diff target if it looks like a clock time and there's also an order-placed-time column).
- Respond with ONLY a JSON object: {{"mappings": [...]}} — exactly 10 entries, one per target column, nothing else."""


def header_signature(headers: list[str]) -> str:
    normalized = sorted(h.strip().lower() for h in headers if h is not None)
    return hashlib.sha256("|".join(normalized).encode()).hexdigest()


async def propose_mapping(headers: list[str], sample_rows: list[dict], usage_sink: list | None = None) -> MappingProposal:
    user = f"CSV headers: {headers}\n\nSample rows (up to 5):\n" + "\n".join(str(r) for r in sample_rows[:5])
    raw = await complete_json(settings.sql_model, SYSTEM, user, max_tokens=1500, usage_sink=usage_sink)
    proposal = MappingProposal.model_validate(raw)

    header_set = {h.strip() for h in headers if h is not None}
    for m in proposal.mappings:
        for referenced in (m.source, m.start_source, m.end_source):
            if referenced is not None and referenced not in header_set:
                raise ValueError(f"Proposed mapping references a column {referenced!r} that isn't in this CSV")

    return proposal


def _parse_currency(raw: str | None) -> float | None:
    if not raw or not raw.strip():
        return None
    # A naive "strip everything but digits/./-" breaks on currency prefixes
    # that contain a period themselves (e.g. "Rs. 500" -> ".500" -> 0.5, not
    # 500) — so instead find the actual digit run and treat sign separately.
    match = re.search(r"\d[\d,]*\.?\d*", raw)
    if not match:
        return None
    cleaned = match.group(0).replace(",", "")
    if cleaned in ("", "."):
        return None
    try:
        value = float(cleaned)
    except ValueError:
        return None
    is_negative = "-" in raw or "(" in raw  # accounting-style negatives use parens
    return -value if is_negative else value


_UNIT_TO_SECONDS = {"seconds": 1, "minutes": 60, "hours": 3600}


def _parse_scaled_duration(raw: str | None, unit: str | None) -> int | None:
    if not raw or not raw.strip():
        return None
    try:
        value = float(raw.strip())
    except ValueError:
        return None
    return round(value * _UNIT_TO_SECONDS[unit or "seconds"])


def _parse_datetime(raw: str | None) -> datetime | None:
    if not raw or not raw.strip():
        return None
    try:
        return dateutil_parser.parse(raw.strip())
    except (ValueError, OverflowError):
        return None


def _diff_seconds(start_raw: str | None, end_raw: str | None) -> int | None:
    start, end = _parse_datetime(start_raw), _parse_datetime(end_raw)
    if start is None or end is None:
        return None
    return max(0, round((end - start).total_seconds()))


def _resolve_status(raw: str | None, value_map: dict[str, str] | None) -> str | None:
    if not raw or not raw.strip():
        return None
    cleaned = raw.strip()
    if value_map:
        for k, v in value_map.items():
            if k.strip().lower() == cleaned.lower() and v in VALID_STATUSES:
                return v
    # The sample the LLM saw may not have covered every status value in the
    # full file — fall back to a plain keyword heuristic rather than reject
    # the row outright.
    lowered = cleaned.lower()
    if "cancel" in lowered or "reject" in lowered:
        return "cancelled"
    if "deliver" in lowered or "complete" in lowered or "success" in lowered:
        return "delivered"
    if "progress" in lowered or "pending" in lowered or "active" in lowered or "transit" in lowered:
        return "in_progress"
    return None


class MappedRow(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    aggregator_order_id: str | None = None
    placed_at: datetime | None = None
    zone: str | None = None
    platform: str | None = None
    status: str | None = None
    total_amount: float | None = None
    prep_time_seconds: int | None = None
    delivery_time_seconds: int | None = None
    cancellation_reason: str | None = None
    weather_flag: bool = False


def apply_mapping(mapping: MappingProposal, raw_rows: list[dict]) -> list[MappedRow]:
    """Pure, deterministic — no LLM call in this function. Every row in
    `raw_rows` produces exactly one MappedRow, including rows missing
    required fields (the caller decides whether to skip those)."""
    by_target = {m.target: m for m in mapping.mappings}
    out = []
    for raw in raw_rows:
        values: dict = {}
        for target in TARGET_COLUMNS:
            m = by_target.get(target)
            if m is None or m.kind == "not_present":
                continue
            source_value = raw.get(m.source) if m.source else None
            if m.kind == "direct" and target == "status":
                values[target] = _resolve_status(source_value, m.value_map)
            elif m.kind == "direct" and target == "weather_flag":
                values[target] = (source_value or "").strip().lower() in ("1", "true", "yes", "y")
            elif m.kind == "direct" and target == "placed_at":
                values[target] = _parse_datetime(source_value)
            elif m.kind == "direct":
                values[target] = (source_value or "").strip() or None
            elif m.kind == "direct_currency":
                values[target] = _parse_currency(source_value)
            elif m.kind == "direct_scaled":
                values[target] = _parse_scaled_duration(source_value, m.unit)
            elif m.kind == "timestamp_diff":
                values[target] = _diff_seconds(raw.get(m.start_source), raw.get(m.end_source))
        out.append(MappedRow(**values))
    return out
