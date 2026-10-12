# +EVO Events Calendar — Handover / Onboarding

## What this is
A shared, interactive events-planning calendar for TEVO (The Evolution church),
replacing a manually-maintained Excel calendar. Internal tool, ~20 staff/leaders,
not public-facing.

- **Live app:** https://evo-events-calendar.vercel.app (passcode-gated — see
  "Secrets you'll need" below)
- **Repo:** https://github.com/edwinkohhongchong-ui/evo-events-calendar (**public** —
  anything committed is world-readable; never commit `.env*` files or secrets)
- **Stack:** Next.js 14 (App Router), Supabase (Postgres + client SDK), Vercel
  (hosting/deploy), Tailwind CSS, `@dnd-kit/core` for drag-and-drop.

## Secrets and environment variables
The app has two logins, **Editor** (full access) and **Viewer** (look and
comment in the sidebars, tick checklist items on events, and use Export to download or print — templates and everything else are Editor-only). Their passcodes live in the
`EVO_PASSCODE_EDITOR` and `EVO_PASSCODE_VIEWER` environment variables (the old
single `EVO_PASSCODE` is no longer read). Values marked "Sensitive" in Vercel
can never be viewed again, so keep every real value in a password manager.
After changing any variable in Vercel, redeploy for it to take effect.

Logins are kept as a signed cookie, signed with `EVO_SESSION_SECRET` (a random
value of 32+ characters; create one with `openssl rand -base64 32`). If that
variable is missing nobody can log in. Changing a passcode logs that role out
everywhere; changing `EVO_SESSION_SECRET` logs everyone out.

## Getting set up locally
1. Clone the repo (`gh repo clone edwinkohhongchong-ui/evo-events-calendar`) —
   use `gh`/git, not GitHub's "Download ZIP" button, since a ZIP has no git
   connection and can't push/pull.
2. Create `.env.local` in the project root with these values (ask Edwin for
   them via a secure channel, not chat/email):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   EVO_PASSCODE_EDITOR=...
   EVO_PASSCODE_VIEWER=...
   EVO_SESSION_SECRET=...
   CALENDARIFIC_API_KEY=...
   CALENDAR_FEED_TOKEN=...
   ```
   The Supabase pair is re-viewable at supabase.com → project → Settings →
   API. The Calendarific key is re-viewable by logging into calendarific.com.
   The two passcodes are the logins described above. `CALENDAR_FEED_TOKEN` is a
   long random string that guards the Apple/Google calendar subscription link
   (`/api/calendar-feed/<token>.ics`); only needed if you're testing that feed.
3. `npm install`, then `npm run dev`, then open `http://localhost:3000`.

## How data/deploys actually flow
- **Database (Supabase) is the single source of truth**, shared live by
  everyone using the app — no "sync" step needed for calendar *data*, it's
  real-time for all users automatically.
- **Code (GitHub) is separate and manual** — commit and `git push` to publish
  a change; nothing auto-syncs to anyone's machine without an explicit push/pull.
- **`main` is connected to Vercel for continuous deployment** — every push to
  `main` immediately redeploys the live production site. There is no staging
  environment. Treat `git push` on this repo as equivalent to hitting "deploy,"
  not just "save."
- Supabase's free tier auto-pauses the project after a period of inactivity
  (this already happened once, ~2.5 months in). If the live site suddenly can't
  load any data, check the Supabase dashboard for a "Restore" button before
  assuming something's broken in the code.

## What's built so far (see git log for full detail — commits are descriptive)
In rough chronological order:
1. Month calendar view — Monday-start grid, real Supabase data, timezone-safe
   date handling (plain calendar dates throughout, no `.toISOString()` anywhere)
2. Drag-and-drop date changes + add/edit/delete modals, including a
   per-occurrence override system (`event_overrides` table) so dragging one
   occurrence of a recurring event doesn't move the whole series
