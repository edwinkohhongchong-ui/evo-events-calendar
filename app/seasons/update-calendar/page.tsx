import Link from "next/link";
import { todayDate } from "@/lib/dates";
import { getAllSeasons, getSeasonSourceDates } from "@/lib/data";
import UpdateCalendarForm from "@/components/UpdateCalendarForm";

export const dynamic = "force-dynamic";

// "Update Calendar" for Seasons — unlike Holidays' same-named flow (which
// re-checks an external API), there's no API for Singapore school/poly/
// university exam schedules. This is a manual entry assist: Edwin reads each
// institution's current-year calendar himself via the quick links below,
// types the dates in, and the app aggregates them into the matching Season
// row. See lib/examScheduleSources.ts for why.
export default async function UpdateCalendarPage() {
  const year = todayDate().getFullYear();
  const [seasons, sourceDates] = await Promise.all([getAllSeasons(), getSeasonSourceDates(year)]);

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <Link href="/seasons" className="text-sm text-navy hover:underline">
        ← Seasons
      </Link>
      <h1 className="text-xl font-semibold text-navy mt-2 mb-4">Update Calendar — {year}</h1>
      <p className="text-sm text-gray-600 mb-4">
        For each institution, open its calendar in a new tab and enter the current exam/term
        dates. The proposed School Schedule / Exam Period season below each group updates live as
        you fill things in.
      </p>
      <UpdateCalendarForm year={year} seasons={seasons} initialSourceDates={sourceDates} />
    </main>
  );
}
