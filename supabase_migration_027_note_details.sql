-- +EVO Events Calendar — Migration 027: details (remarks) on calendar day notes and holidays
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- Safe to run more than once. No existing data is changed.
--
-- Optional longer text shown when someone clicks a day note or a holiday on
-- the calendar. Null = no details. (Events and seasons already have `notes`.)

alter table day_notes add column if not exists details text;
alter table holidays add column if not exists details text;

-- Max 2000 characters, matching the app. Added only if missing so a re-run is a no-op.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'day_notes_details_len') then
    alter table day_notes add constraint day_notes_details_len check (details is null or char_length(details) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'holidays_details_len') then
    alter table holidays add constraint holidays_details_len check (details is null or char_length(details) <= 2000);
  end if;
end $$;
