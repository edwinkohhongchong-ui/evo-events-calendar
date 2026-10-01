"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { restoreSnapshot } from "./restore";
import { unwrap } from "../actionResult";
import { AffectedRow, UndoableAction } from "./types";

interface LastAction {
  kind: "undo" | "redo";
  label: string;
}

interface UndoContextValue {
  record: (label: string, affected: AffectedRow[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  isBusy: boolean;
  error: string | null;
  dismissError: () => void;
  // Brief on-screen confirmation of what an undo/redo just did — the nav
  // bar's title tooltip on the buttons only describes what's *about* to
  // happen (before the click), which isn't visible after the fact. This
  // auto-clears itself; see NavBar.tsx for where it's rendered.
  lastAction: LastAction | null;
  dismissLastAction: () => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

const LAST_ACTION_DISPLAY_MS = 4000;

// Session-only history (not persisted across a page reload) shared across
// every screen — mounted once at the root layout so undoing an action taken
// on the calendar still works after navigating to, say, the checklist. This
// data is shared live across ~20 people (see ONBOARDING.md); undo only
// rewinds *this browser tab's* own actions and has no way to detect a
// concurrent edit by someone else in between — a known, accepted limitation
// consistent with the rest of the app (RLS is "allow all", no realtime
// conflict detection exists anywhere else either).
export function UndoProvider({ children }: { children: ReactNode }) {
  const pastRef = useRef<UndoableAction[]>([]);
  const futureRef = useRef<UndoableAction[]>([]);
  const isBusyRef = useRef(false);
  const errorRef = useRef<string | null>(null);
  const lastActionRef = useRef<LastAction | null>(null);
  const lastActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const router = useRouter();

  const record = useCallback((label: string, affected: AffectedRow[]) => {
    if (affected.length === 0) return;
    pastRef.current = [...pastRef.current, { label, affected }];
    futureRef.current = [];
    forceRender();
  }, []);

  const dismissLastAction = useCallback(() => {
    if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
    lastActionRef.current = null;
    forceRender();
  }, []);

  function showLastAction(kind: "undo" | "redo", label: string) {
    if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
    lastActionRef.current = { kind, label };
    lastActionTimerRef.current = setTimeout(() => {
      lastActionRef.current = null;
      forceRender();
    }, LAST_ACTION_DISPLAY_MS);
  }

  const undo = useCallback(() => {
    if (isBusyRef.current || pastRef.current.length === 0) return;
    const entry = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    isBusyRef.current = true;
    errorRef.current = null;
    forceRender();
    restoreSnapshot(entry.affected, "before")
      .then((result) => {
        unwrap(result);
        futureRef.current = [...futureRef.current, entry];
        showLastAction("undo", entry.label);
        router.refresh();
      })
      .catch((err) => {
        // Put it back — the undo didn't take, so it's still available to retry.
        pastRef.current = [...pastRef.current, entry];
        errorRef.current = err instanceof Error ? err.message : "Undo failed.";
      })
      .finally(() => {
        isBusyRef.current = false;
        forceRender();
      });
  }, [router]);

  const redo = useCallback(() => {
    if (isBusyRef.current || futureRef.current.length === 0) return;
    const entry = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    isBusyRef.current = true;
    errorRef.current = null;
    forceRender();
    restoreSnapshot(entry.affected, "after")
      .then((result) => {
        unwrap(result);
        pastRef.current = [...pastRef.current, entry];
        showLastAction("redo", entry.label);
        router.refresh();
      })
      .catch((err) => {
        futureRef.current = [...futureRef.current, entry];
        errorRef.current = err instanceof Error ? err.message : "Redo failed.";
      })
      .finally(() => {
        isBusyRef.current = false;
        forceRender();
      });
  }, [router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Don't hijack native text-field undo while typing in a form.
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    return () => {
      if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
    };
  }, []);

  const dismissError = useCallback(() => {
    errorRef.current = null;
    forceRender();
  }, []);

  const value: UndoContextValue = {
    record,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    undoLabel: pastRef.current.length > 0 ? pastRef.current[pastRef.current.length - 1].label : null,
    redoLabel: futureRef.current.length > 0 ? futureRef.current[futureRef.current.length - 1].label : null,
    isBusy: isBusyRef.current,
    error: errorRef.current,
    dismissError,
    lastAction: lastActionRef.current,
    dismissLastAction,
  };

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
}
