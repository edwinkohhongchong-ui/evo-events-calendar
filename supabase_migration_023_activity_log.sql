-- +EVO Events Calendar — Migration 023: activity log (notification bell)
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- One row per successful add/edit/delete/move/comment/undo/redo, written
-- best-effort by lib/activity.ts#logActivity (a failed insert never breaks
-- the real change). Read back by /api/activity for the notification bell.
-- Rows older than 30 days are pruned opportunistically by logActivity.

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_role text not null check (actor_role in ('editor','viewer')),
  action text not null check (action in ('added','edited','deleted','moved','commented','undid','redid')),
  entity text not null check (entity in ('event','holiday','season','category','checklist','note','comment','day_note','undo')),
  entity_id text,          -- id of the item (text so it can hold a date key too)
  label text not null,     -- short display name, max ~60 chars
  item_date date,          -- date the item belongs to (for linking to the right month), nullable
  href text                -- precomputed in-app link, nullable
);

create index activity_log_created_at_idx on activity_log (created_at desc);

alter table activity_log enable row level security;
create policy "allow all - activity_log" on activity_log for all using (true) with check (true);
