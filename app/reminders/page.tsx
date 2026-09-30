import { getAllChecklistTemplates, getAllReminderTemplates } from "@/lib/data";
import RemindersForm from "@/components/RemindersForm";
import ChecklistTemplatesSection from "@/components/ChecklistTemplatesSection";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const [templates, checklistTemplates] = await Promise.all([
    getAllReminderTemplates(),
    getAllChecklistTemplates(),
  ]);

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Reminders</h1>
      <ChecklistTemplatesSection templates={checklistTemplates} />
      <RemindersForm templates={templates} checklistTemplates={checklistTemplates} />
    </main>
  );
}
