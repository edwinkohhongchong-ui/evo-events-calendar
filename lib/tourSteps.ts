// Content for the first-run onboarding tour (see useOnboardingTour.tsx /
// OnboardingTourModal.tsx). Drafted by the Pastoral Leader agent (30 Sep
// 2026), refreshed 2 Oct 2026 for checklists, search, Duplicate, the phone
// layout and Seasons. Access-control claims were confirmed against the code.
//
// Groups (see the "--- Part" comments below): calendar basics, event
// checklists, Seasons, notes and updates, Editor vs Viewer, do's and don'ts.
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
  // --- Part 1 of 6: Using the calendar ---
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
    title: "Duplicate an event",
    body: "Need a similar event? Open it and click Duplicate. You get a new form already filled in from the original, so just change what's different and save. The original isn't touched.",
    route: "/",
    targetSelector: '[data-tour="calendar-grid"]',
  },
  {
    title: "Find an event",
    body: "Click the magnifier at the top of the calendar, or press the / key, and start typing. Matching events stay bright and the rest fade back. Press Escape to clear the search.",
    route: "/",
  },
  {
    title: "Peek at an event",
    body: "Hover over an event (or tab to it) to see a quick preview card with its time, category and notes — no click needed. On a phone, just tap the event to open it.",
    route: "/",
    targetSelector: '[data-tour="calendar-grid"]',
  },
  {
    title: "Using a phone",
    body: "On a phone the month shows as a simple list of days with their events. Swipe left or right to change month, or use the arrows. Tap an event to open it.",
    route: "/",
  },
  {
    title: "Export the event list",
    body: 'Open the ☰ menu at the top right, open the Export group, then click "Export Document" to download the event list as a PDF or Word file for any date range and category you pick.',
    route: "/",
    targetSelector: '[data-tour="nav-export-document"]',
    requiresMenuOpen: true,
  },

  // --- Part 2 of 6: Event checklists ---
  {
    title: "Checklist for an event",
    body: "Open a one-off event to give it its own to-do list, like booking the venue or sending the poster. Editors can start one from a template. Everyone can tick items off. A small badge on the event card shows how many are done.",
    route: "/",
    targetSelector: '[data-tour="calendar-grid"]',
  },
  {
    title: "The \"overdue\" pill",
    body: 'When a checklist item is past its due date and not ticked, a red "overdue" pill appears in the month bar. Click it to see which events need attention, then click one to open it. The pill disappears once everything is caught up.',
    route: "/",
  },

  // --- Part 3 of 6: Seasons ---
  {
    title: "Seasons",
    body: "Seasons are the coloured bars for things like school terms, holidays and exam periods. Open ☰ → Tools → Seasons to add, edit or delete them.",
    route: "/seasons",
  },
  {
    title: "Update Calendar and Start a New Year",
    body: "\"Update Calendar\" has links to each school's official calendar, with boxes to type in its dates. \"Start a New Year\" carries this year's seasons forward. You review everything first, and nothing is saved until you approve it.",
    route: "/seasons",
  },

  // --- Part 4 of 6: Notes and updates ---
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

  // --- Part 5 of 6: Editor vs. Viewer access ---
  {
    title: "Viewer or Editor?",
    body: "Viewers can look around and comment in the sidebars (General Notes and Month Notes) only. Only Editors can add, edit, tick, move or delete anything, use Undo, or open the other tabs in the ☰ menu. If a button is missing for you, that's expected.",
    route: "/",
    targetSelector: '[data-tour="hamburger-menu-panel"]',
    requiresMenuOpen: true,
  },

  // --- Part 6 of 6: What you should and shouldn't do ---
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
];
