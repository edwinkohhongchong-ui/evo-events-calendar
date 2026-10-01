"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, addMonths, subMonths } from "date-fns";
import { LevelRow } from "@/lib/types";
import { useIsEditor } from "@/lib/roleContext";
import LevelModal from "./LevelModal";
import LevelChips from "./LevelChips";
import Button from "./ui/Button";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TagPlusIcon } from "./icons";

// Prev/next stay real links (middle-click, open in new tab) styled as
// icon-only buttons with a CSS tooltip, since IconButton renders a <button>.
function NavChevron({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <Link
        href={href}
        aria-label={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors duration-fast ease-apple hover:bg-fill hover:text-navy"
      >
        {icon}
      </Link>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-chip bg-ink px-2 py-1 text-micro font-medium text-white opacity-0 transition-opacity delay-300 duration-fast group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

interface CalendarHeaderProps {
  monthStart: Date;
  levels: LevelRow[];
  onAddClick?: () => void;
}

type LevelModalState = { type: "closed" } | { type: "add" } | { type: "edit"; level: LevelRow };

export default function CalendarHeader({ monthStart, levels, onAddClick }: CalendarHeaderProps) {
  const router = useRouter();
  const isEditor = useIsEditor();
  const prev = subMonths(monthStart, 1);
  const next = addMonths(monthStart, 1);
  const [levelModal, setLevelModal] = useState<LevelModalState>({ type: "closed" });
  const nextSortOrder = levels.length > 0 ? Math.max(...levels.map((l) => l.sort_order)) + 1 : 0;

  // Keyboard shortcuts: T = this month, ←/→ = previous/next month, N = new
  // event (Editors). Ignored while typing, with modifier keys held, or while
  // any dialog (modal, drawer, tour) is open.
  const prevHref = `/?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`;
  const nextHref = `/?year=${next.getFullYear()}&month=${next.getMonth() + 1}`;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === "t") router.push("/");
      else if (e.key === "ArrowLeft") router.push(prevHref);
      else if (e.key === "ArrowRight") router.push(nextHref);
      else if (key === "n" && isEditor && onAddClick) onAddClick();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, prevHref, nextHref, isEditor, onAddClick]);

  return (
    <div className="flex flex-col gap-3 mb-3">
      <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-display text-navy mr-1">{format(monthStart, "MMMM yyyy")}</h1>
          <div className="flex items-center gap-0.5">
            <NavChevron
              href={prevHref}
              label="Previous month (←)"
              icon={<ChevronLeftIcon />}
            />
            <NavChevron
              href={nextHref}
              label="Next month (→)"
              icon={<ChevronRightIcon />}
            />
          </div>
          <Link
            href="/"
            title="Jump to this month (T)"
            className="inline-flex min-h-[28px] items-center rounded-pill bg-fill px-3 text-body font-medium text-navy transition-colors duration-fast ease-apple hover:bg-line"
          >
            Today
          </Link>
        </div>
        {isEditor && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<TagPlusIcon />}
              onClick={() => setLevelModal({ type: "add" })}
              aria-label="Add category"
              title="Add category"
            >
              <span className="hidden md:inline">Category</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<PlusIcon />}
              data-tour="add-event-button"
              title="Add event (N)"
              onClick={onAddClick}
            >
              Add event
            </Button>
          </div>
        )}
      </div>

      <LevelChips
        levels={levels}
        onEdit={isEditor ? (level) => setLevelModal({ type: "edit", level }) : undefined}
      />

      {levelModal.type !== "closed" && (
        <LevelModal
          mode={levelModal.type}
          level={levelModal.type === "edit" ? levelModal.level : undefined}
          nextSortOrder={nextSortOrder}
          onClose={() => setLevelModal({ type: "closed" })}
          onSaved={() => {
            setLevelModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setLevelModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
