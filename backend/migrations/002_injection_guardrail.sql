-- Prompt-injection guardrail on the ingestion path (product.md §2.6 /
-- Phase 2). Ingested policy text is attacker-reachable — anyone who can get
-- a document uploaded (or, in a later phase, a customer review indexed) can
-- try to plant instructions aimed at the assistant rather than genuine
-- policy content. Flagged chunks are quarantined from retrieval, not
-- deleted — an operator reviews and clears or removes them.

alter table policy_chunks add column if not exists flagged boolean not null default false;
alter table policy_chunks add column if not exists flag_reason text;

create index if not exists idx_policy_chunks_flagged on policy_chunks(restaurant_id, flagged) where flagged;
