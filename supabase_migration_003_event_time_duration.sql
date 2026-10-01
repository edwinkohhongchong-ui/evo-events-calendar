-- +EVO Events Calendar — Migration 003: end time + duration for events
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- (Same workflow as prior migrations — additive, does not touch existing data.)
-- event_time remains the start time column (not renamed), to avoid touching
-- every place that already reads it.

alter table events add column if not exists end_time time;
alter table events add column if not exists duration_minutes integer
  check (duration_minutes is null or duration_minutes >= 0);
