import { getAllChecklist, getAllChecklistTemplates, getEventOptions } from "@/lib/data";
import ChecklistTable from "@/components/ChecklistTable";
import ChecklistTemplatesSection from "@/components/ChecklistTemplatesSection";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const [checklist, eventOptions, templates] = await Promise.all([
    getAllChecklist(),
    getEventOptions(),
    getAllChecklistTemplates(),
  ]);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Checklist</h1>
      <ChecklistTemplatesSection templates={templates} />
      <ChecklistTable checklist={checklist} eventOptions={eventOptions} />
    </main>
  );
}
