-- compensation_rules.evaluate_order() already computes a human-readable
-- `reason` sentence and a `clause` label ("§4.2 Weather & Force Majeure")
-- for every claim it drafts — compensation_sweep.py just discarded both
-- after returning them once in the sweep's own API response, so a claim
-- persisted no explanation of why it exists beyond its amount.
--
-- Persisted rather than recomputed on read: PolicyParams' thresholds are
-- versioned (see compensation_rules.py's own docstring, and
-- policy_impact.py, which exists specifically to compare old vs. new
-- threshold behavior) — if those thresholds change later, a claim drafted
-- under the old rules should keep showing the reasoning that was actually
-- true when it was drafted, not a reason re-derived under today's rules
-- that might no longer match the amount that was actually recorded.
alter table compensation_claims
  add column if not exists reason text,
  add column if not exists clause text;
