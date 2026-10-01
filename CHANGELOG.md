# Changelog

Version format: `MAJOR.MINOR` (MINOR is always 2 digits, e.g. `1.01`).

Every push gets one entry here. MINOR increases by however many distinct
items (features/fixes) that push contains — a push with 1 item goes up by
1 (e.g. `1.01` → `1.02`); a push with 3 items goes up by 3 (e.g. `1.02` →
`1.05`). If MINOR would pass `.99`, MAJOR increments and MINOR carries the
remainder (e.g. `1.99` + 2 items → `2.01`).

## v1.88 — 2026-10-01

- Fixed the Vercel build failures on v1.79, v1.82, v1.84, v1.85 and v1.87.
  Unused imports left behind by the table restyle failed the production lint
  step (type-checking alone doesn't catch them), so those versions never went
  live. Also fixed two React hook warnings in Undo. Production builds are
  green again, so everything since v1.77 deploys together.

## v1.87 — 2026-10-01

- Monthly events set on the 31st (and yearly events on Feb 29) no longer
  drift. They fall on the last day of shorter months (28 Feb, 30 Apr) and
  return to the 31st (or 29 Feb in a leap year) afterwards. Before, they got
  stuck on the 28th for good. The Apple/Google Calendar file (.ics) still
  follows those apps' own rule of skipping months with no 31st.
- Phone layout for the Calendar: on screens narrower than 640px the month grid
  is replaced by a list of the days that have something on them (holidays,
  events, multi-day events), with this month's seasons as chips above. Tap an
  event to open it, or the date to open that day. Drag-and-drop stays on
  larger screens.

## v1.85 — 2026-10-01

- Hovering an event on the Calendar (or focusing it with the keyboard) now
  shows a preview card after a short pause: category, full name, series /
  sermon, date range, time, location, whether it repeats, and the start of its
  notes. It does not appear on touch screens, while dragging or resizing, or
  on scroll. This replaces the plain browser tooltip on calendar events.

## v1.84 — 2026-10-01

- Keyboard shortcuts on the Calendar: T jumps to this month, ← / → move to the
  previous / next month, and N opens Add Event (Editors). They are ignored
  while you are typing or when a form, drawer or the tour is open. The
  buttons show the shortcut in their hover hint, and the tour mentions them.
- A bottom toast now confirms every saved change ("Done: Move “…”") with a
  one-click Undo, and undo/redo show "Undid / Redid" with Redo / Undo. It
  replaces the green strip under the top bar and disappears after six seconds.

## v1.82 — 2026-10-01

- Export page redesigned: choose PDF or Word on two selectable cards, pick a
  date range with quick buttons (This month, Next month, Next 3 months,
  Custom), tap category chips (with Select all / Clear all), then one
  Download button. The export itself is unchanged.
- Reminders page restyled: rounded cards, labelled fields, a calmer message
  box, a cleaner saved-templates table with a trash icon, and the snippet
  list matches. The "How to use this page" panel on every page now has a help
  icon and the same soft card look.
- Login page redesigned: centred card with the +EVO Events wordmark, a
  Edit access / View access switch, a taller passcode field and an inline
  error. Sign-in behaviour is unchanged.

## v1.79 — 2026-10-01

- Restyled the Holidays, Seasons, Checklist and Categories tables: white
  rounded card, quiet header row, soft hover, pill buttons in the toolbar.
  Holidays show their type as a coloured pill; Seasons show a colour dot and a
  single "start – end" date column; Categories show the real chip look and a
  colour dot; Checklist shows an icon next to items with an automated check.
  Row delete is now a trash icon (appears on hover on desktop, always visible
  on small screens).
- The "Delete this?" pop-ups on those screens, Reminders, Message snippets
  and Notes now use the same modal look as the forms.

## v1.77 — 2026-10-01

- Holiday, Season, Category, Checklist item, Reminder template and Message
  snippet forms now use the same modal look as the Event form: rounded card,
  sticky header with close button, sticky Save/Cancel footer, labelled
  fields, errors shown at the top. Delete is now hidden from Viewers in the
  Category form (the server already blocked it).

## v1.76 — 2026-10-01

- Redesigned the Add/Edit Event form. The quick path is now one short screen:
  event name (large), pastoral focus pills, event type with colour dots, date
  and time. Everything else (end date, end time, duration, location, repeat,
  notes) sits under a "More details" section that opens by itself when the
  event already has any of those values. Sticky header and Save/Cancel footer,
  20px rounded card, fade-in, and errors now appear at the top of the form.
- Added a shared modal shell (components/ui/ModalShell) for the other modals
  to adopt next, and restyled the delete-confirmation and "only this event /
  this and future" dialogs to match.

## v1.74 — 2026-10-01

- Refreshed the first-run tour: new "See what changed" step highlighting the
  notification bell, updated menu wording for the four groups (Tools, Admin,
  Export), and a note that the notes icon opens General Notes on other tabs.
  The tour now has 15 steps. Checked every highlight at desktop width.
- The tour now closes the ☰ menu when it moves on to a step that isn't about
  the menu, so it no longer sits on top of the next highlight.

## v1.73 — 2026-10-01

- Checklist, message-snippet (Reminders), notes and day-note actions, plus
  Undo/Redo, now show their real error message on the live site instead of the
  generic "Server Components render" block. This completes the conversion: every
  save/delete/undo action in the app now reports readable errors. The Checklist
  "Check Calendar" run and status changes show the actual reason when they fail.

## v1.72 — 2026-10-01

- Holiday, Season and Category actions (add, edit, delete) and the Seasons
  "Update Calendar" / "Start a New Year" saves now show their real error
  message on the live site instead of the generic "Server Components render"
  block. Deleting a category that events still use now says so plainly.

## v1.71 — 2026-10-01

- Event save/move/resize/delete errors now reach you in plain words on the live
  site. Before, the live site replaced every failure with a generic "An error
  occurred in the Server Components render" message. The event actions now
  return their error message instead of throwing it, and the Event form,
  calendar drags and day view show it. A missing category now says so
  ("...category doesn't exist any more. Add it under Categories").

## v1.70 — 2026-10-01

- Event blocks can now be resized from the left edge too: drag the left edge of
  an event (single-day chip or multi-day bar) to an earlier or later day to
  change its start date while the end date stays put. Works for one-off and
  recurring events (recurring: only that occurrence changes), is logged in the
  activity feed and can be undone.
- General Notes are now available on every tab: a notes icon beside the bell in
  the top bar opens a slide-over drawer with the same notes (add, reply, delete
  and Editor/Viewer rules unchanged). The Calendar keeps its own General Notes
  card, so the icon is hidden there.

## v1.68 — 2026-10-01

- Fixed a dead end in the Add/Edit Event form: if a category the form offers
  (Churchwide, Zone or TG) has been deleted from Categories, picking it let you
  fill everything in and then failed on Save with a generic "An error occurred
  in the Server Components render" block. In production the app can't show
  its own error text from the server, so the form now checks first: an
  Event Type with no matching category is greyed out with an explanation,
  and Save explains exactly which category is missing and how to add it.

## v1.67 — 2026-10-01

- Removed code nothing uses anymore (about 50 lines): an old auto-grow text
  hook replaced by the new shared one, and three unused helper functions.
  Nothing visible changes.
- Fixed the new-developer setup steps in ONBOARDING.md: they told people to
  set a single `EVO_PASSCODE` that the app no longer reads and left out the
  Editor and Viewer passcodes and the calendar-feed token, so a fresh setup
  couldn't log in. Also corrected other stale claims there (repo is public,
  multi-day events exist, roles are checked on the server) and removed the
  hard-coded "next migration number" in favour of MIGRATIONS_APPLIED.md.
