"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import ErrorBanner from "./ErrorBanner";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/holidays", label: "Holidays" },
  { href: "/seasons", label: "Seasons" },
  { href: "/checklist", label: "Checklist" },
  { href: "/levels", label: "Categories" },
  { href: "/reminders", label: "Reminders" },
  { href: "/admin/backup", label: "Backup" },
];

export default function NavBar() {
  const pathname = usePathname();
  const isEditor = useIsEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    isBusy,
    error,
    dismissError,
    lastAction,
    dismissLastAction,
  } = useUndo();

  if (pathname === "/login") return null;

  // Viewer role: Calendar tab only, no Undo/Redo (undoing an add/delete
  // would recreate/destroy rows a Viewer isn't allowed to touch directly —
  // see the auth plan) and no Export/Reminders utilities.
  const links = isEditor ? LINKS : LINKS.filter((link) => link.href === "/");

  return (
    <nav className="bg-navy text-white">
      {error && <ErrorBanner message={error} onDismiss={dismissError} />}
      {lastAction && (
        <div className="bg-emerald-50 text-emerald-800 text-xs px-4 py-1.5 flex items-center justify-between gap-2 border-b border-emerald-200">
          <span>
            {lastAction.kind === "undo" ? "↶ Undid" : "↷ Redid"}: {lastAction.label}
          </span>
          <button
            type="button"
            onClick={dismissLastAction}
            className="text-emerald-600 hover:text-emerald-900 leading-none"
          >
            ×
          </button>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-12 gap-3">
        <span className="font-semibold text-sm whitespace-nowrap shrink-0">+EVO Events</span>
        {isEditor && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo || isBusy}
              title={undoLabel ? `Undo: ${undoLabel} (Cmd/Ctrl+Z)` : "Nothing to undo"}
              className="px-2.5 py-1 text-sm rounded border border-white/30 hover:bg-white/10 whitespace-nowrap disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo || isBusy}
              title={redoLabel ? `Redo: ${redoLabel} (Cmd/Ctrl+Shift+Z)` : "Nothing to redo"}
              className="px-2.5 py-1 text-sm rounded border border-white/30 hover:bg-white/10 whitespace-nowrap disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Redo ↷
            </button>
          </div>
        )}
        {/* Scrolls horizontally instead of wrapping/overflowing the page at
            narrow widths — see PROJECT decision: NavBar is in-scope for the
            mobile pass, the calendar grid it sits above is not. */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "px-3 py-1.5 text-sm rounded whitespace-nowrap shrink-0",
                  active ? "bg-white/15 font-medium" : "hover:bg-white/10",
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {isEditor && (
        <div className="relative ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setExportOpen((prev) => !prev)}
            onBlur={() => setTimeout(() => setExportOpen(false), 150)}
            className="px-3 py-1.5 text-sm rounded whitespace-nowrap hover:bg-white/10"
          >
            Export ▾
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white text-gray-800 rounded-md shadow-lg border border-gray-200 overflow-hidden z-50">
              <a
                href="/api/export/ics"
                className="block px-3 py-2 text-sm hover:bg-gray-50"
              >
                <div className="font-medium text-navy">Add to Calendar (.ics)</div>
                <div className="text-xs text-gray-500">For Apple Calendar or Google Calendar</div>
              </a>
              <Link href="/export" className="block px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-100">
                <div className="font-medium text-navy">Export Document (PDF/Word)</div>
                <div className="text-xs text-gray-500">Pick a date range and categories</div>
              </Link>
            </div>
          )}
        </div>
        )}
      </div>
    </nav>
  );
}
