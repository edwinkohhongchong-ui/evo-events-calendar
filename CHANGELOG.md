# Changelog

Version format: `MAJOR.MINOR` (MINOR is always 2 digits, e.g. `1.01`).

Every push gets one entry here. MINOR increases by however many distinct
items (features/fixes) that push contains — a push with 1 item goes up by
1 (e.g. `1.01` → `1.02`); a push with 3 items goes up by 3 (e.g. `1.02` →
`1.05`). If MINOR would pass `.99`, MAJOR increments and MINOR carries the
remainder (e.g. `1.99` + 2 items → `2.01`).

## v1.45 — 2026-09-30

- Hardened the Export Document API route (`app/api/export/document/route.ts`):
  the data-fetch/render pipeline had no error handling beyond the existing
  date-validity check, so any unhandled exception there produced a bare 500
  with no JSON body — surfacing to the user as a generic "Something went
  wrong generating the document." banner with no way to diagnose the real
  cause. Now wrapped in a try/catch that logs the real error server-side and
  returns a proper JSON error response. Couldn't reproduce an actual export
  failure against current data during this fix — if it recurs, the server
  log will now show the real root cause.

## v1.44 — 2026-09-30

- Fixed a real authorization gap: two event-occurrence Server Actions
  (`splitSeriesFromOccurrence`, `extendOccurrenceSpan`) incorrectly allowed
  Viewer-level access, inconsistent with their sibling event-mutation
  functions (`updateEvent`, `moveOccurrence`, `retimeOccurrence`,
  `detachOccurrence`), which were already correctly Editor-only. (A first
  pass also tightened `updateHoliday`/`updateSeason`/`updateLevel`/
  `updateChecklistItem`/`updateReminderTemplate` to Editor-only, but that
  was reverted — those were already correct at Viewer-level, matching the
  app's actual UI, which has never gated Save/Edit behind Editor, only
  Delete. Viewers editing an existing holiday, season, category, checklist
  item, or reminder template is intended behavior, not a bypass.)
- Fixed raw Supabase/Postgres error messages leaking to the client from
  every Server Action — now wrapped in safe, context-specific messages,
  with the real error still logged server-side for debugging.
- Fixed the Zone category picker silently auto-selecting the first zone on
  click — now requires an explicit choice, matching the same fix already
  applied to the top-level Event Type picker in v1.35.
- Added an explicit acknowledgment gate for a recurring event left with no
  "Repeat until" date, so indefinite repetition is a deliberate choice, not
  a silent default.
- Fixed the last native `window.confirm`/`alert` popups (Day Note delete,
  Message Checklist Snippet delete) to use the app's own styled
  confirmation dialog, and added the missing Escape-close/viewport cap to
  the Holidays/Seasons delete confirmation.
- Bumped secondary event-card text (subtitle/time) from 11px up to the
  stated 13px design floor.
- Renamed "Checklist Templates" to "Message Checklist Snippets" throughout
  the Reminders page (UI copy only, no data-model change), to reduce
  confusion with the real Checklist tab.
- Added `MIGRATIONS_APPLIED.md` tracking which of the 20 database
  migrations have been confirmed run against production, and fixed a stale
  migration-number reference in `ONBOARDING.md`.
- Documented a standing 7-role agent-team workflow (added QA/Live-
  Verification and Security/Auth to the original five) and a
  collaborator-sync process for working alongside Darius, both in
  `CLAUDE.md`.

## v1.35 — 2026-09-30

- Event form: the Churchwide/Zone/TG (or Level, for Gatherings) category no
  longer silently defaults to whatever sorts first — it starts unset and
  Save now requires an explicit choice. The picker also moved above
  Date/Time, since it's a bigger planning decision than timing.
- Reminders: default lookahead raised from 30 to 60 days (a Christmas/Easter
  event planned further out was silently invisible), and the empty-state
  message now says so explicitly instead of just showing a blank list.
- Holiday/Season delete now uses the app's own styled confirm dialog
  instead of a native browser popup, matching every other delete flow.
- Escape now closes any open modal (previously only the backdrop click or
  an explicit Cancel/Close button worked).
- Server-side enforcement for the Editor/Viewer role split: every
  create/edit/delete function is now a real Next.js Server Action that
  re-checks the session role from the httpOnly cookie, not just hidden UI
  buttons — a Viewer can no longer bypass restrictions via devtools. (The
  underlying Supabase "allow all" RLS tradeoff is unchanged and separately
  documented; this closes the application-level gap, not that one.)
- Added `updated_at` tracking (with an optimistic-lock check available) to
  every mutable table, as a foundation for detecting concurrent edits —
  the data-layer half is live; wiring it through the edit forms themselves
  is a follow-up.
