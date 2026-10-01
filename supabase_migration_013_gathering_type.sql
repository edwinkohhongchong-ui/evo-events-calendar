-- +EVO Events Calendar — Migration 013: Gathering type templates
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Only meaningful when event_type = 'Gathering' (null for 'Event' rows) —
-- drives the auto-populated title template (e.g. "Gathering with Edwin
-- Koh") in the Add/Edit form. A real column rather than parsed back out of
-- the saved name, same reasoning as pastoral_* in migration 008: robust,
-- not fragile string-matching.

alter table events add column if not exists gathering_type text
  check (gathering_type is null or gathering_type in (
    'Gathering', 'YTH Gathering', '+EVO YTH Big Day', 'Easter/XMAS'
  ));
