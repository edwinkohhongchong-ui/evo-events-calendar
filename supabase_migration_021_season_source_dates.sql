-- +EVO Events Calendar — Migration 021: season source dates (manual exam/term entry assist)
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run

create table season_source_dates (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,   -- e.g. 'Polytechnic Exams', 'University Exams', 'MOE School Terms'
  institution text not null,  -- e.g. 'Ngee Ann Polytechnic', 'NUS'
  year int not null,
  start_date date,
  end_date date,
  updated_at timestamptz not null default now(),
  unique (group_name, institution, year)
);

create trigger season_source_dates_set_updated_at
  before update on season_source_dates
  for each row execute function set_updated_at();
