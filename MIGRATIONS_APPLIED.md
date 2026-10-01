# Migrations Applied

## Purpose
Migrations for this project are numbered SQL files at the repo root
(`supabase_migration_0NN_*.sql`) that are run manually, by hand, in Supabase's
SQL Editor against the single shared production project — there is no
migration runner or automated tracking. Because the database is shared (not
per-developer) and more than one person (Edwin, and collaborator Darius) works
on this repo independently, the existence of a migration file in the repo does
NOT mean it has actually been executed against the live database. This file is
the source of truth for that separate question: "has this migration actually
been run against the shared production Supabase project yet?" Check this file
before assuming the live schema matches the repo's migration files, and update
it immediately after confirming a migration has been run.

## Status

| # | Filename | Description | Confirmed run? |
|---|----------|--------------|-----------------|
| 002 | supabase_migration_002_event_overrides.sql | Per-occurrence overrides for recurring events | Yes |
| 003 | supabase_migration_003_event_time_duration.sql | End time + duration for events | Yes |
| 004 | supabase_migration_004_season_color.sql | Season bar color | Yes |
| 005 | supabase_migration_005_override_time.sql | Time overrides for recurring occurrences | Yes |
| 006 | supabase_migration_006_levels.sql | Dynamic event categories (Levels) | Yes |
| 007 | supabase_migration_007_event_exceptions.sql | Per-occurrence edit/delete for recurring events | Yes |
| 008 | supabase_migration_008_event_type_fields.sql | Event type, pastoral focus, Gathering fields | Yes |
| 009 | supabase_migration_009_general_notes.sql | General (all-months) notes | Yes |
| 010 | supabase_migration_010_multiday_events.sql | Multi-day events | Yes |
| 011 | supabase_migration_011_note_comments.sql | Notes become a comment log | Yes |
| 012 | supabase_migration_012_note_comment_replies.sql | Note comment replies | Yes |
| 013 | supabase_migration_013_gathering_type.sql | Gathering type templates | Yes |
| 014 | supabase_migration_014_checklist_event_link.sql | Checklist items linked to events | Yes |
| 015 | supabase_migration_015_day_notes.sql | Day notes | Yes |
| 016 | supabase_migration_016_event_type_colors.sql | Event Type colors (Churchwide/Zone/TG) | Yes |
| 017 | supabase_migration_017_reminder_templates.sql | Reminder templates | Yes (harmless "already exists" re-run — predated this tracking file) |
| 018 | supabase_migration_018_checklist_templates.sql | Checklist templates | Yes (confirmed cleanly, run together with 019-020 in same session) |
| 019 | supabase_migration_019_event_location.sql | Event location | Yes (confirmed cleanly, run together with 018/020 in same session) |
| 020 | supabase_migration_020_updated_at.sql | updated_at + concurrent-edit detection | Yes (confirmed cleanly, run together with 018-019 in same session) |
| 021 | supabase_migration_021_season_source_dates.sql | Per-institution exam/term dates (season_source_dates table) for Seasons' Update Calendar / Start a New Year | Yes (confirmed run by Edwin, 1 Oct 2026) |
| 022 | supabase_migration_022_checklist_auto_check.sql | Checklist "automated check" tag (auto_check_type column) | Yes (confirmed run by Edwin, 1 Oct 2026) |
| 023 | supabase_migration_023_activity_log.sql | Activity log table for the notification bell (activity_log) | Not yet confirmed |

Note: numbering starts at 002 — there is no `supabase_migration_001_*.sql` file
in this repo (the initial schema lives in `supabase_schema.sql`).


Next available migration number: **024**.

## Process for new migrations
Whenever a new migration file is added, add a row here as **"Not yet
confirmed."** Update it to **"Yes"** only after Edwin explicitly confirms he
ran it against the shared Supabase project — do not mark it "Yes" based on the
file simply existing in the repo, being committed, or being merged.
