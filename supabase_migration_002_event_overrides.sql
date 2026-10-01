-- +EVO Events Calendar — Migration 002: per-occurrence overrides for recurring events
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- (Same workflow as supabase_schema.sql — this is additive, does not touch existing tables/data.)

create table if not exists event_overrides (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  original_date date not null,  -- the date this occurrence falls on per the recurrence rule (anchor-derived)
  new_date date not null,       -- the date the user dragged this single occurrence to
  created_at timestamptz default now(),
  unique (event_id, original_date)
);

alter table event_overrides enable row level security;
drop policy if exists "allow all - event_overrides" on event_overrides;

create policy "allow all - event_overrides" on event_overrides for all using (true) with check (true);
