-- +EVO Events Calendar — Migration 008: event type, pastoral focus, Gathering fields
-- Run this in Supabase: Project -> SQL Editor -> New Query -> paste -> Run
--
-- event_type splits events into "Event" (general — TG outings, Churchwide
-- events, etc.) and "Gathering" (Sunday service, with its own extra fields).
-- Existing rows default to 'Event' — there's no prior data to migrate.
--
-- pastoral_* are independent booleans, not a single-select — an Event can be
-- flagged for more than one group at once (e.g. Youth + Poly), which is
-- exactly the "YP: Study Mining" title-prefix case. This is deliberately
-- separate from `level`, which stays single-select and keeps driving the
-- calendar's color legend/grouping — pastoral focus only drives the title
-- prefix on Type 1 "Event" entries.
--
-- series/preacher_name/sermon_title/theme are only meaningful when
-- event_type = 'Gathering'; left null for 'Event' rows.

alter table events add column event_type text not null default 'Event' check (event_type in ('Event', 'Gathering'));

alter table events add column pastoral_youth boolean not null default false;
alter table events add column pastoral_poly boolean not null default false;
alter table events add column pastoral_uni boolean not null default false;
alter table events add column pastoral_adults boolean not null default false;

alter table events add column series text;
alter table events add column preacher_name text;
alter table events add column sermon_title text;
alter table events add column theme text;
