"use client";

import { ReactNode } from "react";
import Button, { ButtonVariant } from "./ui/Button";

interface ConfirmDialogProps {
  message: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  error?: string | null;
  busy?: boolean;
  /** Defaults to "danger" (the dialog's original use: confirming a delete). */
  confirmVariant?: ButtonVariant;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  message,
  confirmLabel = "Yes, delete",
  busyLabel = "Deleting…",
  error,
  busy,
  confirmVariant = "danger",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ui text-ink">{message}</p>
      {error && <p className="text-body text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} loading={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
