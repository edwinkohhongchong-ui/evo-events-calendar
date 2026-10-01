// Content for the first-run onboarding tour (see useOnboardingTour.tsx /
// OnboardingTourModal.tsx). Drafted by the Pastoral Leader agent (30 Sep
// 2026), grounded in the actual code at the time of writing — see git
// history for the review that confirmed each access-control claim below.
//
// Groups:
//   1. Calendar basics       (steps 0-3)
//   2. Sidebar notes         (steps 4-5)
//   3. Editor vs Viewer      (steps 6-9)
//   4. Do's and don'ts       (steps 10-13)
export interface TourStep {
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  // --- Part 1 of 4: Using the calendar ---
  {
    title: "Add an event",
    body: "Click any day on the calendar to add an event there. Fill in its name, time, category, and whether it repeats.",
  },
  {
    title: "Edit or delete an event",
    body: "Click an existing event card to see its details, then click Edit to change it or Delete to remove it.",
  },
  {
    title: "Move an event",
    body: "Drag an event card onto a different day to reschedule it right away — no need to open it first.",
  },
  {
    title: "Export the event list",
    body: 'Click "Export ▾" in the top bar, then "Export Document," to download the event list as a PDF or Word file for any date range and category you pick.',
  },

  // --- Part 2 of 4: Notes on the Calendar page ---
  {
    title: "General Notes (left panel)",
    body: "Use this for notes that should show up every month, no matter which month you're viewing. Anyone can add a note or reply here.",
  },
  {
    title: "Month Notes (right panel)",
    body: "Use this for notes specific to the month you're currently looking at. Anyone can add a note or reply here too.",
  },

  // --- Part 3 of 4: Editor vs. Viewer access ---
  {
    title: "What a Viewer can do",
    body: "View the calendar and its notes, open and edit any existing event's details, and add notes or replies.",
  },
  {
    title: "What a Viewer can't do",
    body: "Add a brand-new event, delete anything, drag an event to a new day, or use Undo/Redo.",
  },
  {
    title: "Other tabs need Editor access",
    body: "Holidays, Seasons, Checklist, Categories, Reminders, Backup, and Export don't even appear for a Viewer — only the Calendar tab does.",
  },
  {
    title: "Editors have full access",
    body: "Editors can do everything above, plus add, delete, and reorganize across every tab.",
  },

  // --- Part 4 of 4: What you should and shouldn't do ---
  {
    title: "Keep the Editor passcode within the team",
    body: "It's the only thing stopping anyone with the link from editing or deleting — don't share it outside the team.",
  },
  {
    title: "Give recurring events an end date on purpose",
    body: 'Leaving "Repeat Until" blank makes the event repeat forever until someone deletes it — the form will warn you and ask you to confirm if you really mean that.',
  },
  {
    title: "Made a mistake? Use Undo",
    body: "Editors have Undo and Redo buttons in the top bar for reversing or reapplying the last change.",
  },
  {
    title: "Missing buttons are expected for Viewers",
    body: "If you're a Viewer and don't see an Add, Delete, or Undo button, that's correct, not a bug.",
  },
];