- Added the project's first automated tests: an 8-case Vitest suite for the
  recurring-event expansion logic (`npm test`). It surfaced a real latent
  bug worth a look: a monthly/yearly event anchored on the 31st or Feb 29
  permanently drifts to a lower day the first time it crosses a short
  month/non-leap year, and never recovers even when a later date would
  allow the original day again — documented and tested as current behavior,
  not yet fixed.
- Added a "Backup" page (Editor-only) — downloads every table in the app as
  one JSON file, a developer-restorable safety net beyond Undo's
  session-local history.
- Added a live Apple/Google Calendar subscription feed
  (`/api/calendar-feed/<token>.ics`, token-gated instead of passcode-gated
  since a calendar app can't log in) and alert (VALARM) support in the ICS
  export, which had none before.

## v1.26 — 2026-09-30

- Fixed PDF export returning "Something went wrong generating the
  document." — a calendrically-invalid date (e.g. a stray `2026-09-31`)
  slipped through unvalidated and crashed date formatting deep in the
  render; the export route now rejects an invalid date range with a clear
  400 instead of a bare, unhelpful 500.
- Fixed Word (.docx) export column widths — the table had no fixed column
  widths, so Word/LibreOffice recomputed them from content and squished the
  layout; columns are now fixed-width in the same Date/Time/Event/Category
  proportions as the PDF export.
- Reworked "Checklist Templates" on the Reminders page: it's now a visible,
  open-by-default section right there (previously a collapsed section on
  the Checklist page, easy to miss), and deliberately NOT linked to the real
  Checklist tab/table — selecting a template for an event in the picker
  pre-loads its lines straight into the drafted message only. Each event
  with a template selected shows a × to clear it.
- Events now have an optional Location field (Add/Edit Event form) — shown
  alongside time in the Reminders event picker and in drafted messages, so
  a leader planning e-invites/logistics has where as well as when. New
  `events.location` column (migration 019).
- Undo/Redo now shows a brief on-screen confirmation of what it just did
  (e.g. "↶ Undid: Delete holiday 'Teachers' Day'"), instead of only a hover
  tooltip beforehand — auto-dismisses after a few seconds, dismissable
  immediately via its own ×.

## v1.21 — 2026-09-30

- Added Checklist Templates: save a reusable set of checklist items (e.g.
  "Big Event Prep") and apply the whole set to any event in one click from
  the Reminders page's event picker, instead of adding items one at a time.
  An item can repeat (e.g. a weekly pastoral check-in over 4 weeks) — each
  repeat expands into its own numbered checklist row when applied. Managed
  from a new collapsible section on the Checklist page. Seeded with a
  starter "Big Event Prep" template (e-invite timing, pastoral check-in ×4,
  post-event follow-up) — edit or delete freely. New `checklist_templates`
  / `checklist_template_items` tables (migration 018).

## v1.20 — 2026-09-30

- Reminders now has an event picker instead of a flat auto-summary:
  Churchwide events and Gathering Types YTH Gathering / +EVO YTH Big Day /
  Easter-XMAS are auto-flagged (⭐) and pre-checked as "important" — no extra
  tagging step needed, since Level and Gathering Type already capture this.
  Every event in the lookahead window still shows (unchecked) so nothing is
  hidden. Each checked event pulls in its linked Checklist to-dos into the
  drafted message, or shows "⚠ No prep checklist linked yet" with a
  one-click shortcut to add one right there, so collateral/to-dos for big
  events don't get missed.

## v1.19 — 2026-09-30

- Added a "Reminders" page: save named templates (default Telegram handle,
  default message, whether to append an auto-generated list of upcoming
  events) and draft a message from one, then click "Open in Telegram" to
  launch Telegram with it pre-filled — sending is always a manual, reviewed
  step, nothing is sent automatically. New `reminder_templates` table
  (migration 017).
- Added a two-role passcode gate: Editor (full access, same as before) and
  Viewer (can view the calendar, edit existing events, and comment — can't
  add or delete anything, and can only reach the Calendar tab, enforced by
  middleware on direct URL access too). The login page now asks which role
  to sign in as, each with its own passcode.

## v1.17 — 2026-09-30

- Fixed PDF/Word export silently downloading a corrupt file (the login
  page's HTML, mislabeled as a .pdf/.docx) whenever the passcode session was
  missing or expired — the export API route now returns a proper JSON 401 in
  that case instead of a redirect that `fetch` was silently following.
- "Events by Category" now starts fully collapsed — expand a category by
  clicking its header, same as before, just no longer expanded by default.
- Replaced the separate "Filter:" chip row with click-to-toggle on the
  existing category legend chips themselves — click a chip's name to
  hide/show that category (dims when hidden), the pencil still edits and the
  × still deletes, no extra row needed. Applied to both month view and day
  view.

## v1.14 — 2026-09-30

- Holiday badges and Season bars on the month grid are now clickable — each
  opens the same Edit/Delete modal previously only reachable from the
  Holidays/Seasons admin tables, so both can be managed directly from the
  calendar.

## v1.13 — 2026-09-29

- Restyled the Undo/Redo nav bar buttons to match the visual weight of
  Prev/Next/Today — bordered buttons with text labels ("↶ Undo" / "Redo ↷")
  instead of bare icon-only ghost buttons, so they read as clearly clickable.

## v1.12 — 2026-09-23

- Added undo/redo, covering every mutation in the app — events (add, edit,
  delete, drag-move, drag-retime, drag-resize, per-occurrence overrides and
  exceptions on recurring series), levels, holidays, seasons, checklist
  items, day notes, and note comments (including cascaded replies). ↶/↷
  buttons in the nav bar, plus Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z. Built as a
  generic snapshot-based engine (`lib/undo/`) that captures each action's
  before/after row images and restores by upsert/delete, rather than
  hand-written inverses — the recurring-event override/exception logic in
  `lib/actions.ts` is intricate enough that reversing it by hand would risk
  duplicating the same bugs in reverse. Undo only rewinds actions taken in
  your own browser tab and has no way to detect a concurrent edit by someone
  else in between — a known limitation, consistent with the rest of the
  app's no-realtime-conflict-detection design.
- Added a category filter: click a category chip in the "Filter:" row
  (month view, day view) to hide it from the calendar, day view, and
  "Events by Category" list — untick everything except one category (e.g.
  Gathering) to isolate it. New `lib/eventFilterContext.tsx`, shared across
  all three views so a filter set on one persists across navigation.
- Fixed the Add/Edit Event modal (and the Category/Holiday/Season/Checklist
  modals, which shared the same unconstrained wrapper) overflowing the
  viewport with no way to reach Save/Cancel on a long form or a short
  screen — all five now cap at 90% viewport height and scroll internally.

## v1.09 — 2026-09-22

- Updated `ONBOARDING.md` with everything built since the last handover (the
  versioning process, the Gathering preview/subtitle work, the overflow-day
  fix, day notes, and the Churchwide/Zone/TG event type colors) so a
  collaborator's Claude Code session has current context, not the v1.00-era
  snapshot it had before.

## v1.08 — 2026-09-22

- Added day notes: a small "+ note" toggle in every calendar day cell opens a
  tiny editor for short freeform tags on that date (e.g. "Send a card to
  friends" on a holiday) — shown as plain green text, not an event card. A
  day can hold several; each is deletable on its own. New `day_notes` table
  (migration 015).
- Replaced the Level picker for Event-type entries with an "Event Type"
  picker: Churchwide / Zone / TG, with Zone expanding into Youth, Poly, Uni,
  Adults, or COW/Thirdspace. Recolored the scheme (Churchwide=red,
  Youth=yellow, Poly=blue, Uni=purple, Adults=pink, COW/Thirdspace=green,
  TG=orange), merged the COW and Thirdspace categories into one, and added
  the new TG category (migration 016). Gatherings are unaffected — they keep
  their own separate, unchanged Level dropdown and amber color.

## v1.06 — 2026-09-22

- Documented the changelog/versioning process and the "always confirm before
  push" rule directly in `CLAUDE.md`, so it applies to any collaborator's
  Claude Code session in this repo, not just this one.
- The Events by Category list now shows a Gathering's Series — Sermon Title
  as a second line under its name, matching the calendar cards, so a zone
  leader can scan what each Gathering is about without opening it.

## v1.04 — 2026-09-22

- The month grid and the Events by Category list below it no longer show
  events that fall on the leading/trailing overflow days from the previous
  or next month — only events actually within the viewed month are shown,
  keeping those muted overflow days visually clean. Holidays, season bars,
  and multi-day event bars are unaffected.

## v1.03 — 2026-09-22

- Gathering event cards (month grid, day view) now show the Series and
  Sermon Title as a second line, in the same style as the time, when
  either is set — e.g. "Faith Series — We need to have faith!"
- Reordered the Gathering add/edit form: Gathering Type and the fields that
  feed the title (Series, Preacher Name, etc.) now come before Name, and
  Name sits immediately before Date/Time. The Name field now notes it's
  auto-filled and only needs editing if necessary.
- Added a live Preview panel at the bottom of the Add/Edit Event form
  (before Save) showing exactly what will be saved — title (with the Y/P/U/A
  prefix for Events or the Gathering title for Gatherings), the Series —
  Sermon Title line where applicable, and the time range.

## v1.00 — 2026-09-22

Baseline — existing app as of this point. Detailed history before this
version lives in `git log`, not here; versioned entries start with the next
push.
