"use client";

import { ComponentProps } from "react";
import ConfirmDialog from "./ConfirmDialog";
import ModalShell from "./ui/ModalShell";

type Props = Omit<ComponentProps<typeof ConfirmDialog>, "onCancel"> & {
  title?: string;
  onClose: () => void;
};

// A "delete this?" prompt in the shared modal chrome (used by the list
// screens that confirm a delete without opening the edit form).
export default function ConfirmModal({ title = "Are you sure?", onClose, ...dialog }: Props) {
  return (
    <ModalShell title={title} onClose={onClose} widthClass="max-w-md">
      <div className="pb-2">
        <ConfirmDialog {...dialog} onCancel={onClose} />
      </div>
    </ModalShell>
  );
}
