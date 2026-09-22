import { getAllLevels } from "@/lib/data";
import ExportForm from "@/components/ExportForm";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const levels = await getAllLevels();

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-1">Export Document</h1>
      <p className="text-sm text-gray-500 mb-4">
        Pick a date range and which categories to include, then export the event lineup as a PDF or
        Word document.
      </p>
      <ExportForm levels={levels} />
    </main>
  );
}
