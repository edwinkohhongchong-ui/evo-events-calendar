import InstructionsPanel from "@/components/InstructionsPanel";
import { buttonClass } from "@/components/ui/Button";
import { DownloadIcon } from "@/components/icons";

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
      <div className="rounded-card bg-surface p-5">
        <p className="mb-4 text-body text-ink-2">
          One file with every row from every table. Keep it somewhere safe.
        </p>
        <a href="/api/admin/backup" className={buttonClass("primary", "md")}>
          <DownloadIcon className="!h-[18px] !w-[18px]" />
          Download full backup (JSON)
        </a>
      </div>
    </main>
  );
}
