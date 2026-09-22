# +EVO Events Calendar — Project Brief

## What this is
A shared, interactive events-planning calendar for TEVO (The Evolution church).
Replaces a manually-maintained Excel calendar. One team, ~20 staff/leaders,
internal tool (not public-facing).

## Stack
- Next.js 14 (App Router), React
- Supabase (Postgres + client SDK) — single source of truth
- Vercel — hosting/deploy
- Tailwind CSS for styling
- A drag-and-drop library (e.g. `@dnd-kit/core`) for moving events between days

## Core data model (see schema.sql)
- `events` — one row per event. Has: name, date, time, level, recurring pattern
  (none/weekly/monthly/yearly), repeat_until, notes.
- `holidays` — date, name, type (National / International / Church Observance / School Schedule).
- `seasons` — name, category, start_date, end_date (RF, LBF, Growth Cycles, school terms/holidays, exam periods).
- `checklist` — category, item, status (Not Started/In Progress/Done), target_month, notes.
- `month_focus` — one row per month: series/sermon focus, key theme, notes (freeform,
  manually filled in, not derived from anything).

## Core screens / features
1. **Month calendar view** (default view). Monday–Sunday grid (NOT Sunday-start).
   Each day cell shows: holiday badge(s) at top, season/schedule tags, then event
   cards. Color-code event cards by Level (Churchwide, Youth, Tertiary, Adults,
   COW, Thirdspace, Gathering) — give each level a distinct color, define a small
   legend.
2. **Drag-and-drop**: dragging an event card to a different day updates its date
   in Supabase immediately (optimistic UI, then confirm).
3. **Click a day** → opens an "Add Event" modal (name, time, level, recurring
   pattern + repeat_until, notes).
4. **Click an event card** → edit or delete it inline.
5. **Recurring events**: computed server-side/client-side when rendering a month
   (expand weekly/monthly/yearly patterns within the visible date range) — do NOT
   store one row per occurrence, store the rule once (matches the `events` table
   design above).
6. **Focus panel** at the top of each month view — editable text fields for
   Series/Sermon Focus, Key Theme, Notes for that month.
7. **Holidays & Seasons management** — simple table views (list, add, edit, delete)
   for the `holidays` and `seasons` tables. These change rarely, a plain table UI
   is fine (no need for calendar visualization here).
8. **Checklist view** — table view of the `checklist` table with a status dropdown
   (color-coded: red=Not Started, yellow=In Progress, green=Done) and a target
   month filter.
9. Month navigation (prev/next month, jump to today).

## Design notes
- Brand colors: navy (#1F2A44) as primary, gold/amber (#D9A441) as accent —
  matches the church's existing calendar branding.
- Sunday should be visually distinguished (it's the main Gathering day) — light
  gold tint on that column.
- Days outside the current month (grid overflow) should be visually muted/greyed.
- Keep it dense but scannable — this replaces a spreadsheet power users are used
  to scanning quickly, so favor information density over whitespace, but keep
  text legible (don't go below ~13px for event text).
- No login/auth needed for v1 — this is an internal tool shared via a single URL
  with the team. (Flag to Edwin: if this needs to be locked down later, a simple
  shared-passcode gate or Supabase magic-link auth can be added in a follow-up
  session — don't build it into v1 unless asked.)

## Explicit non-goals for v1
- No mobile-native app — responsive web is enough.
- No notifications/reminders.
- No sync with Google Calendar/Outlook (possible future phase).
- No multi-year support yet — build for 2026, but don't hardcode 2026 into logic
  that doesn't need it (e.g. don't hardcode Jan/Dec bounds anywhere they could
  instead be derived from "current year").

## Build order (suggested, across multiple sessions)
1. Supabase schema + Next.js project scaffold + basic month grid rendering real
   data (no interactivity yet).
2. Drag-and-drop + add/edit/delete event modals.
3. Holidays, Seasons, Checklist table views + recurring event expansion logic.
4. Focus panel, styling polish, deploy to Vercel.

## Changelog / versioning (standing process, applies to every push)
Every push must bump `CHANGELOG.md` first — this applies regardless of who
(or which Claude Code session) is pushing.
- Version format: `MAJOR.MINOR`, MINOR always 2 digits (e.g. `1.01`). Baseline
  is `v1.00`.
- Each push's MINOR increases by however many distinct items (features/fixes)
  that push contains — 1 item → MINOR +1, 3 items → MINOR +3.
- If MINOR would pass `.99`, MAJOR increments and MINOR carries the remainder
  (e.g. `1.99` + 2 items → `2.01`).
- Add one new entry per push at the top of `CHANGELOG.md`, dated, with a
  bullet per item.
- Always confirm with Edwin before running `git push` — do not push
  unprompted, even after committing.
