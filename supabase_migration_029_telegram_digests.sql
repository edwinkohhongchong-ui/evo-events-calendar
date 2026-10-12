-- +EVO Events Calendar — Migration 029: configurable Telegram group digests
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- Safe to run more than once. No existing data is changed and NO rows are added:
-- until an Editor creates a digest on the Reminders page, the app keeps sending
-- the built-in Sunday message exactly as before.
--
-- One row per scheduled digest. The daily cron job (vercel.json) sends every
-- enabled digest whose weekday matches today in Singapore, once per day
-- (last_sent_on is the once-a-day claim).
--   days_of_week : 0 = Sunday ... 6 = Saturday (Singapore weekday)
--   range_mode   : rest_of_month | this_week (to Sunday) | next_days (range_days, counting today)
--   levels       : category names to include; empty = all categories
--   override_text: a one-off edited message used for the NEXT send, then cleared
--   skip_next    : skip the next scheduled send, then cleared

create table if not exists telegram_digests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  enabled boolean not null default true,
  days_of_week int[] not null default '{0}'
    check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[0,1,2,3,4,5,6]),
  range_mode text not null default 'rest_of_month' check (range_mode in ('rest_of_month','this_week','next_days')),
  range_days int not null default 14 check (range_days between 1 and 90),
  include_events boolean not null default true,
  include_gatherings boolean not null default true,
  levels text[] not null default '{}',
  include_big_events boolean not null default true,
  big_lookahead_weeks int not null default 8 check (big_lookahead_weeks between 1 and 26),
  include_checklist_counts boolean not null default true,
  intro text check (intro is null or char_length(intro) <= 1000),
  outro text check (outro is null or char_length(outro) <= 1000),
  override_text text check (override_text is null or char_length(override_text) <= 4000),
  skip_next boolean not null default false,
  last_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table telegram_digests enable row level security;
drop policy if exists "allow all - telegram_digests" on telegram_digests;
create policy "allow all - telegram_digests" on telegram_digests for all using (true) with check (true);
