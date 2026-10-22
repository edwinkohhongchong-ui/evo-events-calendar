import { headers } from "next/headers";
import { getAllChecklistTemplates } from "@/lib/data";
import ChecklistTemplatesSection from "@/components/ChecklistTemplatesSection";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "A template is a reusable list of to-dos, like \"Big Event Prep.\" Click \"Add Checklist Template\" to write one, and give each item a due date counted back from the event (\"weeks before\").",
  "To use one, open an event and choose the template under its checklist. The items are copied onto that event, so changing the template later does not change events that already have it.",
  "You can also drop a template into a drafted Telegram message under Admin → Reminders.",
  "This is separate from the Calendar Checklist (the year-planning list), which these never change.",
];

export default async function ChecklistTemplatesPage() {
  // Middleware already keeps Viewers off this page; second guard so templates
  // are never fetched or rendered for anyone but an Editor.
  const isEditor = (await headers()).get("x-evo-role") === "editor";
  const templates = isEditor ? await getAllChecklistTemplates() : [];

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy">Event Template Checklist</h1>
      <p className="mt-1 mb-4 text-body text-ink-2">Reusable checklists you add to an event, with due dates counted back from the event.</p>
      <InstructionsPanel lines={INSTRUCTIONS} label="How this works" />
      {isEditor && <ChecklistTemplatesSection templates={templates} />}
    </main>
  );
}
