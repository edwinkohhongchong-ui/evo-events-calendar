-- Adds an optional, curated "automated check" tag to checklist items (Check Calendar extension).
alter table checklist add column auto_check_type text
  check (auto_check_type in ('school_holidays_present'));
