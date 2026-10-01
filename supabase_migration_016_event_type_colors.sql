-- NOTE: structure is re-run safe, but this file also renames/moves existing
-- data. Apply once, in order; do not re-run on a database already past it.
-- +EVO Events Calendar — Migration 016: Event Type colors (Churchwide/Zone/TG)
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Widens the levels.color_key palette with 4 new literal colors (red,
-- yellow, blue, green) needed for the new Churchwide/Zone/TG grouping in the
-- Add/Edit Event form, merges the COW and Thirdspace levels into one
-- "COW/Thirdspace" level, adds a new "TG" (TEVO Groups) level, and recolors
-- the existing levels to match. "Gathering" is untouched — it stays amber
-- and keeps its own separate add/edit flow, not part of this scheme.

-- 1. Widen the CHECK constraint on levels.color_key (name looked up
-- dynamically, same technique as migration 006, since Postgres's
-- auto-generated constraint name isn't guaranteed across setups).
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'levels'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%color_key%';
  if cname is not null then
    execute format('alter table levels drop constraint %I', cname);
  end if;
end $$;

alter table levels drop constraint if exists levels_color_key_check;
alter table levels add constraint levels_color_key_check check (color_key in (
  'indigo', 'teal', 'rose', 'amber', 'sky',
  'purple', 'emerald', 'orange', 'pink', 'cyan',
  'red', 'yellow', 'blue', 'green'
));

-- 1b. Same widening on seasons.color (migration 004) — it shares the same
-- palette in the UI's color picker, so needs the same 4 new keys allowed.
alter table seasons drop constraint if exists seasons_color_check;
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'seasons'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%color%';
  if cname is not null then
    execute format('alter table seasons drop constraint %I', cname);
  end if;
end $$;

alter table seasons drop constraint if exists seasons_color_check;
alter table seasons add constraint seasons_color_check check (color is null or color in (
  'indigo', 'teal', 'rose', 'amber', 'sky',
  'purple', 'emerald', 'orange', 'pink', 'cyan',
  'red', 'yellow', 'blue', 'green'
));

-- 2. Merge Thirdspace into COW, renamed "COW/Thirdspace" — events on
-- Thirdspace are repointed first (the events_level_fkey's ON UPDATE CASCADE
-- only fires on a rename of the row an event already points to, not on a
-- merge into a different existing row), then the old Thirdspace row is
-- dropped.
update events set level = 'COW' where level = 'Thirdspace';
delete from levels where name = 'Thirdspace';
update levels set name = 'COW/Thirdspace', color_key = 'green' where name = 'COW';

-- 3. Recolor the rest to match the new Churchwide/Zone/TG scheme.
update levels set color_key = 'red' where name = 'Churchwide';
update levels set color_key = 'yellow' where name = 'Youth';
update levels set color_key = 'blue' where name = 'Poly';
update levels set color_key = 'purple' where name = 'Uni';
update levels set color_key = 'pink' where name = 'Adults';
-- Gathering keeps its existing 'amber' — not touched.

-- 4. Add the new "TG" (TEVO Groups) level.
insert into levels (name, color_key, sort_order)
select 'TG', 'orange', coalesce((select max(sort_order) + 1 from levels), 0)
where not exists (select 1 from levels where name = 'TG');
