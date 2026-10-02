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
- Auth: a two-role passcode gate shipped in v1.19 (Editor / Viewer, middleware-
  enforced). Viewers can look, comment in the sidebars (General Notes /
  Month Notes comments and replies), tick/untick items on an event's
  checklist (`setChecklistItemDone`, the only checklist write open to them) and
  use Export (download/print, read-only); templates and every other mutation
  are Editor-only. Server-side
  re-checks on every mutating Server Action (added in v1.35,
  `lib/authz.ts#requireRole`) stop a Viewer bypassing this via devtools. Supabase RLS itself remains "allow all" by design — the
  Server Action checks close the application-level gap, not the underlying
  REST-API-level one. This is a deliberate, accepted v1 tradeoff (internal
  tool, single shared URL), not an oversight — don't tighten RLS without
  checking with Edwin first.
  Comment author names are free text (there is no per-user identity), and the
  public Supabase anon key plus "allow all" RLS remain an accepted tradeoff —
  the REST-level exposure described above is the same reason.

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

## Working mode: agent team (standing process)
Work on this project is done through a seven-role agent team, not by one
generalist session alone. Whenever a task falls into one of these lanes,
route it to the matching agent (via the Agent tool, `subagent_type` set to
the name below) instead of handling it generically:
- `coder` — code correctness, implementation, bug fixes.
- `code-deployment` — Supabase, Vercel, GitHub, terminal/CLI, migrations.
- `ui-ux-designer` — look, feel, layout, interaction design.
- `project-administrator` — changelog/version accuracy, drift-checking,
  token/agent-efficiency calls.
- `pastoral-leader` — end-user usability sanity-check, the product lens.
- `qa-verification` — live browser verification, expanding test coverage.
- `security-auth` — dedicated auth/RLS/secrets/error-leakage audit.

Each of these agents is authorized to spin up its own further sub-agents for
work that splits cleanly within its own department (e.g. `coder` parallelizing
independent file fixes), as long as it consolidates and verifies the result
itself before reporting up. Full role definitions live in `.claude/agents/`
(local to each machine, gitignored — not part of the public repo, since they
contain internal project detail).

A task that doesn't fit any single lane, or that's genuinely trivial, can
still be handled directly — this structure is for keeping ownership clear on
real work, not ceremony for its own sake.

## Collaborator sync (standing process)
Darius also works on this repo, in his own Claude Code session on his own
machine — he edits, commits, and pushes to GitHub independently of Edwin's
sessions. This means the local checkout in any given session can silently
fall behind `origin/main`, or diverge from it, without anyone noticing until
a push conflicts.
- At the **start** of a work session, and again before starting any new
  milestone, run `git fetch origin && git status -sb` to check whether
  `origin/main` has commits not yet merged locally (Darius may have pushed
  since the last session). Surface this to Edwin rather than pulling
  silently if there are also uncommitted local changes.
- At the **end** of every milestone (a feature/fix batch that's been
  committed, changelog bumped), push — after Edwin's confirmation, per the
  standing push rule above — so Darius can pull the latest before he starts
  his own next piece of work.
- If a `git pull`/merge is needed to reconcile diverged history, treat it
  like any other operation that can discard or reorder work: check
  `git status` first, and don't force-push or discard either side's commits
  without Edwin's explicit go-ahead.
