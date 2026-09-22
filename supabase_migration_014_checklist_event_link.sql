-- +EVO Events Calendar — Migration 014: checklist items linked to events
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- ON DELETE SET NULL: deleting the linked event automatically clears the
-- link (rather than blocking the delete, or leaving a dangling id) — the
-- checklist item just goes back to unlinked, ready to be relinked or
-- manually managed. The "Check Calendar" button then reconciles status
-- (Done when linked, Not Started when not) against whatever the link
-- currently says.

alter table checklist add column linked_event_id uuid references events(id) on delete set null;
