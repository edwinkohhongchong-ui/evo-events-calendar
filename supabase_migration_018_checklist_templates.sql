-- +EVO Events Calendar — Migration 018: checklist templates
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- A reusable set of checklist items (e.g. "Big Event Prep") that can be
-- applied to any event in one click from the Reminders page's event picker
-- — expands into real `checklist` rows linked to that event, instead of
-- typing the same standard to-dos in one at a time for every big event.
-- repeat_count > 1 expands one template line into that many numbered
-- checklist rows (e.g. a weekly check-in repeated across several weeks).

create table if not exists checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  item text not null,
  repeat_count int not null default 1,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table checklist_templates enable row level security;
drop policy if exists "allow all - checklist_templates" on checklist_templates;
create policy "allow all - checklist_templates" on checklist_templates for all using (true) with check (true);

alter table checklist_template_items enable row level security;
drop policy if exists "allow all - checklist_template_items" on checklist_template_items;
create policy "allow all - checklist_template_items" on checklist_template_items for all using (true) with check (true);

-- Seed with the standard "Big Event Prep" checklist for Churchwide-scale
-- events (Churchwide Gatherings, YTH Gathering, +EVO YTH Big Day,
-- Easter/XMAS) — edit or delete freely from the Checklist page afterward.
do $$
declare
  new_template_id uuid;
begin
  if exists (select 1 from checklist_templates where name = 'Big Event Prep') then
    return;
  end if;
  insert into checklist_templates (name) values ('Big Event Prep')
  returning id into new_template_id;

  insert into checklist_template_items (template_id, item, repeat_count, sort_order) values
    (new_template_id, 'Invite / e-invite (at least 4 weeks before event)', 1, 0),
    (new_template_id, 'Pastoral attendance check-in', 4, 1),
    (new_template_id, 'Post-event follow-up plans', 1, 2);
end $$;
