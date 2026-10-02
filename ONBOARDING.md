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
comment in the sidebars only — no adding, editing, ticking or deleting). Their passcodes live in the
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
  applied; the next free number is 025.)

## Working with Claude Code on this project
This project was built almost entirely through conversational, phase-by-phase
collaboration with Claude Code — plan first, get explicit approval on anything
with a real design tradeoff (schema changes especially), implement, verify
against real data with screenshots, then commit. That pattern has worked well;
continuing it is recommended over jumping straight to implementation on
anything nontrivial.
