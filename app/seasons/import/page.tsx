import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";
import InstructionsPanel from "@/components/InstructionsPanel";
import ScheduleImportUploader from "@/components/ScheduleImportUploader";

// Editor-only: middleware sends a Viewer home for every path under /seasons.
const INSTRUCTIONS = [
  "Upload the yearly education schedule (a Word .docx file, up to 5 MB) and click \"Read document\".",
  "Review the changes first. Each row is marked New, Changed or Unchanged, with anything that needs a second look flagged beside it.",
  "Untick any row you don't want. Click Edit on a row to fix its name, category, dates or notes.",
  "Rows with a red \"Fix first\" note (for example an end date before the start date) can't be ticked until you correct them.",
  "Nothing saves until you click Apply. After that, Undo reverses the whole import in one step.",
];

export default function ScheduleImportPage() {
  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <Link href="/seasons" className="inline-flex items-center gap-1 text-body font-medium text-navy hover:underline">
        <ChevronLeftIcon className="!h-4 !w-4" />
        Seasons
      </Link>
      <h1 className="mt-2 mb-4 text-display text-navy">Import schedules</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <ScheduleImportUploader />
    </main>
  );
}
