import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";
import ScheduleImportTabs from "@/components/ScheduleImportTabs";

// Editor-only: middleware sends a Viewer home for every path under /seasons.
export default function ScheduleImportPage() {
  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <Link href="/seasons" className="inline-flex items-center gap-1 text-body font-medium text-navy hover:underline">
        <ChevronLeftIcon className="!h-4 !w-4" />
        Seasons
      </Link>
      <h1 className="mt-2 mb-4 text-display text-navy">Import schedules</h1>
      <ScheduleImportTabs />
    </main>
  );
}
