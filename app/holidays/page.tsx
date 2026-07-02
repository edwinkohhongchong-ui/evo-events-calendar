import { getAllHolidays } from "@/lib/data";
import HolidaysTable from "@/components/HolidaysTable";

export const dynamic = "force-dynamic";

export default async function HolidaysPage() {
  const holidays = await getAllHolidays();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Holidays</h1>
      <HolidaysTable holidays={holidays} />
    </main>
  );
}
