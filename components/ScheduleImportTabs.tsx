"use client";

import { useState } from "react";
import InstructionsPanel from "./InstructionsPanel";
import ScheduleImportUploader from "./ScheduleImportUploader";
import ExcelImportUploader from "./ExcelImportUploader";

type Mode = "word" | "excel";

const WORD_INSTRUCTIONS = [
  "Upload the yearly education schedule (a Word .docx file, up to 5 MB) and click \"Read document\".",
  "Review the changes first. Each row is marked New, Changed or Unchanged, with anything that needs a second look flagged beside it.",
  "Untick any row you don't want. Click Edit on a row to fix its name, category, dates or notes.",
  "Rows with a red \"Fix first\" note (for example an end date before the start date) can't be ticked until you correct them.",
  "Nothing saves until you click Apply. After that, Undo reverses the whole import in one step.",
];

const EXCEL_INSTRUCTIONS = [
  "Upload the old events calendar workbook (an Excel .xlsx file, up to 5 MB) and click \"Read workbook\".",
  "The app reads every month sheet and the Checklist sheet, then shows what is new, what changed and what is already in the calendar.",
  "Rows are grouped by month: events, seasons and observances, with the checklist at the end. Use the month strip to tick a whole month or jump to it.",
  "Events need a level. Pick one in the row, or use \"Set level\" to give it to every new event that has none.",
  "Rows marked \"Possible duplicate\" or \"Matched by name\" start unticked. Check them before ticking.",
  "Nothing saves until you click Apply. A big import is saved in batches, and Undo reverses the whole import in one step.",
];

const OPTIONS: Array<{ mode: Mode; label: string }> = [
  { mode: "word", label: "Word document" },
  { mode: "excel", label: "Excel calendar" },
];

// Both flows stay mounted so switching back keeps a half-reviewed preview.
export default function ScheduleImportTabs() {
  const [mode, setMode] = useState<Mode>("word");
  return (
    <div>
      <div role="tablist" aria-label="What to import" className="mb-4 inline-flex rounded-pill bg-fill p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            role="tab"
            id={`import-tab-${o.mode}`}
            aria-selected={mode === o.mode}
            aria-controls={`import-panel-${o.mode}`}
            onClick={() => setMode(o.mode)}
            className={`min-h-[32px] rounded-pill px-4 text-body font-medium transition-colors duration-fast coarse:min-h-[44px] ${
              mode === o.mode ? "bg-navy text-white" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="import-panel-word" aria-labelledby="import-tab-word" hidden={mode !== "word"}>
        <InstructionsPanel lines={WORD_INSTRUCTIONS} />
        <ScheduleImportUploader />
      </div>
      <div role="tabpanel" id="import-panel-excel" aria-labelledby="import-tab-excel" hidden={mode !== "excel"}>
        <InstructionsPanel lines={EXCEL_INSTRUCTIONS} />
        <ExcelImportUploader />
      </div>
    </div>
  );
}
