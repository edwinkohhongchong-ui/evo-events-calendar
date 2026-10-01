-- +EVO Events Calendar — Supabase schema
-- HISTORICAL BASELINE (the original v0 schema). The live database has moved on:
-- apply supabase_migration_002 onward on top of this, in order. Some definitions
-- below (e.g. the events.level CHECK list) are superseded by later migrations.
-- See MIGRATIONS_APPLIED.md for what exists and what has been run.
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  event_time time,
  level text not null check (level in ('Churchwide','Youth','Tertiary','Adults','COW','Thirdspace','Gathering')),
  recurring text not null default 'None' check (recurring in ('None','Weekly','Monthly','Yearly')),
  repeat_until date,
  notes text,
  created_at timestamptz default now()
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  type text not null check (type in (
    'National (SG Public Holiday)',
    'National (SG Public Holiday, provisional)',
    'National (SG Observance)',
    'School Schedule',
    'International Observance',
    'Church Observance',
    'Custom'
  ))
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('Ministry Season','School Schedule','Exam Period','Growth Track','Other')),
  start_date date not null,
  end_date date not null,
  notes text
);

create table checklist (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item text not null,
  status text not null default 'Not Started' check (status in ('Not Started','In Progress','Done')),
  target_month text check (target_month in ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')),
  notes text
);

create table month_focus (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  series_focus text,
  key_theme text,
  notes text,
  unique (year, month)
);

-- ---------- Seed data: 2026 Singapore public holidays (source: MOM, 16 Jun 2025 press release) ----------
insert into holidays (holiday_date, name, type) values
('2026-01-01', E'New Year''s Day', 'National (SG Public Holiday)'),
('2026-02-14', E'Valentine''s Day', 'International Observance'),
('2026-02-17', 'Chinese New Year (Day 1)', 'National (SG Public Holiday)'),
('2026-02-18', 'Chinese New Year (Day 2) / Ash Wednesday', 'National (SG Public Holiday)'),
('2026-03-08', E'International Women''s Day', 'International Observance'),
('2026-03-20', 'Hari Raya Puasa', 'National (SG Public Holiday, provisional)'),
('2026-03-23', 'School Day Off-in-Lieu (Hari Raya Puasa)', 'School Schedule'),
('2026-03-29', 'Palm Sunday', 'Church Observance'),
('2026-04-03', 'Good Friday', 'National (SG Public Holiday)'),
('2026-04-05', 'Easter Sunday', 'Church Observance'),
('2026-04-22', 'Earth Day', 'International Observance'),
('2026-05-01', 'Labour Day', 'National (SG Public Holiday)'),
('2026-05-10', E'Mother''s Day', 'International Observance'),
('2026-05-27', 'Hari Raya Haji', 'National (SG Public Holiday, provisional)'),
('2026-05-31', 'Vesak Day', 'National (SG Public Holiday)'),
('2026-06-01', 'Vesak Day (In-Lieu)', 'National (SG Public Holiday)'),
('2026-06-21', E'Father''s Day', 'International Observance'),
('2026-07-05', 'Youth Day', 'National (SG Observance)'),
('2026-07-06', 'Youth Day (School Holiday)', 'School Schedule'),
('2026-07-21', 'Racial Harmony Day', 'National (SG Observance)'),
('2026-08-09', 'National Day', 'National (SG Public Holiday)'),
('2026-08-10', 'National Day (In-Lieu)', 'National (SG Public Holiday)'),
('2026-09-04', E'Teachers'' Day', 'National (SG Observance)'),
('2026-10-02', E'Children''s Day (Primary Schools)', 'School Schedule'),
('2026-11-08', 'Deepavali', 'National (SG Public Holiday)'),
('2026-11-09', 'Deepavali (In-Lieu)', 'National (SG Public Holiday)'),
('2026-12-25', 'Christmas Day', 'National (SG Public Holiday)'),
('2026-12-31', E'New Year''s Eve', 'Church Observance');

-- ---------- Seed data: seasons / school schedules (MOE official 2026 term dates + ministry seasons carried over from original file) ----------
insert into seasons (name, category, start_date, end_date, notes) values
('RF 2025/2026', 'Ministry Season', '2025-12-01', '2026-02-28', 'Carried over from original calendar — adjust as needed'),
('LBF I: 500', 'Ministry Season', '2026-01-05', '2026-03-15', '10 weeks — from original calendar'),
('Growth Cycle 1', 'Ministry Season', '2026-01-05', '2026-03-01', ''),
('Growth Cycle 2', 'Ministry Season', '2026-03-02', '2026-04-26', ''),
('Growth Cycle 3', 'Ministry Season', '2026-04-27', '2026-06-21', ''),
('MOE School Term 1', 'School Schedule', '2026-01-06', '2026-03-13', 'Primary/Secondary/JC'),
('MOE March School Holidays', 'School Schedule', '2026-03-14', '2026-03-22', ''),
('MOE School Term 2', 'School Schedule', '2026-03-23', '2026-05-29', ''),
('MOE June School Holidays', 'School Schedule', '2026-05-30', '2026-06-28', ''),
('MOE School Term 3', 'School Schedule', '2026-06-29', '2026-09-04', ''),
('MOE September School Holidays', 'School Schedule', '2026-09-05', '2026-09-13', ''),
('MOE School Term 4', 'School Schedule', '2026-09-14', '2026-11-20', 'O-Level venue schools end 23 Oct'),
('Poly Examinations (approx.)', 'Exam Period', '2026-02-16', '2026-02-27', 'Verify exact dates each semester'),
('Poly Holidays (approx.)', 'School Schedule', '2026-03-06', '2026-04-18', 'Verify exact dates each semester'),
('Uni Examinations (approx.)', 'Exam Period', '2026-04-20', '2026-05-08', 'Verify exact dates each semester');

-- ---------- Seed data: starter checklist (from original file, restructured) ----------
insert into checklist (category, item, status, target_month, notes) values
('Pastoral Admin', E'Put in ''special days'' (Pastoral Admin)', 'Not Started', 'Jan', ''),
('Pastoral Admin', 'Confirm major holidays for the year', 'Done', 'Jan', ''),
('Pastoral Admin', 'Mark out school holidays', 'Done', 'Jan', ''),
('Pastoral Admin', 'CNY break arrangements', 'Not Started', 'Feb', ''),
('Big Days', 'Easter', 'Not Started', 'Apr', ''),
('Big Days', 'Christmas', 'Not Started', 'Dec', ''),
('Big Days', 'Anniversary', 'Not Started', null, ''),
('Schedules', 'Prepare school schedules (Pri/Sec/JC/Poly/Uni)', 'Done', 'Jan', ''),
('Schedules', 'Prepare Preaching Schedule', 'Not Started', 'Jan', ''),
('Schedules', 'Prepare COW Schedule', 'Done', 'Jan', ''),
('Training', 'TIC', 'Not Started', null, ''),
('Training', 'Exposure (mission trip, conferences)', 'Not Started', null, ''),
('Training', 'Discipleship group', 'Not Started', null, ''),
('Special Events', 'Leaders retreat', 'Not Started', null, ''),
('Special Events', 'Gala dinner', 'Not Started', null, ''),
('Reno', 'Launch', 'Not Started', 'Aug', '');

-- ---------- Seed data: a few example events to prove the model works ----------
insert into events (name, event_date, event_time, level, recurring, repeat_until, notes) values
('Sunday Gathering', '2026-01-04', '15:00', 'Churchwide', 'Weekly', '2026-12-27', 'Example — repeats every Sunday all year'),
('+EVO YTH Groups — Jurong', '2026-01-20', '14:00', 'Youth', 'None', null, 'Example — one-off entry'),
('Easter Sunday Big Day', '2026-04-05', '15:00', 'Churchwide', 'None', null, 'Example');

-- ---------- Row Level Security ----------
-- v1 has no auth (internal tool, single shared URL). Enable RLS with a permissive
-- policy so the anon key can read/write. Tighten this later if you add auth.
alter table events enable row level security;
alter table holidays enable row level security;
alter table seasons enable row level security;
alter table checklist enable row level security;
alter table month_focus enable row level security;

create policy "allow all - events" on events for all using (true) with check (true);
create policy "allow all - holidays" on holidays for all using (true) with check (true);
create policy "allow all - seasons" on seasons for all using (true) with check (true);
create policy "allow all - checklist" on checklist for all using (true) with check (true);
create policy "allow all - month_focus" on month_focus for all using (true) with check (true);