- Replaced the create-next-app README template with a short pointer to the
  real guides, and labelled the original schema file as a historical baseline
  to be used together with the numbered migrations.

## v1.64 — 2026-10-01

- Added a notification bell beside the menu icon. It lists recent activity
  from anyone using the app — events added, edited, moved or deleted,
  holidays, seasons, categories, checklist items, notes and replies, and
  undo/redo — as short one-line messages with "5m ago" style times. A badge
  counts what's new since you last looked (tracked per browser; first-time
  visitors start with a clean slate). Viewers only see items they can open
  on the calendar. New `activity_log` table (migration 023). Logging is
  best-effort and can never block a save.
- Clicking a notification takes you to the item: it opens the right month,
  scrolls to the event, day, season or notes panel, and flashes it with a
  gold ring. If the item has since been deleted, a short message says so.
- Note boxes now wrap and grow as you type so you can see everything you've
  written: the day "+ note" box (now a roomy floating card — Enter saves,
  Shift+Enter starts a new line) and the General/Month Notes and Reply boxes.
  Saved day notes in the calendar cells now wrap instead of cutting off.
- Housekeeping: ignore Google Drive's temporary sync folders so they can't
  be committed by accident, and fixed a test file that was missing its `.ts`
  ending so its 10 tests were silently never running.

## v1.60 — 2026-10-01

