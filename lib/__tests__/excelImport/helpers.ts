import { addDays } from "../../schedules/dateText";
import { indexToCol } from "../../excelImport/readXlsx";
import type { XlsxCell, XlsxMerge, XlsxSheet, XlsxWorkbook } from "../../excelImport/readXlsx";

// Builds XlsxSheet objects directly so the parser is tested without a real workbook.

export function makeSheet(name: string, cells: Record<string, string | number | boolean>, merges: XlsxMerge[] = []): XlsxSheet {
  const map = new Map<string, XlsxCell>();
  let maxRow = 0;
  let maxCol = 0;
  for (const [ref, value] of Object.entries(cells)) {
    map.set(ref, { value, text: String(value), isFormula: false });
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    maxRow = Math.max(maxRow, Number(m[2]));
    let c = 0;
    for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
    maxCol = Math.max(maxCol, c);
  }
  return { name, index: 0, cells: map, merges, maxRow, maxCol };
}

export const workbook = (...sheets: XlsxSheet[]): XlsxWorkbook => ({ sheets: sheets.map((s, i) => ({ ...s, index: i })), truncated: false });

export const P = 16;

export interface Tag {
  /** 0-based among the week's tag rows. */
  row: number;
  /** 0 = Monday ... 6 = Sunday. */
  col: number;
  text: string;
  /** Extra columns merged to the right / rows merged down. */
  across?: number;
  down?: number;
}

export interface Week {
  monday: string;
  /** Text after the day number, keyed by weekday index. */
  obs?: Record<number, string>;
  tagRows?: number;
  tags?: Tag[];
  /** Event cell text by weekday index. */
  events?: Record<number, string>;
}

export function monthSheet(name: string, header: number, weeks: Week[], extra: Record<string, string | number> = {}): XlsxSheet {
  const cells: Record<string, string | number | boolean> = {
    A1: "January",
    A2: 2026,
    A5: "Set number in cell A3 to 1 for Sunday",
    C9: 44,
    D9: "=C9+1",
    E12: "30",
    ...extra,
  };
  const merges: XlsxMerge[] = [];
  WEEKDAYS.forEach((d, i) => (cells[`${indexToCol(P + i)}${header}`] = d));
  let r = header + 1;
  for (const w of weeks) {
    const tagRows = w.tagRows ?? 0;
    for (let i = 0; i < 7; i++) {
      const day = Number(addDays(w.monday, i).slice(8, 10));
      cells[`${indexToCol(P + i)}${r}`] = w.obs?.[i] ? `${day}  ${w.obs[i]}` : String(day);
    }
    for (const t of w.tags ?? []) {
      const row = r + 1 + t.row;
      cells[`${indexToCol(P + t.col)}${row}`] = t.text;
      if (t.across || t.down) merges.push({ r1: row, c1: P + t.col, r2: row + (t.down ?? 0), c2: P + t.col + (t.across ?? 0) });
    }
    const eventsRow = r + 1 + tagRows;
    for (const [i, text] of Object.entries(w.events ?? {})) cells[`${indexToCol(P + Number(i))}${eventsRow}`] = text;
    r = eventsRow + 1;
  }
  return makeSheet(name, cells, merges);
}

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/** March 2026: Sunday the 1st, so the first Monday is 23 Feb. */
export const MARCH_WEEKS = ["2026-02-23", "2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"];
