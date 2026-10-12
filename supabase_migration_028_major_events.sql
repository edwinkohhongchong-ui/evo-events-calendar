-- +EVO Events Calendar — Migration 028: "Big event" flag on events
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- Safe to run more than once. No existing data is changed (every event starts as not big).
--
-- A big event (Christmas, Easter, RLMF ...) is listed as a planning check in the
-- automatic Sunday Telegram message, up to 8 weeks ahead. The flag lives on the
-- event row, so for a repeating event it applies to every occurrence.

alter table events add column if not exists is_major boolean not null default false;