- New look foundation, following apple.sg: quieter grey text hierarchy,
  system font with tighter lettering, light grey page with white cards,
  visible keyboard focus, and reduced-motion support. Added reusable
  building blocks (pill buttons, icon buttons with tooltips, status pills,
  cards, toasts) and more simple line icons for later screens. Very light
  grey text used for real information was darkened so it stays readable.
- Calendar screen redesigned: icon-only previous/next arrows, a small Today
  button, one filled "Add event" button, a compact category legend with
  colour dots (edit/delete appear on hover), soft tinted event chips with a
  coloured left bar (multi-day and season bars keep full colour), a clearer
  today marker, quieter holiday badges and "+ note" prompts, and the two
  notes panels as cards with larger, easier-to-read text.
- Clicking the "+EVO Events" logo now returns to the calendar from any page.
- Fixed a flicker when dragging an event to another day: for a moment it was
  drawn as a multi-day bar until the save finished. The saved data was
  already correct; only the in-between drawing was wrong.

## v1.56 — 2026-10-01

- Reorganised the menu into four groups: Main (Calendar — highlighted as
  the primary page — then Tools [Holidays, Seasons, Categories] and
  Checklist), Admin (Reminders, Backup), Export (Add to Calendar .ics,
  Export Document), and Replay tour. Tools, Admin and Export are
  collapsible, the current page is marked, and every item has a simple
  line icon. Viewers still see only Calendar and Replay tour.

## v1.55 — 2026-10-01

- The onboarding tour is now a guided walkthrough: as it advances it
  navigates to the right page, opens the menu when needed, and draws a gold
  ring around the real button or panel it's explaining (Add Event, the
  calendar grid, both notes panels, the menu, Export Document, Undo). The
  explanation card moves out of the way so it never covers what it points
  at, and a stray click on the dimmed area no longer ends the tour.
- Fixed the tour appearing on the login page before anyone had signed in —
  it now starts right after sign-in. Skip/Escape is also remembered for the
  browser tab, so a reload doesn't reopen it (only finishing it marks it
  permanently seen).
- Seasons: added "Update Calendar" — quick links to MOE, each polytechnic,
  and each university's official calendar, with start/end date fields per
  institution. The app works out the aggregate (earliest start, latest end)
  for Polytechnic and University exam periods and saves it as the season.
  Dates are entered by hand because these institutions publish PDFs, not a
  data feed. New `season_source_dates` table (migration 021).
- Seasons: added "Start a New Year" — pick which of this year's seasons to
  carry forward. Exam/term seasons are prefilled from last year's
  per-institution dates (flagged where there's no prior data); other
  seasons shift forward one year. Everything is shown for review and edit
  before anything is saved.
- Checklist: items can now be tagged with an "Automated check". First
  check: "All school holidays present for this month" — "Check Calendar"
  confirms a School Schedule season covers the item's target month and adds
  a warning to the item's notes if not. Existing linked-event behavior is
  unchanged. New `auto_check_type` column (migration 022).

## v1.50 — 2026-10-01

- Added a first-run onboarding tour (14 steps: using the calendar, the
  sidebar notes panels, how Editor vs. Viewer access works, and what to do
  / avoid) — shown automatically the first time a browser visits, and
  replayable anytime from the new menu. Tracked per-browser via
  `localStorage`, not by IP — this app only has two shared passcodes, not
  per-person accounts, so an IP can't identify "a new person" any more
  reliably than a browser flag can, and IP tracking would misfire on
  shared wifi (skips the tour for genuinely new people) and across network
  switches (shows it twice to the same person).
- Added a collapsible "How to use this page" panel (collapsed by default)
  to Holidays, Seasons, Checklist, Categories, Reminders, Backup, and
  Export — each a short, one-sentence-per-line list of what the page's
  buttons actually do.
- Replaced the nav bar's row of tab links with a single hamburger menu
  listing the same destinations (role-filtered exactly as before); Undo
  and Redo stay as their own visible buttons next to it, since they're
  used too often to bury a click deeper.
- Removed descriptive paragraphs on the Backup and Export pages that
  duplicated what the new instructions panel now says.

## v1.46 — 2026-09-30

- Fixed the real cause of PDF/Word export failing in production only (not
  locally): `@react-pdf/renderer` pulls in `pdfkit`, which loads its standard
  font files (metrics + font modules) via dynamic `require()` calls at
  runtime — calls Next.js's build-time file tracing can't detect, so
  Vercel's serverless bundle silently pruned them, producing
  `Cannot find module '.../pdfkit/js/standard-fonts/Helvetica.cjs'` on every
  export attempt. Added `next.config.mjs`'s `outputFileTracingIncludes` for
  the export route to force those files into the bundle. Verified locally
  via a production build that the fix's file-tracing manifest now includes
  the exact file the production error was missing.

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
