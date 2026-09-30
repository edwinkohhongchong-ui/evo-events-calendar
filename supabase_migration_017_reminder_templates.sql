-- +EVO Events Calendar — Migration 017: reminder templates
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- Saved templates for the "Reminders" page — each stores a default message,
-- a default Telegram handle to draft to, and how many days ahead to
-- summarize events for. Nothing is sent automatically: the app only builds
-- a message and opens Telegram's own compose screen (t.me/<handle>?text=...)
-- for a human to review and send — no bot token, no server-side scheduling.

create table reminder_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_message text,
  default_telegram_handle text,
  include_event_summary boolean not null default true,
  lookahead_days int not null default 30,
  created_at timestamptz default now()
);

alter table reminder_templates enable row level security;
create policy "allow all - reminder_templates" on reminder_templates for all using (true) with check (true);
