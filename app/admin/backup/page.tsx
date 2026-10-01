import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const INSTRUCTIONS = [
  "Click \"Download full backup (JSON)\" to download every row from every table in the app as one file.",
  "This is a technical safety copy for restoring data, not something to read — use the Export tab for a readable PDF/Word event list instead.",
];

export default function BackupPage() {
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Backup</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <a
        href="/api/admin/backup"
        className="inline-block px-4 py-2 text-sm rounded bg-navy text-white hover:bg-navy/90"
      >
        Download full backup (JSON)
      </a>
    </main>
  );
}
