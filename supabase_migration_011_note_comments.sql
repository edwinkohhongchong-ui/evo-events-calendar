-- +EVO Events Calendar — Migration 011: notes become a comment log
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Replaces the single freeform-textarea notes (general_notes.content,
-- month_focus.notes) with an append-only log of individual comments, each
-- carrying who wrote it and when — so a team can see who added what instead
-- of one field silently overwritten by whoever edited it last.
--
-- The old general_notes table and month_focus.series_focus/key_theme/notes
-- columns are left in place, unused, rather than dropped — they're harmless
-- dead data, and dropping them would be a one-way loss for no real benefit.
-- (Series/Sermon Focus and Key Theme are also retired as a UI concept per
-- PROJECT decision — redundant with the notes columns and rarely used.)

create table note_comments (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('general', 'month')),
  year int,
  month int,
  author_name text not null,
  content text not null,
  created_at timestamptz default now(),
  constraint note_comments_scope_fields check (
    (scope = 'general' and year is null and month is null) or
    (scope = 'month' and year is not null and month is not null)
  )
);

alter table note_comments enable row level security;
create policy "allow all - note_comments" on note_comments for all using (true) with check (true);

-- Carries forward the one real note that existed under the old design
-- (July 2026's month_focus.notes) so it isn't silently lost from view.
insert into note_comments (scope, year, month, author_name, content)
values ('month', 2026, 7, 'Imported note', 'test');
