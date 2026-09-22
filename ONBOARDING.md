# +EVO Events Calendar — Handover / Onboarding

## What this is
A shared, interactive events-planning calendar for TEVO (The Evolution church),
replacing a manually-maintained Excel calendar. Internal tool, ~20 staff/leaders,
not public-facing.

- **Live app:** https://evo-events-calendar.vercel.app (passcode-gated — see
  "Secrets you'll need" below)
- **Repo:** https://github.com/edwinkohhongchong-ui/evo-events-calendar (private)
- **Stack:** Next.js 14 (App Router), Supabase (Postgres + client SDK), Vercel
  (hosting/deploy), Tailwind CSS, `@dnd-kit/core` for drag-and-drop.

## ⚠️ One unresolved item — do this first
`EVO_PASSCODE` (the app's login gate) was accidentally created as a **"Sensitive"**
environment variable in Vercel, which means its value can never be viewed again
through the dashboard — not by anyone, ever, by design. **We were mid-process of
resetting it to a new value when this handover was written — confirm with Edwin
whether that reset actually happened, and if not, do it now:** Vercel → Settings
→ Environment Variables → edit `EVO_PASSCODE` → set a new value (don't mark it
Sensitive this time, or if you do, immediately save the value somewhere retrievable
like a password manager) → redeploy for it to take effect.

## Getting set up locally
1. Clone the repo (`gh repo clone edwinkohhongchong-ui/evo-events-calendar`) —
   use `gh`/git, not GitHub's "Download ZIP" button, since a ZIP has no git
   connection and can't push/pull.
2. Create `.env.local` in the project root with 4 values (ask Edwin for these
   via a secure channel, not chat/email):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   EVO_PASSCODE=...
   CALENDARIFIC_API_KEY=...
   ```
   The first two are always re-viewable at supabase.com → project → Settings →
   API. The Calendarific key is re-viewable by logging into calendarific.com.
   The passcode is the one flagged above.
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

## Key design decisions worth knowing before changing things
- **No day-crossing logic anywhere** — an event ending "after midnight" just
  wraps within a 24-hour clock display; it doesn't span two calendar dates.
  Don't try to "fix" this into real multi-day event spanning without a
  deliberate design discussion first.
- **Recurring events store one rule, not one row per occurrence** — expansion
  happens at render time (`lib/recurrence.ts`), scoped to whichever date
  range is currently visible.
- **RLS is "allow all"** — the anon key can read/write everything. This is a
  known, accepted v1 tradeoff (see passcode gate note above), not an oversight.
- **The passcode gate is a deterrent, not access control.** Don't treat it as
  real security when reasoning about what's safe to build next.

## Working with Claude Code on this project
This project was built almost entirely through conversational, phase-by-phase
collaboration with Claude Code — plan first, get explicit approval on anything
with a real design tradeoff (schema changes especially), implement, verify
against real data with screenshots, then commit. That pattern has worked well;
continuing it is recommended over jumping straight to implementation on
anything nontrivial.
