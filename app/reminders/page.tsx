import { getAllReminderTemplates } from "@/lib/data";
import RemindersForm from "@/components/RemindersForm";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const templates = await getAllReminderTemplates();

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Reminders</h1>
      <RemindersForm templates={templates} />
    </main>
  );
}