3. Holidays/Seasons/Checklist table views + a passcode gate (middleware +
   `EVO_PASSCODE`, deliberately a page-level deterrent only — it does not and
   cannot restrict the Supabase REST API itself, which is governed by RLS
   policies set to "allow all" for v1)
4. Focus panel (per-month series/theme/notes, editable inline)
5. Start/end time + duration fields on events, with mutual auto-calculation
6. Mobile responsiveness pass (375px baseline)
7. Multi-day season bars with lane-packing for overlaps, per-season color
8. Day-view (time-axis grid) with drag-to-retime, extending overrides to
   support time changes independently of date changes
9. "Start a New Year" — fetches Singapore public holidays from Calendarific
   for a specific year, shows a diff-style review screen (New / Already
   exists / Possible conflict), and never writes to the database until a
   human explicitly approves — this was a deliberate design choice, treat any
   future automated-write feature with the same level of caution
10. Editable event categories (`levels` table, `/levels` admin page) with
    auto-suggested colors, per-occurrence edit/delete scope for recurring
    events, comment-style General/Month Notes (replies + removal), multi-day
    drag-to-resize, calendar export (ICS/PDF/DOCX), Gathering templates and
    checklist-to-calendar linking
11. **Versioning/changelog process** — every push now bumps `CHANGELOG.md`
    first (`MAJOR.MINOR`, MINOR +1 per distinct item in that push). The full
    rule is documented in `CLAUDE.md` under "Changelog / versioning" so it
    applies in any Claude Code session on this repo, not just one person's.
    **Follow this on your pushes too** — check `CHANGELOG.md`'s current
    version before committing.
12. Gathering events now show a Series — Sermon Title subtitle on cards
    (calendar, day view, and the "Events by Category" list); the Add/Edit
    Event form was reordered (Gathering Type before Name) and gained a live
    Preview panel showing exactly what will be saved, before Save
13. The month grid and "Events by Category" list no longer show events from
    the muted leading/trailing overflow days (dates from the adjacent month
    shown to fill out week rows)
14. **Day notes** — a "+ note" toggle in every day cell opens a tiny inline
    editor for short freeform tags on that date (e.g. "Send a card to
    friends" on a holiday), shown as plain green text, not an event card.
    New `day_notes` table.
15. **Event Type regrouping for Events** — the Level picker for Event-type
    entries (not Gatherings) is now a Churchwide / Zone / TG picker, with
    Zone expanding into Youth / Poly / Uni / Adults / COW-Thirdspace. Colors:
    Churchwide=red, Youth=yellow, Poly=blue, Uni=purple, Adults=pink,
    COW/Thirdspace=green, TG=orange. COW and Thirdspace were merged into one
    category; TG (TEVO Groups) is new. Gatherings are untouched — separate
    flow, still amber. The color palette (`SeasonColorKey`, shared between
    Levels and Seasons) grew from 10 to 14 keys to fit this.

Since then: per-event checklists with an "overdue" pill, event search, hover
preview cards, Duplicate event, a phone agenda layout, Seasons "Update Calendar"
/ "Start a New Year", and the first-run tour (`lib/tourSteps.ts`). The
changelog is the full record. The app is currently at **CHANGELOG.md v2.23** —
check that file's top entry for the exact current version and what's in it.

### Import schedules from Word or Excel (Editor only)

Menu → Admin → "Import schedules" (also a button on the Seasons page,
`/seasons/import`). The page has two choices at the top: "Word document" and
"Excel calendar" (see the Excel section below). Upload the yearly education schedule as a `.docx` (5 MB
max); the file is read in memory only and never stored. The page shows a
preview of what would be added or changed in Holidays and Seasons, and nothing
is saved until you click Apply; one Undo reverses the whole import.

The reader (`lib/schedules/`) expects the document's layout, not any Word file:
- A title line with the year, e.g. "Education Schedules 2026".
- Section headings: Public Holidays, Primary School, Secondary School, Junior
  College, Polytechnic, University.
- Optional group headings under a section (School Holidays, PSLE, N Level,
  O Level, A Level, or institution codes such as "NP, TP, NYP:" / "SP, RP:").
- Rows written "Label: dates", e.g. "Examination: 16 February 2026 - 8 March 2026",
  or bare date lines under "School Holidays". Dates are "D Month YYYY", ranges
  with a dash, lists with commas or "and". "(tentative ...)" and "(subject to
  confirmation)" mark a row tentative; "(this is a Sunday, <date> will be PH)"
  adds the "(In-Lieu)" holiday; "(SP)" / "(RP)" scopes a date to one institution.
