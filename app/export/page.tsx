import { getAllLevels } from "@/lib/data";
import ExportForm from "@/components/ExportForm";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "Pick a start and end date for the event list (defaults to the current month).",
  "Tick which categories to include (all are ticked by default).",
  "Click \"Export as PDF\" or \"Export as Word\" to download the event lineup in that format.",
];

export default async function ExportPage() {
  const levels = await getAllLevels();

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Export Document</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <ExportForm levels={levels} />
    </main>
  );
}
