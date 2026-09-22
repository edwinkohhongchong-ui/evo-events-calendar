-- +EVO Events Calendar — Migration 006: dynamic event categories (Levels)
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Replaces the hardcoded 7-value CHECK constraint on events.level with a real
-- `levels` table, editable from the app's new /levels admin page. events.level
-- becomes a foreign key into levels.name (not levels.id) so existing event
-- rows don't need to change — only the constraint mechanism changes.
--
-- ON UPDATE CASCADE: renaming a category in the admin UI automatically
-- updates every event that used the old name.
-- ON DELETE RESTRICT: you can't delete a category that's still in use by an
-- event — the app surfaces this as a save error rather than silently
-- orphaning events.

create table levels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color_key text not null check (color_key in (
    'indigo', 'teal', 'rose', 'amber', 'sky',
    'purple', 'emerald', 'orange', 'pink', 'cyan'
  )),
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table levels enable row level security;
create policy "allow all - levels" on levels for all using (true) with check (true);

-- Seed with the previous 7 built-in levels, minus "Tertiary" (retired —
-- confirmed zero live events used it), plus "Poly" and "Uni" in its place.
insert into levels (name, color_key, sort_order) values
('Churchwide', 'indigo', 0),
('Youth', 'orange', 1),
('Poly', 'purple', 2),
('Uni', 'cyan', 3),
('Adults', 'teal', 4),
('COW', 'rose', 5),
('Thirdspace', 'sky', 6),
('Gathering', 'amber', 7);

-- Drop the old inline CHECK constraint (name looked up dynamically since
-- Postgres's auto-generated constraint name isn't guaranteed across setups).
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%level%';
  if cname is not null then
    execute format('alter table events drop constraint %I', cname);
  end if;
end $$;

alter table events
  add constraint events_level_fkey
  foreign key (level) references levels(name)
  on update cascade on delete restrict;
