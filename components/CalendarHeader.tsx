"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors duration-fast ease-apple hover:bg-fill hover:text-navy active:bg-line [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
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

  // The title row sticks under the top bar while the month scrolls. A
  // sentinel above it tells us when it is stuck so a hairline can appear.
  // The wrapper uses `contents` so the sticky row's containing block is the
  // tall calendar column, not this short header (sticky is bounded by its parent).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="contents">
      <div ref={sentinelRef} aria-hidden="true" className="h-px -mb-px" />
      <div
        className={[
          "sticky top-0 z-30 -mx-1 mb-1 flex items-center justify-between gap-x-2 gap-y-2 sm:gap-x-4 bg-canvas/95 px-1 py-2 backdrop-blur-sm transition-[border-color] duration-fast",
          "border-b",
          stuck ? "border-line" : "border-transparent",
        ].join(" ")}
      >
        <div className="flex items-center gap-1 sm:gap-2">
          <h1 className="text-title sm:text-display text-navy mr-1">{format(monthStart, "MMMM yyyy")}</h1>
          <div className="flex items-center gap-0.5">
            <NavChevron
              href={prevHref}
              label={`${format(prev, "MMMM yyyy")} (←)`}
              icon={<ChevronLeftIcon />}
            />
            <NavChevron
              href={nextHref}
              label={`${format(next, "MMMM yyyy")} (→)`}
              icon={<ChevronRightIcon />}
            />
          </div>
          <Link
            href="/"
            title="Jump to this month (T)"
            className="inline-flex min-h-[36px] items-center rounded-pill bg-fill px-3 sm:px-4 [@media(pointer:coarse)]:min-h-[44px] text-body font-medium text-navy transition-colors duration-fast ease-apple hover:bg-line"
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
              className="hidden sm:inline-flex"
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
              aria-label="Add event"
              className="[@media(pointer:coarse)]:min-h-[44px]"
              onClick={onAddClick}
            >
              <span className="hidden sm:inline">Add event</span>
            </Button>
          </div>
        )}
      </div>

      <div className="mb-3 mt-2">
        <LevelChips
          levels={levels}
          onEdit={isEditor ? (level) => setLevelModal({ type: "edit", level }) : undefined}
        />
      </div>

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
