import { getAllHolidays } from "@/lib/data";
import HolidaysTable from "@/components/HolidaysTable";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "Use the Year dropdown to show one year's holidays, or \"All\" to see every year.",
  "Click any row to edit that holiday's date, name, or type.",
  "Click the × on a row to delete it (you'll be asked to confirm first).",
  "Click \"Add Holiday\" to add a new one.",
  "Click \"Update Calendar\" to check for public holidays you're missing this year and add them.",
  "Click \"Start a New Year\" to set up a fresh year of holidays.",
];

export default async function HolidaysPage() {
  const holidays = await getAllHolidays();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Holidays</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <HolidaysTable holidays={holidays} />
    </main>
  );
}
