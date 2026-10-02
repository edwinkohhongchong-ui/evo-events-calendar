-- +EVO Events Calendar — Migration 026: custom colours for Categories and Seasons
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Widens levels.color_key and seasons.color so that, besides the 14 named
-- palette keys, they accept a custom "#rrggbb" hex (chosen from the web-safe
-- grid or the colour wheel in the app). Idempotent and re-run safe; no data
-- is changed. seasons.color stays nullable (null = auto-suggested colour).

alter table levels drop constraint if exists levels_color_key_check;
alter table levels add constraint levels_color_key_check check (
  color_key in (
    'indigo', 'teal', 'rose', 'amber', 'sky',
    'purple', 'emerald', 'orange', 'pink', 'cyan',
    'red', 'yellow', 'blue', 'green'
  )
  or color_key ~ '^#[0-9a-fA-F]{6}$'
);

alter table seasons drop constraint if exists seasons_color_check;
alter table seasons add constraint seasons_color_check check (
  color is null
  or color in (
    'indigo', 'teal', 'rose', 'amber', 'sky',
    'purple', 'emerald', 'orange', 'pink', 'cyan',
    'red', 'yellow', 'blue', 'green'
  )
  or color ~ '^#[0-9a-fA-F]{6}$'
);
