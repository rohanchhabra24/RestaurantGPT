-- Phase C.1 of the production-readiness plan: a correlation id tying a
-- query_traces row back to the specific HTTP request that produced it,
-- and to that request's own line in the access log (AccessLogMiddleware
-- now logs the same id). Nullable and not backfilled — historical rows
-- predate this and have no request to tie back to, which is honest, not
-- a bug.
alter table query_traces add column if not exists request_id uuid;
