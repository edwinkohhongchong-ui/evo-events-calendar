-- +EVO Events Calendar — Migration 015: day notes
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Short freeform tags attached to a specific calendar date, shown as plain
-- green text in the day cell (not an event card) — e.g. "Send a card to
-- friends" on a holiday. A day can have several; each is its own row,
-- deletable independently. No author tracking, unlike note_comments
-- (migration 011) — these are meant to be quick, not a discussion log.

create table day_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null,
  content text not null,
  created_at timestamptz default now()
);

create index day_notes_note_date_idx on day_notes (note_date);

alter table day_notes enable row level security;
create policy "allow all - day_notes" on day_notes for all using (true) with check (true);
