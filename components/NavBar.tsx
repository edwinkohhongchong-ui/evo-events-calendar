"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { useOnboardingTour } from "@/lib/useOnboardingTour";
import { TOUR_STEPS } from "@/lib/tourSteps";
import { useEscapeKey } from "@/lib/useEscapeKey";
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
  const { start: startTour, isOpen: tourOpen, step: tourStep } = useOnboardingTour();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // While the onboarding tour is on a step that targets something inside
  // this hamburger dropdown (e.g. "Export the event list"), force the menu
  // open so the tour's highlight has something mounted to point at. This
  // only ever opens the menu, never closes it — a Viewer/Editor who closes
  // it manually mid-step just loses the highlight, not the tour itself.
  useEffect(() => {
    if (tourOpen && TOUR_STEPS[tourStep]?.requiresMenuOpen) {
      setMenuOpen(true);
    }
  }, [tourOpen, tourStep]);
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

  const closeMenu = () => setMenuOpen(false);
  useEscapeKey(closeMenu);

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
              data-tour="undo-button"
              onClick={undo}
              disabled={!canUndo || isBusy}
              title={undoLabel ? `Undo: ${undoLabel} (Cmd/Ctrl+Z)` : "Nothing to undo"}
              className="px-2.5 py-1 text-sm rounded border border-white/30 hover:bg-white/10 whitespace-nowrap disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              data-tour="redo-button"
              onClick={redo}
              disabled={!canRedo || isBusy}
              title={redoLabel ? `Redo: ${redoLabel} (Cmd/Ctrl+Shift+Z)` : "Nothing to redo"}
              className="px-2.5 py-1 text-sm rounded border border-white/30 hover:bg-white/10 whitespace-nowrap disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Redo ↷
            </button>
          </div>
        )}

        <div className="ml-auto relative shrink-0" ref={menuRef}>
          <button
            type="button"
            data-tour="hamburger-menu-button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-label="Open menu"
            className="flex flex-col justify-center gap-[3px] w-8 h-8 rounded hover:bg-white/10 items-center"
          >
            <span className="block w-4 h-[2px] bg-white rounded-full" />
            <span className="block w-4 h-[2px] bg-white rounded-full" />
            <span className="block w-4 h-[2px] bg-white rounded-full" />
          </button>

          {menuOpen && (
            <>
              {/* Click-outside backdrop — transparent, sits below the panel. */}
              <div
                className="fixed inset-0 z-40"
                onClick={closeMenu}
                aria-hidden="true"
              />
              <div
                data-tour="hamburger-menu-panel"
                className="absolute right-0 top-full mt-1 w-60 bg-white text-gray-800 rounded-md shadow-lg border border-gray-200 overflow-hidden z-50 py-1"
              >
                {links.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={closeMenu}
                      className={[
                        "block px-3 py-2 text-sm",
                        active ? "bg-gray-100 font-medium text-navy" : "hover:bg-gray-50 text-gray-800",
                      ].join(" ")}
                    >
                      {link.label}
                    </Link>
                  );
                })}

                {isEditor && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <a
                      href="/api/export/ics"
                      onClick={closeMenu}
                      className="block px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <div className="font-medium text-navy">Add to Calendar (.ics)</div>
                      <div className="text-xs text-gray-500">For Apple Calendar or Google Calendar</div>
                    </a>
                    <Link
                      href="/export"
                      data-tour="nav-export-document"
                      onClick={closeMenu}
                      className="block px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <div className="font-medium text-navy">Export Document (PDF/Word)</div>
                      <div className="text-xs text-gray-500">Pick a date range and categories</div>
                    </Link>
                  </>
                )}

                <div className="border-t border-gray-100 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    startTour();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-800"
                >
                  Replay tour
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
