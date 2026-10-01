-- +EVO Events Calendar — Migration 024: per-event checklists
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- Safe to run more than once.
--
-- 1. Checklist templates (the former "message snippets") get an optional due
--    offset per item: "weeks before the event".
-- 2. event_checklist_items: the tickable to-do list copied onto one event from
--    a template. Separate from the monthly `checklist` table on purpose.

alter table checklist_template_items add column if not exists weeks_before int;

create table if not exists event_checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  item text not null,
  weeks_before int,            -- null = no due date; due = event date minus N weeks
  done boolean not null default false,
  done_at timestamptz,
  done_by text,                -- display name typed in the browser, not an account
  source_template text,        -- name of the template it was copied from
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_checklist_items_event_id_idx on event_checklist_items (event_id);

alter table event_checklist_items enable row level security;
drop policy if exists "allow all - event_checklist_items" on event_checklist_items;
create policy "allow all - event_checklist_items" on event_checklist_items for all using (true) with check (true);
