"use client";

import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import Toast from "./ui/Toast";

// Bottom-centre confirmation after any saved change, undo or redo, with a
// one-click reverse (Editors only — Undo/Redo are Editor-only actions).
export default function UndoToast() {
  const { lastAction, dismissLastAction, undo, redo, canUndo, canRedo, isBusy } = useUndo();
  const isEditor = useIsEditor();
  if (!lastAction) return null;

  const verb = lastAction.kind === "done" ? "Done" : lastAction.kind === "undo" ? "Undid" : "Redid";
  // After a fresh change or a redo the natural next step is Undo; after an
  // undo it is Redo.
  const offerRedo = lastAction.kind === "undo";
  const available = offerRedo ? canRedo : canUndo;

  return (
    <Toast
      message={`${verb}: ${lastAction.label}`}
      actionLabel={isEditor && available && !isBusy ? (offerRedo ? "Redo" : "Undo") : undefined}
      onAction={() => {
        dismissLastAction();
        if (offerRedo) redo();
        else undo();
      }}
      onDismiss={dismissLastAction}
    />
  );
}
