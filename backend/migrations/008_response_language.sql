-- Per-user (not per-restaurant) response-language preference — different
-- staff on the same restaurant account may want different languages, so
-- this lives on restaurant_members (one row per user per restaurant)
-- rather than on restaurants. 'english' stays the default: nothing about
-- existing behavior changes until someone explicitly opts into
-- 'hindi'/'hinglish' via PATCH /api/settings.
alter table restaurant_members
  add column if not exists response_language text not null default 'english'
    check (response_language in ('english', 'hindi', 'hinglish'));

-- The semantic response cache (response_cache, migrations/005) was keyed
-- only by restaurant_id + data_version — without this column, an English
-- answer cached by one staff member would get served back verbatim to a
-- colleague who asked the same question in Hindi. Existing cached rows
-- backfill to 'english' (the only language that existed when they were
-- written), which is correct: they really were English answers.
alter table response_cache
  add column if not exists response_language text not null default 'english'
    check (response_language in ('english', 'hindi', 'hinglish'));
