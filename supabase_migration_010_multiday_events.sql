-- +EVO Events Calendar — Migration 010: multi-day events
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- end_date is nullable: null means single-day (same as event_date), a
-- concrete date means the event spans [event_date, end_date] inclusive.
-- Mirrors the existing new_date/new_time override pattern — new_end_date on
-- event_overrides lets a single occurrence of a recurring series become
-- multi-day (via the drag-to-resize handle) without changing the series'
-- own end_date, which stays the template every future occurrence inherits.

alter table events add column end_date date;
alter table event_overrides add column new_end_date date;
