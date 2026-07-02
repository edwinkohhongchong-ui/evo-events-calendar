-- +EVO Events Calendar — Migration 005: time overrides for recurring occurrences
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- (Same workflow as prior migrations — additive, does not touch existing data.)
--
-- new_time is nullable: null means "no time override on this row" — the
-- occurrence still uses the base event's current event_time. new_date stays
-- NOT NULL (unchanged) — it always holds the effective date, even on a row
-- that only overrides time, so no existing code that reads new_date as
-- "the current effective date" needs to learn a new null-handling case.

alter table event_overrides add column new_time time;
