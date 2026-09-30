-- +EVO Events Calendar — Migration 020: updated_at + concurrent-edit detection
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Adds an `updated_at timestamptz` column to every mutable table, kept
-- current automatically by a BEFORE UPDATE trigger (so app code never has to
-- remember to set it manually on every update statement). This is the data
-- half of optimistic-lock concurrent-edit detection: the app layer can
-- compare a caller's expected `updated_at` against the row's current value
-- before applying an update, and detect "someone else changed this since you
-- loaded it" instead of silently last-write-wins.
--
-- One reusable trigger function, attached per table, rather than copy-pasting
-- the same `NEW.updated_at = now()` logic on every table's own trigger.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- events
alter table events add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on events;
create trigger set_updated_at
before update on events
for each row execute function set_updated_at();

-- holidays
alter table holidays add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on holidays;
create trigger set_updated_at
before update on holidays
for each row execute function set_updated_at();

-- seasons
alter table seasons add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on seasons;
create trigger set_updated_at
before update on seasons
for each row execute function set_updated_at();

-- levels
alter table levels add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on levels;
create trigger set_updated_at
before update on levels
for each row execute function set_updated_at();

-- checklist
alter table checklist add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on checklist;
create trigger set_updated_at
before update on checklist
for each row execute function set_updated_at();

-- day_notes
alter table day_notes add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on day_notes;
create trigger set_updated_at
before update on day_notes
for each row execute function set_updated_at();

-- note_comments
alter table note_comments add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on note_comments;
create trigger set_updated_at
before update on note_comments
for each row execute function set_updated_at();

-- reminder_templates
alter table reminder_templates add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on reminder_templates;
create trigger set_updated_at
before update on reminder_templates
for each row execute function set_updated_at();

-- checklist_templates
alter table checklist_templates add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on checklist_templates;
create trigger set_updated_at
before update on checklist_templates
for each row execute function set_updated_at();

-- checklist_template_items
alter table checklist_template_items add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on checklist_template_items;
create trigger set_updated_at
before update on checklist_template_items
for each row execute function set_updated_at();
