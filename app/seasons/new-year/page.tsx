import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";
import { todayDate } from "@/lib/dates";
import { getAllSeasons, getLatestSeasonSourceDatesBefore } from "@/lib/data";
import NewYearForm from "@/components/NewYearForm";

export const dynamic = "force-dynamic";

// "Start a New Year" for Seasons — mirrors the Holidays flow's phase
// pattern (pick → review/edit → save), but there's no external API behind
// it: for School Schedule / Exam Period seasons (institution-tracked), the
// "fetch" step is really "prefill from whatever was last entered"; for other
// seasons it's a plain +1 year date shift, same as Holidays would propose if
// it had no API either.
export default async function SeasonsNewYearPage() {
  const currentYear = todayDate().getFullYear();
  const nextYear = currentYear + 1;
  const [seasons, priorSourceDates] = await Promise.all([
    getAllSeasons(),
    getLatestSeasonSourceDatesBefore(nextYear),
  ]);

  const currentYearSeasons = seasons.filter(
    (s) => Number(s.start_date.slice(0, 4)) === currentYear
  );

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <Link href="/seasons" className="inline-flex items-center gap-1 text-body font-medium text-navy hover:underline">
        <ChevronLeftIcon className="!h-4 !w-4" />
        Seasons
      </Link>
      <h1 className="text-xl font-semibold text-navy mt-2 mb-4">
        Start a New Year — {nextYear}
      </h1>
      <NewYearForm
        currentYear={currentYear}
        nextYear={nextYear}
        currentYearSeasons={currentYearSeasons}
        allSeasons={seasons}
        priorSourceDates={priorSourceDates}
      />
    </main>
  );
}
