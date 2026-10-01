import { getAllChecklistTemplates, getAllReminderTemplates } from "@/lib/data";
import RemindersForm from "@/components/RemindersForm";
import ChecklistTemplatesSection from "@/components/ChecklistTemplatesSection";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "Pick a saved template under \"Reminder template,\" or leave it on Freeform and write your own intro text.",
  "Tick which upcoming events to include, then type a Telegram handle and click \"Open in Telegram\" to send the drafted message yourself — nothing sends automatically.",
  "Under \"Checklist Templates,\" click \"Add Checklist Template\" to write a reusable list. You can attach it to an event in the drafted message, or add it to an event from the event's details so it can be ticked off with due dates — it is separate from the monthly Checklist tab and never updates it.",
  "Edit the \"Message\" box directly any time; your own wording stays put until you click \"Reset to auto-generated.\"",
  "Click \"Add Template\" to save your current handle, intro, and lookahead range for reuse next time.",
];

export default async function RemindersPage() {
  const [templates, checklistTemplates] = await Promise.all([
    getAllReminderTemplates(),
    getAllChecklistTemplates(),
  ]);

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Reminders</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <ChecklistTemplatesSection templates={checklistTemplates} />
      <RemindersForm templates={templates} checklistTemplates={checklistTemplates} />
    </main>
  );
}
