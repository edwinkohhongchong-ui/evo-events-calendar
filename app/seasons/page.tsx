import { getAllSeasons } from "@/lib/data";
import SeasonsTable from "@/components/SeasonsTable";

export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  const seasons = await getAllSeasons();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Seasons</h1>
      <SeasonsTable seasons={seasons} />
    </main>
  );
}