- Lines it cannot place are listed under "Lines I couldn't place" rather than
  guessed. Typos such as an end date before the start date are flagged and must
  be fixed in the preview (Edit) before the row can be applied.

Naming follows the calendar's existing rows ("Poly Examinations (NP, TP, NYP)",
"Primary School Holidays (June)"). A tentative public holiday keeps its normal
name and is marked by the provisional holiday type. "(Mid-terms should fall
between ...)" lines come in as tentative Exam Periods but start unticked.
Code: parse endpoint `app/api/schedules/parse/route.ts`, save action
`lib/scheduleImportActions.ts`, preview `components/ScheduleImportPreview.tsx`.

#### Excel calendar (the old events workbook)

Choose "Excel calendar", upload the `.xlsx` (5 MB max, read in memory only) and
click "Read workbook". Every month sheet and the Checklist sheet are read and
compared with the calendar: rows come back New, Changed, Unchanged or Possible
duplicate, grouped by month (Events, Seasons, Observances) with the Checklist
last. Events need a level (pick one in the row, or "Set level" for every new
event in view that has none). The month strip ticks a whole month at once and
filters to it. Nothing saves until Apply; a big import is saved in batches of
300 rows and one Undo reverses all of it. Code: `app/api/excel/parse/route.ts`,
`lib/excelImport/` (reader, classifier, diff, `selection.ts`, `applyClient.ts`),
save action `lib/excelImportActions.ts`, preview `components/ExcelImportPreview.tsx`.

### Telegram group digests (Editor setup)
A bot posts to ONE Telegram group (never private messages). Out of the box it
sends the default **Sunday digest** at 7:30pm Singapore time: the rest of this
month's events and gatherings, plus a **Planning check** that asks the team
whether everything is in place for any event marked **Big event** (tick it in
the event's More details) up to 8 weeks ahead, including the count of open
event-checklist items. It always sends, even when little is scheduled. Run
migration 028 first (the Big event tick needs it).

From migration 029 on, digests are managed on the **Reminders** page (Editors
only), under "Telegram group digests". Each digest has: a name, the weekdays to
send on, what it covers (rest of this month, this week up to Sunday, or the
next N days counting today), whether to list Events and/or Gatherings, which
categories (none picked = all), the big-events planning check and how many weeks
ahead, open-checklist counts, an optional intro and closing line, and a live
preview of the exact message. "Create from the default" copies the Sunday digest
into an editable one. To change a single message, use "Edit the message for the
next send": it is used once, then the digest goes back to automatic. "Skip the
next send" holds one back, and "Send now" posts a digest immediately (and counts
as today's send). Until the first digest is created (or if migration 029 has not
been run), the default Sunday message keeps being sent on Sundays only; once at
least one digest exists, only your digests are sent. Holidays are listed in every
digest regardless of the category picks.

The schedule runs the job once a day (`30 11 * * *` in `vercel.json`, 11:30 UTC =
7:30pm Singapore) and the app decides which digests are due, sending each at
most once a day. Vercel's free (Hobby) plan only guarantees the time within the
hour, so a message may arrive between 7:00 and 7:59pm; an exact 7:30pm needs the
Pro plan. Digests can only go out on whole days, not at a custom time.

Setup (once):
1. In Telegram, message **@BotFather**, send `/newbot`, follow the prompts, and
   keep the bot token it gives you (treat it like a password).
