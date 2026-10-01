"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { useOnboardingTour } from "@/lib/useOnboardingTour";
import { TOUR_STEPS } from "@/lib/tourSteps";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ErrorBanner from "./ErrorBanner";
import NotificationBell from "./NotificationBell";
import {
  CalendarIcon,
  ToolsIcon,
  SunIcon,
  LayersIcon,
  TagIcon,
  CheckSquareIcon,
  ShieldIcon,
  BellIcon,
  DatabaseIcon,
  UploadIcon,
  CalendarPlusIcon,
  FileTextIcon,
  PlayCircleIcon,
  ChevronIcon,
} from "./icons";

type Item = {
  href: string;
  label: string;
  caption?: string;
  icon: ReactNode;
  external?: boolean; // plain <a> (file download), not client-side nav
  tour?: string;
};
type Group = { id: string; label: string; icon: ReactNode; items: Item[] };

const TOOLS: Group = {
  id: "tools",
  label: "Tools",
  icon: <ToolsIcon />,
  items: [
    { href: "/holidays", label: "Holidays", icon: <SunIcon /> },
    { href: "/seasons", label: "Seasons", icon: <LayersIcon /> },
    { href: "/levels", label: "Categories", icon: <TagIcon /> },
  ],
};
const ADMIN: Group = {
  id: "admin",
  label: "Admin",
  icon: <ShieldIcon />,
  items: [
    { href: "/reminders", label: "Reminders", icon: <BellIcon /> },
    { href: "/admin/backup", label: "Backup", icon: <DatabaseIcon /> },
  ],
};
const EXPORT: Group = {
  id: "export",
  label: "Export",
  icon: <UploadIcon />,
  items: [
    {
      href: "/api/export/ics",
      label: "Add to Calendar (.ics)",
      caption: "For Apple Calendar or Google Calendar",
      icon: <CalendarPlusIcon />,
      external: true,
    },
    {
      href: "/export",
      label: "Export Document (PDF/Word)",
      caption: "Pick a date range and categories",
      icon: <FileTextIcon />,
      tour: "nav-export-document",
    },
  ],
};
const GROUPS = [TOOLS, ADMIN, EXPORT];

function groupForPath(pathname: string | null): string | null {
  if (!pathname) return null;
  for (const g of GROUPS) {
    if (g.items.some((i) => !i.external && i.href === pathname)) return g.id;
  }
  return null;
}

const ROW = "flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm rounded-lg relative";

