"use client";

import Button from "./ui/Button";

interface RecurringScopeDialogProps {
  title: string;
  optionALabel: string;
  optionADescription: string;
  optionBLabel: string;
  optionBDescription: string;
  // Styles option B as destructive (red) — used for "the whole series" on delete.
  optionBDanger?: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onChooseA: () => void;
  onChooseB: () => void;
}

// Shared "which occurrences does this apply to" chooser — used both when
// saving an edit (only this event / this and all future events) and when
// deleting (only this event / the whole series). See lib/actions.ts:
// detachOccurrence, splitSeriesFromOccurrence, deleteOccurrence.
export default function RecurringScopeDialog({
  title,
  optionALabel,
  optionADescription,
  optionBLabel,
  optionBDescription,
  optionBDanger,
  busy,
  error,
  onCancel,
  onChooseA,
  onChooseB,
}: RecurringScopeDialogProps) {
  const optionCls = "text-left px-4 py-3 rounded-ctl border hover:bg-canvas disabled:opacity-50 transition-colors duration-fast";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ui font-medium text-ink">{title}</p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onChooseA} disabled={busy} className={`${optionCls} border-line-strong`}>
          <div className="text-ui font-medium text-ink">{optionALabel}</div>
          <div className="text-body text-ink-2">{optionADescription}</div>
        </button>
        <button
          type="button"
          onClick={onChooseB}
          disabled={busy}
          className={`${optionCls} ${optionBDanger ? "border-danger/40" : "border-line-strong"}`}
        >
          <div className={["text-ui font-medium", optionBDanger ? "text-danger" : "text-ink"].join(" ")}>
            {optionBLabel}
          </div>
          <div className="text-body text-ink-2">{optionBDescription}</div>
        </button>
      </div>
      {error && <p className="text-body text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
