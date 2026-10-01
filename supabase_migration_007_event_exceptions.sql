-- +EVO Events Calendar — Migration 007: per-occurrence edit/delete for recurring events
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- event_exceptions marks a specific occurrence (event_id + original_date) as
-- excluded from a recurring series' expansion — used by two flows:
--   - "Only this event" edit: the occurrence is pulled into its own
--     standalone `events` row, and its natural date is excepted here so the
--     series stops generating it.
--   - "Only this event" delete: same exception, with no replacement row.
-- ON DELETE CASCADE: deleting the whole series (the base event row) cleans
-- up its exceptions automatically, same as event_overrides already does.

create table if not exists event_exceptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  original_date date not null,
  created_at timestamptz default now(),
  unique (event_id, original_date)
);

alter table event_exceptions enable row level security;
drop policy if exists "allow all - event_exceptions" on event_exceptions;
create policy "allow all - event_exceptions" on event_exceptions for all using (true) with check (true);