export default function NavBar() {
  const pathname = usePathname();
  const isEditor = useIsEditor();
  const { start: startTour, isOpen: tourOpen, step: tourStep } = useOnboardingTour();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const g = groupForPath(pathname);
    return g ? { [g]: true } : {};
  });
  const [entered, setEntered] = useState(false);

  // Subtle fade/slide-in after mount.
  useEffect(() => {
    if (!menuOpen) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [menuOpen]);

  // Navigating into a group's page expands that group.
  useEffect(() => {
    const g = groupForPath(pathname);
    if (g) setOpenGroups((prev) => (prev[g] ? prev : { ...prev, [g]: true }));
  }, [pathname]);

  // While the onboarding tour is on a step that targets something inside
  // this hamburger dropdown (e.g. "Export the event list"), force the menu
  // open so the tour's highlight has something mounted to point at. This
  // only ever opens the menu, never closes it — a Viewer/Editor who closes
  // it manually mid-step just loses the highlight, not the tour itself.
  useEffect(() => {
    if (tourOpen && TOUR_STEPS[tourStep]?.requiresMenuOpen) {
      setMenuOpen(true);
      // Expand every group so the tour's target (e.g. Export Document) is mounted.
      setOpenGroups({ tools: true, admin: true, export: true });
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
  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setBellOpen(false);
  }, []);
  useEscapeKey(closeAll);

  if (pathname === "/login") return null;

  // Viewer role: Calendar + Replay tour only; no Undo/Redo, Tools, Checklist,
  // Admin or Export (same gating as before).
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderItem = (item: Item, nested: boolean) => {
    const active = !item.external && pathname === item.href;
    const cls = [
      ROW,
      nested ? "pl-9" : "",
      active ? "text-navy font-medium bg-gray-50" : "text-gray-700 hover:bg-gray-100",
    ].join(" ");
    const inner = (
      <>
        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold" aria-hidden="true" />}
        <span className={active ? "text-navy" : "text-gray-500"}>{item.icon}</span>
        <span className="min-w-0">
          <span className="block">{item.label}</span>
          {item.caption && <span className="block text-xs text-gray-500 font-normal">{item.caption}</span>}
        </span>
      </>
    );
    return item.external ? (
      <a key={item.href} href={item.href} onClick={closeMenu} className={cls}>
        {inner}
      </a>
    ) : (
      <Link
        key={item.href}
        href={item.href}
        data-tour={item.tour}
        aria-current={active ? "page" : undefined}
        onClick={closeMenu}
        className={cls}
      >
        {inner}
      </Link>
    );
  };

  const renderGroup = (group: Group) => {
    const open = !!openGroups[group.id];
    const hasActive = groupForPath(pathname) === group.id;
    const panelId = `nav-group-${group.id}`;
    return (
      <div key={group.id}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => toggleGroup(group.id)}
          className={[
            ROW,
            "justify-between",
            hasActive ? "text-navy font-medium" : "text-gray-700 hover:bg-gray-100",
          ].join(" ")}
        >
          <span className="flex items-center gap-3">
            <span className={hasActive ? "text-navy" : "text-gray-500"}>{group.icon}</span>
            {group.label}
          </span>
          <span className="text-gray-400">
            <ChevronIcon open={open} />
          </span>
        </button>
        {open && (
          <div id={panelId} className="mt-0.5 space-y-0.5">
            {group.items.map((i) => renderItem(i, true))}
          </div>
        )}
      </div>
    );
  };

  const divider = <div className="border-t border-gray-100 my-1.5 mx-2" role="separator" />;

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
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-12 gap-3">
        <Link
          href="/"
          aria-label="+EVO Events — back to the calendar"
          className="font-semibold text-sm whitespace-nowrap shrink-0 rounded-md px-1 -mx-1 hover:opacity-80 transition-opacity duration-fast"
        >
          <span className="sm:hidden">+EVO</span>
          <span className="hidden sm:inline">+EVO Events</span>
        </Link>

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

        <div className="ml-auto flex items-center gap-1 shrink-0">
        <NotificationBell
          open={bellOpen}
          onOpenChange={(o) => {
            setBellOpen(o);
            if (o) setMenuOpen(false);
          }}
        />
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            data-tour="hamburger-menu-button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setBellOpen(false);
            }}
            aria-expanded={menuOpen}
            aria-label="Open menu"
            className="flex flex-col justify-center gap-[3px] w-8 h-8 rounded-full hover:bg-white/10 items-center"
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
                className={[
                  "absolute right-0 top-full mt-1 w-[min(18rem,calc(100vw-1.5rem))] max-h-[calc(100vh-4rem)] overflow-y-auto bg-white text-gray-800 rounded-xl shadow-lg border border-gray-200 z-50 p-1.5 transition duration-150 ease-out",
                  entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
                ].join(" ")}
              >
                <Link
                  href="/"
                  onClick={closeMenu}
                  aria-current={pathname === "/" ? "page" : undefined}
                  className={[
                    ROW,
                    "py-3 font-semibold relative",
                    pathname === "/" ? "bg-navy text-white" : "bg-navy/5 text-navy hover:bg-navy/10",
                  ].join(" ")}
                >
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold" aria-hidden="true" />
                  <CalendarIcon />
                  Calendar
                </Link>

                {isEditor && (
                  <>
                    <div className="mt-0.5">{renderGroup(TOOLS)}</div>
                    {renderItem({ href: "/checklist", label: "Checklist", icon: <CheckSquareIcon /> }, false)}
                    {divider}
                    {renderGroup(ADMIN)}
                    {divider}
                    {renderGroup(EXPORT)}
                  </>
                )}

                {divider}
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    startTour();
                  }}
                  className={[ROW, "text-gray-700 hover:bg-gray-100"].join(" ")}
                >
                  <span className="text-gray-500">
                    <PlayCircleIcon />
                  </span>
                  Replay tour
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </nav>
  );
}
