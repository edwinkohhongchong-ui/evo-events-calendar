import { getAllLevels } from "@/lib/data";
import ExportForm from "@/components/ExportForm";
import PrintCalendarCard from "@/components/PrintCalendarCard";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "Choose PDF or Word.",
  "Pick a date range with the quick buttons (This month is the default), or choose Custom to set exact dates.",
  "Tap categories to include or leave out (all are included by default).",
  "Click \"Download\" to save the event lineup.",
];

export default async function ExportPage() {
  const levels = await getAllLevels();

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Export Document</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <ExportForm levels={levels} />
      <PrintCalendarCard />
    </main>
  );
}
