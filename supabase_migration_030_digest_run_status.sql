-- +EVO Events Calendar — Migration 030: Telegram digest run status
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
-- Safe to run more than once. No existing data is changed (the three new
-- columns start empty). The app works with or without this migration: without
-- it a digest is attempted once a day, as before; with it the cron's second
-- daily run can recover a send that crashed after being claimed, and the
-- Reminders page can show "Last run: sent / FAILED".
--   last_attempt_at : when the cron last claimed this digest
--   last_status     : sent | skipped | failed (null = claimed, send not confirmed)
--   last_error      : short fixed message when the last run failed (never driver text)

alter table telegram_digests add column if not exists last_attempt_at timestamptz;
alter table telegram_digests add column if not exists last_error text;
alter table telegram_digests add column if not exists last_status text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'telegram_digests_last_error_len') then
    alter table telegram_digests add constraint telegram_digests_last_error_len
      check (last_error is null or char_length(last_error) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'telegram_digests_last_status_check') then
    alter table telegram_digests add constraint telegram_digests_last_status_check
      check (last_status is null or last_status in ('sent','skipped','failed'));
  end if;
end $$;
