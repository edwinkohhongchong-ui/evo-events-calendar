import type { ExcelPlan } from "./diffExcel";

/** The JSON POST /api/excel/parse returns on success. */
export interface ExcelParseResponse {
  plan: ExcelPlan;
  /** Level names in the calendar, for the level picker. */
  levels: string[];
  /** Some cell text was cut to fit the reader's limits. */
  truncated: boolean;
  fileName: string;
  notes: {
    /** Sheets that were neither a month nor the checklist. */
    ignoredSheets: string[];
    sheetFlags: Array<{ sheet: string; cell: string; severity: "warn" | "error"; message: string }>;
  };
}
