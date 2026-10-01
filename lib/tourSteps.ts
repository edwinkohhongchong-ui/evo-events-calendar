// Content for the first-run onboarding tour (see useOnboardingTour.tsx /
// OnboardingTourModal.tsx). Drafted by the Pastoral Leader agent (30 Sep
// 2026), grounded in the actual code at the time of writing — see git
// history for the review that confirmed each access-control claim below.
//
// Groups:
//   1. Calendar basics       (steps 0-3)
//   2. Notes and updates     (steps 4-6)
//   3. Editor vs Viewer      (steps 7-10)
//   4. Do's and don'ts       (steps 11-14)
export interface TourStep {
  title: string;
  body: string;
  /**
   * Pathname this step should be shown on (e.g. "/"). When set and it
   * differs from the current route, OnboardingTourModal navigates there as
   * the step becomes active.
   */
  route?: string;
  /**
   * CSS selector (e.g. `[data-tour="add-event-button"]`) for the real UI
   * element this step is talking about. OnboardingTourModal draws a
   * highlight ring around it. Omitted when there's no single stable,
   * always-rendered element to point at (e.g. the step describes a
   * general concept, or an element that depends on specific data existing).
   */
  targetSelector?: string;
  /**
   * True when targetSelector lives inside NavBar's hamburger dropdown —
   * the tour forces that menu open while this step is active so the
   * highlighted element is actually mounted/visible.
   */
  requiresMenuOpen?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  // --- Part 1 of 4: Using the calendar ---
  {
    title: "Add an event",
    body: "Click any day on the calendar to add an event there. Fill in its name, time, category, and whether it repeats. Shortcuts: N adds an event, T jumps to today, and the ← → arrow keys change month.",
    route: "/",
    targetSelector: '[data-tour="add-event-button"]',
  },
  {
    title: "Edit or delete an event",
    body: "Click an existing event card to see its details, then click Edit to change it or Delete to remove it.",
    route: "/",
    targetSelector: '[data-tour="calendar-grid"]',
  },
  {
    title: "Move an event",
    body: "Drag an event card onto a different day to reschedule it right away — no need to open it first.",
    route: "/",
    targetSelector: '[data-tour="calendar-grid"]',
  },
  {
    title: "Export the event list",
    body: 'Open the ☰ menu at the top right, open the Export group, then click "Export Document" to download the event list as a PDF or Word file for any date range and category you pick.',
    route: "/",
    targetSelector: '[data-tour="nav-export-document"]',
    requiresMenuOpen: true,
  },

  // --- Part 2 of 4: Notes and updates ---
  {
    title: "General Notes (left panel)",
    body: "Use this for notes that should show up every month, no matter which month you're viewing. Anyone can add a note or reply here. On every other tab, tap the notes icon beside the bell to open the same notes.",
    route: "/",
    targetSelector: '[data-tour="general-notes-panel"]',
  },
  {
    title: "Month Notes (right panel)",
    body: "Use this for notes specific to the month you're currently looking at. Anyone can add a note or reply here too.",
    route: "/",
    targetSelector: '[data-tour="month-notes-panel"]',
  },
  {
    title: "See what changed",
    body: "The bell at the top right shows what other people added, edited, moved or deleted. A red number means something new. Tap an update to jump straight to that item.",
    route: "/",
    targetSelector: '[data-tour="notification-bell"]',
  },

  // --- Part 3 of 4: Editor vs. Viewer access ---
  {
    title: "What a Viewer can do",
    body: "View the calendar and its notes, open and edit any existing event's details, add notes or replies, and check the bell for recent changes.",
    route: "/",
  },
  {
    title: "What a Viewer can't do",
    body: "Add a brand-new event, delete anything, drag an event to a new day, or use Undo/Redo.",
    route: "/",
  },
  {
    title: "Other tabs need Editor access",
    body: "In the ☰ menu, Tools (Holidays, Seasons, Categories), Checklist, Admin (Reminders, Backup) and Export don't even appear for a Viewer — only the Calendar does.",
    route: "/",
    targetSelector: '[data-tour="hamburger-menu-panel"]',
    requiresMenuOpen: true,
  },
  {
    title: "Editors have full access",
    body: "Editors can do everything above, plus add, delete, and reorganize across every tab.",
    route: "/",
    targetSelector: '[data-tour="hamburger-menu-panel"]',
    requiresMenuOpen: true,
  },

  // --- Part 4 of 4: What you should and shouldn't do ---
  {
    title: "Keep the Editor passcode within the team",
    body: "It's the only thing stopping anyone with the link from editing or deleting — don't share it outside the team.",
    route: "/",
  },
  {
    title: "Give recurring events an end date on purpose",
    body: 'Leaving "Repeat Until" blank makes the event repeat forever until someone deletes it — the form will warn you and ask you to confirm if you really mean that.',
    route: "/",
  },
  {
    title: "Made a mistake? Use Undo",
    body: "Editors have Undo and Redo buttons in the top bar for reversing or reapplying the last change.",
    route: "/",
    targetSelector: '[data-tour="undo-button"]',
  },
  {
    title: "Missing buttons are expected for Viewers",
    body: "If you're a Viewer and don't see an Add, Delete, or Undo button, that's correct, not a bug.",
    route: "/",
  },
];
