"use client";

import { useState } from "react";

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
    <div className="border border-gray-200 rounded-md mb-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-navy rounded-md"
      >
        <span>{label}</span>
        <span
          className={`text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-gray-200">
          <ul className="list-disc list-inside flex flex-col gap-1">
            {lines.map((line, i) => (
              <li key={i} className="text-xs text-gray-600">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
