-- +EVO Events Calendar — Migration 009: general (all-months) notes
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Single-row table for notes that show regardless of which month is being
-- viewed (left-hand column) — distinct from month_focus.notes, which is
-- specific to one year/month (right-hand column, see PROJECT decision:
-- Focus Panel's old "Notes" field moved there, not duplicated).
-- id is always 'singleton' — pre-seeded below so the app can always UPDATE
-- rather than needing upsert logic.

create table general_notes (
  id text primary key default 'singleton',
  content text,
  updated_at timestamptz default now()
);

insert into general_notes (id, content) values ('singleton', null);

alter table general_notes enable row level security;
create policy "allow all - general_notes" on general_notes for all using (true) with check (true);
