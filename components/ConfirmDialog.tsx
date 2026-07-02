"use client";

import { ReactNode } from "react";

interface ConfirmDialogProps {
  message: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  error?: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  message,
  confirmLabel = "Yes, delete",
  busyLabel = "Deleting…",
  error,
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-700">{message}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded border border-gray-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded bg-red-600 text-white disabled:opacity-50"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
