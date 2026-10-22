import { getAllChecklist, getEventOptions, getAllSeasons } from "@/lib/data";
import Link from "next/link";
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
      <h1 className="text-xl font-semibold text-navy">Calendar Checklist</h1>
      <p className="mt-1 text-body text-ink-2">Your year-planning list: tick things off as each month is covered.</p>
      <Link href="/checklist-templates" className="mt-1 mb-4 inline-block text-body font-medium text-navy hover:underline coarse:py-3">
        Looking for the event templates? Event Template Checklist &rarr;
      </Link>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <ChecklistTable checklist={checklist} eventOptions={eventOptions} seasons={seasons} />
    </main>
  );
}
