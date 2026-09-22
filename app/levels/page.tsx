import { getAllLevels } from "@/lib/data";
import LevelsTable from "@/components/LevelsTable";

export const dynamic = "force-dynamic";

export default async function LevelsPage() {
  const levels = await getAllLevels();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Categories</h1>
      <LevelsTable levels={levels} />
    </main>
  );
}
