"use client";

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
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-navy">{title}</p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onChooseA}
          disabled={busy}
          className="text-left px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          <div className="text-sm font-medium text-navy">{optionALabel}</div>
          <div className="text-xs text-gray-500">{optionADescription}</div>
        </button>
        <button
          type="button"
          onClick={onChooseB}
          disabled={busy}
          className={[
            "text-left px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50",
            optionBDanger ? "border-red-300" : "border-gray-300",
          ].join(" ")}
        >
          <div className={["text-sm font-medium", optionBDanger ? "text-red-600" : "text-navy"].join(" ")}>
            {optionBLabel}
          </div>
          <div className="text-xs text-gray-500">{optionBDescription}</div>
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