2. Add the new bot to the group as a member.
3. Get the group's chat id: send any message in the group, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser (put your real
   token in) and read `"chat":{"id":-100...}`. Or add **@RawDataBot** to the
   group briefly and read the id it posts, then remove it. Group ids are
   negative numbers; include the minus sign.
4. In Vercel, Project > Settings > Environment Variables, add:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET` (a random string of at least 32 characters, e.g. `openssl rand -base64 32`; Vercel sends it to the schedule
   automatically) and `TELEGRAM_DIGEST_ENABLED` = `true`. Optional: `APP_URL`
   (the calendar's address, added as a link at the end of the message).
5. Redeploy. On the Reminders page, each digest's preview shows the text without
   sending, and "Send now" posts it once (before any digest exists, "Preview the
   default message" and "Send the default now (test)" do the same for the default).

To turn it off: set `TELEGRAM_DIGEST_ENABLED` to anything other than `true` (or
delete it) and redeploy; to pause one digest, switch it off on the Reminders
page. Code: `app/api/cron/telegram-digest/route.ts` (which digests are due, the
once-a-day claim), `lib/telegramDigest.ts` (the wording), `lib/telegramDigestConfig.ts`
(settings rules), `lib/telegramDigestStore.ts` (the table), and
`lib/telegramDigestConfigActions.ts` / `lib/telegramDigestActions.ts` (page buttons).

## Key design decisions worth knowing before changing things
- **Time wraps within a day; multi-day is a separate feature.** An event
  whose time ends "after midnight" just wraps within the 24-hour clock display.
  Multi-day events are a deliberate separate mechanism (an end date, migration
  010) drawn as a bar across days — don't conflate the two.
- **Recurring events store one rule, not one row per occurrence** — expansion
  happens at render time (`lib/recurrence.ts`), scoped to whichever date
  range is currently visible.
- **RLS is "allow all"** — the anon key can read/write everything in
  Supabase directly. This is a known, accepted v1 tradeoff for an internal
  tool, not an oversight; don't tighten it without checking with Edwin.
- **Roles are enforced in the app, not in the database.** Middleware gates
  pages by role, and every mutating Server Action re-checks the role from the
  login cookie (`lib/authz.ts`), so hiding a button is never the only
  protection. It still isn't database-level security (see RLS above), so don't
  treat the passcodes as strong access control.
- **The Churchwide/Zone/TG "Event Type" picker is a UI grouping over the
  existing `level` field, not a new column** — Zone's sub-options (Youth,
  Poly, Uni, Adults, COW/Thirdspace) are just `levels` rows, same as
  Churchwide/TG/Gathering. See `ZONE_LEVEL_NAMES` /
  `CHURCHWIDE_LEVEL_NAME` / `TG_LEVEL_NAME` in `lib/constants.ts` and
  `topCategoryFor()` in `EventModal.tsx` before changing this.
- **Migrations are numbered SQL files at the repo root**
  (`supabase_migration_0NN_*.sql`), run manually by whoever owns the shared
  Supabase project (Edwin) — there's no migration runner. Since the database
  is shared (not per-developer), you generally won't need to run these
  yourself; just know they exist if a feature you're building needs a schema
  change. `MIGRATIONS_APPLIED.md` at the repo root is the single source of
  truth for which migrations exist, which have been confirmed run against the
  live Supabase project, and what the next free number is — check it before
  adding one, and add your row there as "Not yet confirmed". (Numbering starts
  at 002; the original schema is `supabase_schema.sql`. Migrations 002-024 are
  applied; the next free number is 025.) `npm run check:schema` is a read-only check of which tables/columns exist in the live database.

## Working with Claude Code on this project
This project was built almost entirely through conversational, phase-by-phase
collaboration with Claude Code — plan first, get explicit approval on anything
with a real design tradeoff (schema changes especially), implement, verify
against real data with screenshots, then commit. That pattern has worked well;
continuing it is recommended over jumping straight to implementation on
anything nontrivial.
