-- Multi-turn chat context: without this, every message was answered in
-- total isolation (pipeline.py had no way to know "what about Zone 4?"
-- was a follow-up to the previous question about Zone 3). last_slots
-- carries forward the last resolved date_range/zone/status so a follow-up
-- that omits them still resolves correctly, and last_route lets a
-- otherwise-too-ambiguous follow-up reuse the previous turn's route
-- instead of dead-ending into a generic "I need more detail" CLARIFY.
-- Both reset implicitly by starting a new conversation (the existing
-- "New question" button) — there's no explicit reset needed.
alter table conversations add column if not exists last_slots jsonb not null default '{}'::jsonb;
alter table conversations add column if not exists last_route text;
