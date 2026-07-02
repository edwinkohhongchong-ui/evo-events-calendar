import { getAllChecklist } from "@/lib/data";
import ChecklistTable from "@/components/ChecklistTable";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const checklist = await getAllChecklist();

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Checklist</h1>
      <ChecklistTable checklist={checklist} />
    </main>
  );
}
