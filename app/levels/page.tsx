import { getAllLevels } from "@/lib/data";
import LevelsTable from "@/components/LevelsTable";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "These are the category labels shown in the calendar legend, the Add Event form, and the list under the calendar.",
  "Click any row (or a chip's ✎ elsewhere in the app) to edit its name, color, or order in the legend.",
  "Click the × on a row to delete it — you can't delete one that's still used by an event.",
  "Click \"Add Category\" to add a new one and give it a color.",
];

export default async function LevelsPage() {
  const levels = await getAllLevels();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Categories</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <LevelsTable levels={levels} />
    </main>
  );
}
