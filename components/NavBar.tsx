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
import GeneralNotesDrawer from "./GeneralNotesDrawer";
import type { NoteCommentRow } from "@/lib/types";
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
  PrinterIcon,
  PlayCircleIcon,
  ChevronIcon,
  UndoIcon,
  RedoIcon,
  LogOutIcon,
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
    { href: "/seasons", label: "Seasons", icon: <LayersIcon />, tour: "nav-seasons" },
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
    { href: "/seasons/import", label: "Import schedules", caption: "Word or Excel calendar", icon: <UploadIcon /> },
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
    {
      href: "/export/calendar",
      label: "Print Calendar",
      caption: "Pick months, one per page",
      icon: <PrinterIcon />,
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

const ROW = "flex items-center gap-3 w-full text-left px-3 py-2.5 text-body rounded-ctl relative transition-colors duration-fast coarse:min-h-[44px]";
// Undo / Redo: soft translucent-white pills on the navy bar; label collapses to icon-only on phones.
const HISTORY_BTN =
  "inline-flex h-8 items-center gap-1.5 rounded-pill px-2.5 text-body bg-white/10 text-white whitespace-nowrap transition-colors duration-fast hover:bg-white/20 focus-visible:outline-gold disabled:opacity-40 disabled:hover:bg-white/10 sm:px-3 coarse:min-h-[44px] coarse:min-w-[44px] coarse:justify-center";

export default function NavBar({ generalComments = [] }: { generalComments?: NoteCommentRow[] }) {
  const pathname = usePathname();
  const isEditor = useIsEditor();
  const { start: startTour, isOpen: tourOpen, step: tourStep } = useOnboardingTour();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const g = groupForPath(pathname);
    return g ? { [g]: true } : {};
  });
  const [entered, setEntered] = useState(false);

  // Publish the bar's rendered height (48px row + 2px gold border, plus the
  // error banner when shown) as --nav-h so the month bar and weekday row can
  // stack directly beneath this sticky bar. CSS falls back to 50px.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty("--nav-h", `${el.getBoundingClientRect().height}px`);
      window.dispatchEvent(new Event("evo:nav-h"));
    };
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--nav-h");
    };
  }, []);

  // Subtle fade/slide-in after mount.
  useEffect(() => {
    if (!menuOpen) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [menuOpen]);

  // The Calendar page has its own General Notes card, so the drawer closes there.
  useEffect(() => {
    if (pathname === "/") setNotesOpen(false);
  }, [pathname]);

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
    } else if (tourOpen) {
      // Moving on to a step that isn't about the menu: close it so it
      // doesn't linger over the next highlight (e.g. the bell).
      setMenuOpen(false);
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
  } = useUndo();

  const closeMenu = () => setMenuOpen(false);
  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setBellOpen(false);
    setNotesOpen(false);
  }, []);
  // Only join the Escape stack while something is actually open, so a bare
  // Escape doesn't swallow the key for layers beneath the always-mounted bar.
  useEscapeKey(closeAll, menuOpen || bellOpen || notesOpen);

  // Clear the session cookie, then do a full navigation so no cached
  // role-specific page survives. Navigate even if the request fails.
  const logout = async () => {
    closeMenu();
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  };

  if (pathname === "/login") return null;

  // Viewer role: Calendar, Export + Replay tour only; no Undo/Redo, Tools,
  // Checklist or Admin.
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderItem = (item: Item, nested: boolean) => {
    const active = !item.external && pathname === item.href;
    const cls = [
      ROW,
      nested ? "pl-9" : "",
      active ? "text-navy font-medium bg-navy-50" : "text-ink hover:bg-canvas",
    ].join(" ");
    const inner = (
      <>
        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold" aria-hidden="true" />}
        <span className={active ? "text-navy" : "text-ink-2"}>{item.icon}</span>
        <span className="min-w-0">
          <span className="block">{item.label}</span>
          {item.caption && <span className="block text-micro text-ink-2 font-normal">{item.caption}</span>}
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
            hasActive ? "text-navy font-medium" : "text-ink hover:bg-canvas",
          ].join(" ")}
        >
          <span className="flex items-center gap-3">
            <span className={hasActive ? "text-navy" : "text-ink-2"}>{group.icon}</span>
            {group.label}
          </span>
          <span className="text-ink-3">
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

  const divider = <div className="border-t border-line my-1.5 mx-2" role="separator" />;

  return (
    <nav
      ref={navRef}
      className="sticky top-0 z-40 print:hidden print:static bg-navy text-white border-b-2 border-gold"
    >
      {error && <ErrorBanner message={error} onDismiss={dismissError} />}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-12 gap-2 sm:gap-3">
        <Link
          href="/"
          aria-label="+EVO Events — back to the calendar"
          className="inline-flex items-center gap-2 font-semibold text-ui text-white whitespace-nowrap shrink-0 rounded-ctl px-1 -mx-1 hover:opacity-80 transition-opacity duration-fast focus-visible:outline-gold"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-hidden="true" />
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
              aria-label="Undo"
              className={HISTORY_BTN}
            >
              <UndoIcon className="!h-4 !w-4" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              type="button"
              data-tour="redo-button"
              onClick={redo}
              disabled={!canRedo || isBusy}
              title={redoLabel ? `Redo: ${redoLabel} (Cmd/Ctrl+Shift+Z)` : "Nothing to redo"}
              aria-label="Redo"
              className={HISTORY_BTN}
            >
              <RedoIcon className="!h-4 !w-4" />
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
        {!isEditor && (
          <span
            title="Ask an Editor to change things"
            className="inline-flex h-8 items-center whitespace-nowrap rounded-pill bg-white/15 px-2.5 text-micro font-medium text-white coarse:min-h-[44px] coarse:px-3"
          >
            View only
          </span>
        )}
        <NotificationBell
          open={bellOpen}
          onOpenChange={(o) => {
            setBellOpen(o);
            if (o) {
              setMenuOpen(false);
              setNotesOpen(false);
            }
          }}
        />
        {pathname !== "/" && (
          <GeneralNotesDrawer
            open={notesOpen}
            onOpenChange={(o) => {
              setNotesOpen(o);
              if (o) {
                setMenuOpen(false);
                setBellOpen(false);
              }
            }}
            comments={generalComments}
          />
        )}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            data-tour="hamburger-menu-button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setBellOpen(false);
              setNotesOpen(false);
            }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Open menu"
            className="flex flex-col justify-center gap-[3px] w-8 h-8 coarse:w-11 coarse:h-11 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-gold transition-colors duration-fast items-center"
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
                  "absolute right-0 top-full mt-1 w-[min(18rem,calc(100vw-1.5rem))] max-h-[calc(100vh-4rem)] overflow-y-auto bg-surface text-ink rounded-card shadow-pop z-50 p-1.5 transition duration-150 ease-out",
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
                    pathname === "/" ? "bg-navy text-white" : "bg-navy-50 text-navy hover:bg-navy/10",
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
                  </>
                )}
                {renderGroup(EXPORT)}

                {divider}
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    startTour();
                  }}
                  className={[ROW, "text-ink hover:bg-canvas"].join(" ")}
                >
                  <span className="text-ink-2">
                    <PlayCircleIcon />
                  </span>
                  Replay tour
                </button>
                <button type="button" onClick={logout} className={[ROW, "text-ink hover:bg-canvas"].join(" ")}>
                  <span className="text-ink-2">
                    <LogOutIcon />
                  </span>
                  Log out
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
