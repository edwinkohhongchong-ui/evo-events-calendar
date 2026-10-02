-- +EVO Events Calendar — Migration 025: Owner (free-text name) on events and event checklist items
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- Safe to run more than once. No existing data is changed.

alter table events add column if not exists owner text;
alter table event_checklist_items add column if not exists owner text;

-- Max 60 characters, matching the app. Added only if missing so a re-run is a no-op.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_owner_len') then
    alter table events add constraint events_owner_len check (owner is null or char_length(owner) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_checklist_items_owner_len') then
    alter table event_checklist_items
      add constraint event_checklist_items_owner_len check (owner is null or char_length(owner) <= 60);
  end if;
end $$;
