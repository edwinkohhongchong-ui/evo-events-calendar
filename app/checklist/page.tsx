import { getAllChecklist, getEventOptions, getAllSeasons } from "@/lib/data";
import ChecklistTable from "@/components/ChecklistTable";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "Use the Target month dropdown to show only items for one month.",
  "Click the colored Status dropdown on a row to change its status without opening it.",
  "Click anywhere else on a row to open it and edit its details or delete it.",
  "Click \"Check Calendar\" to auto-mark items Done if they're linked to a scheduled event, and Not Started if that link is gone.",
  "Click \"Add Item\" to add a new item, optionally linked to an event on the calendar.",
];

export default async function ChecklistPage() {
  const [checklist, eventOptions, seasons] = await Promise.all([
    getAllChecklist(),
    getEventOptions(),
    getAllSeasons(),
  ]);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Checklist</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <ChecklistTable checklist={checklist} eventOptions={eventOptions} seasons={seasons} />
    </main>
  );
}
