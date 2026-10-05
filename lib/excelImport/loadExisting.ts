import { supabase } from "../supabase";
import type { ChecklistRow, EventRow, ExceptionRow, HolidayRow, LevelRow, OverrideRow, SeasonRow } from "../types";
import type { ExcelExisting } from "./diffExcel";

// Reads everything the Excel preview compares the workbook with. Unlike the
// page helpers in lib/data.ts (which return [] on a failed query so a screen
// still renders), a failed read THROWS here: an empty list would make every
// workbook row look "new" and invite duplicates.

const PAGE = 1000; // PostgREST returns at most this many rows per request

async function readAll<T>(table: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(order)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`excel import: reading ${table} failed:`, error.message);
      throw new Error("Could not read the calendar to compare against. Please try again.");
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/**
 * Events are loaded whole (a repeating event anchored in an earlier year still lands in the
 * workbook's year), as are their overrides and exceptions, so the diff can expand them.
 */
export async function loadExcelExisting(): Promise<ExcelExisting> {
  const [events, overrides, exceptions, seasons, holidays, checklist, levels] = await Promise.all([
    readAll<EventRow>("events", "event_date"),
    readAll<OverrideRow>("event_overrides", "created_at"),
    readAll<ExceptionRow>("event_exceptions", "created_at"),
    readAll<SeasonRow>("seasons", "start_date"),
    readAll<HolidayRow>("holidays", "holiday_date"),
    readAll<ChecklistRow>("checklist", "category"),
    readAll<LevelRow>("levels", "sort_order"),
  ]);
  return { events, overrides, exceptions, seasons, holidays, checklist, levels };
}
