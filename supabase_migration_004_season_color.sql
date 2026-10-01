-- +EVO Events Calendar — Migration 004: season bar color
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- (Same workflow as prior migrations — additive, does not touch existing data.)
-- Nullable on purpose: a null color means "use the deterministic auto-suggested
-- color for this season's name" — computed at render time, not backfilled.

alter table seasons add column if not exists color text
  check (color is null or color in (
    'indigo', 'teal', 'rose', 'amber', 'sky',
    'purple', 'emerald', 'orange', 'pink', 'cyan'
  ));
