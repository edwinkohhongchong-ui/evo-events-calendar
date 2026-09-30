-- +EVO Events Calendar — Migration 019: event location
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Optional free-text location for an event (e.g. "Main Hall", "Level 3
-- Auditorium") — shown alongside time in the Add/Edit Event form, the
-- Reminders page's event picker, and drafted reminder messages, since a
-- leader planning e-invites/logistics needs to know where, not just when.

alter table events add column location text;
