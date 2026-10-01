import { getAllSeasons } from "@/lib/data";
import SeasonsTable from "@/components/SeasonsTable";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "Use the Year dropdown to show only seasons touching one year, or \"All\" to see every season.",
  "Click any row to edit its name, category, start/end dates, or notes.",
  "Click the × on a row to delete it (you'll be asked to confirm first).",
  "Click \"Add Season\" to add a new one.",
];

export default async function SeasonsPage() {
  const seasons = await getAllSeasons();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Seasons</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <SeasonsTable seasons={seasons} />
    </main>
  );
}
