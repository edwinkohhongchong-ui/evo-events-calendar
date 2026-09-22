-- +EVO Events Calendar — Migration 012: note comment replies
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- One level of threading — a reply always points at a top-level comment,
-- not at another reply. ON DELETE CASCADE: removing a top-level comment
-- removes its replies too, rather than leaving them orphaned.

alter table note_comments add column parent_id uuid references note_comments(id) on delete cascade;
