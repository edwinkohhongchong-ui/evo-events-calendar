export const dynamic = "force-dynamic";

export default function BackupPage() {
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Backup</h1>
      <p className="text-sm text-gray-600 mb-4">
        Downloads every row from every table in the app (events, holidays, seasons,
        checklist, categories, notes, etc.) as one JSON file — a developer-restorable
        safety net, not a substitute for the PDF/Word/ICS exports.
      </p>
      <a
        href="/api/admin/backup"
        className="inline-block px-4 py-2 text-sm rounded bg-navy text-white hover:bg-navy/90"
      >
        Download full backup (JSON)
      </a>
    </main>
  );
}
