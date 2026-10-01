"use client";

import { useState } from "react";
import { ChevronIcon, HelpCircleIcon } from "./icons";

interface InstructionsPanelProps {
  /** Each entry is rendered as its own bullet line, not merged into a paragraph. */
  lines: string[];
  /** One-line summary shown when collapsed. */
  label?: string;
}

// Generic, reusable collapsed-by-default "how to use this page" panel.
// Pure display — no data mutation. Starts closed; click the summary row to
// expand/collapse. Follows the same thin-border/rounded-corners card style
// as ChecklistTemplatesSection.tsx's collapsible section.
export default function InstructionsPanel({
  lines,
  label = "How to use this page",
}: InstructionsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 overflow-hidden rounded-card bg-surface">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-ui font-medium text-ink hover:bg-canvas"
      >
        <span className="flex items-center gap-2">
          <span className="text-ink-2">
            <HelpCircleIcon className="!h-[18px] !w-[18px]" />
          </span>
          {label}
        </span>
        <span className="text-ink-3">
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {lines.map((line, i) => (
              <li key={i} className="text-body text-ink-2">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
