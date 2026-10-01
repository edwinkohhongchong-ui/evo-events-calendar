"use client";

import { useState, type ReactNode } from "react";
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

  return (
    <div className="flex flex-col gap-3 mb-3">
      <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-display text-navy mr-1">{format(monthStart, "MMMM yyyy")}</h1>
          <div className="flex items-center gap-0.5">
            <NavChevron
              href={`/?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`}
              label="Previous month"
              icon={<ChevronLeftIcon />}
            />
            <NavChevron
              href={`/?year=${next.getFullYear()}&month=${next.getMonth() + 1}`}
              label="Next month"
              icon={<ChevronRightIcon />}
            />
          </div>
          <Link
            href="/"
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
