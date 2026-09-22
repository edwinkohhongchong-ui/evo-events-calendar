import { supabase } from "./supabase";
import {
  ChecklistRow,
  EventRow,
  ExceptionRow,
  HolidayRow,
  LevelRow,
  SeasonRow,
  MonthFocusRow,
  OverrideRow,
} from "./types";

export interface CalendarData {
  events: EventRow[];
  holidays: HolidayRow[];
  seasons: SeasonRow[];
  overrides: OverrideRow[];
  levels: LevelRow[];
  exceptions: ExceptionRow[];
}

// Fetches everything needed to render the grid for [gridStart, gridEnd]
// (inclusive, "yyyy-MM-dd" strings). Never throws — on any query failure we
// log server-side and fall back to an empty list so the grid still renders.
export async function getCalendarData(
  gridStartStr: string,
  gridEndStr: string
): Promise<CalendarData> {
  const [events, holidays, seasons, overrides, levels, exceptions] = await Promise.all([
    getEvents(gridStartStr, gridEndStr),
    getHolidays(gridStartStr, gridEndStr),
    getSeasons(gridStartStr, gridEndStr),
    getOverrides(gridStartStr, gridEndStr),
    getAllLevels(),
    getExceptions(gridStartStr, gridEndStr),
  ]);

  return { events, holidays, seasons, overrides, levels, exceptions };
}

async function getEvents(gridStartStr: string, gridEndStr: string): Promise<EventRow[]> {
  try {
    const [oneOff, recurring] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("recurring", "None")
        .gte("event_date", gridStartStr)
        .lte("event_date", gridEndStr),
      supabase
        .from("events")
        .select("*")
        .neq("recurring", "None")
        .lte("event_date", gridEndStr)
        .or(`repeat_until.is.null,repeat_until.gte.${gridStartStr}`),
    ]);

    if (oneOff.error) console.error("getEvents (one-off) failed:", oneOff.error.message);
    if (recurring.error) console.error("getEvents (recurring) failed:", recurring.error.message);

    return [...(oneOff.data ?? []), ...(recurring.data ?? [])] as EventRow[];
  } catch (err) {
    console.error("getEvents threw:", err);
    return [];
  }
}

async function getHolidays(gridStartStr: string, gridEndStr: string): Promise<HolidayRow[]> {
  try {
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .gte("holiday_date", gridStartStr)
      .lte("holiday_date", gridEndStr);

    if (error) {
      console.error("getHolidays failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getHolidays threw:", err);
    return [];
  }
}

async function getSeasons(gridStartStr: string, gridEndStr: string): Promise<SeasonRow[]> {
  try {
    const { data, error } = await supabase
      .from("seasons")
      .select("*")
      .lte("start_date", gridEndStr)
      .gte("end_date", gridStartStr);

    if (error) {
      console.error("getSeasons failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getSeasons threw:", err);
    return [];
  }
}

// Excepted occurrences whose natural date falls in this grid range — an
// exception's original_date is always the natural, anchor-derived date (an
// excepted occurrence has no new_date to have been dragged elsewhere), so
// unlike getOverrides this only needs one direction of range check.
async function getExceptions(gridStartStr: string, gridEndStr: string): Promise<ExceptionRow[]> {
  try {
    const { data, error } = await supabase
      .from("event_exceptions")
      .select("*")
      .gte("original_date", gridStartStr)
      .lte("original_date", gridEndStr);

    if (error) {
      console.error("getExceptions failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getExceptions threw:", err);
    return [];
  }
}

// Holidays/Seasons/Checklist admin tables are small (a year's worth of rows
// at most) — fetch the whole table rather than windowing by date range.
export async function getAllHolidays(): Promise<HolidayRow[]> {
  try {
    const { data, error } = await supabase.from("holidays").select("*").order("holiday_date");
    if (error) {
      console.error("getAllHolidays failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllHolidays threw:", err);
    return [];
  }
}

// Used by the "Start a New Year" review to dedup against what's already
// there — narrower than getAllHolidays since a new-year fetch only ever
// needs one year's worth of existing rows to compare against.
export async function getHolidaysForYear(year: number): Promise<HolidayRow[]> {
  try {
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`);
    if (error) {
      console.error("getHolidaysForYear failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getHolidaysForYear threw:", err);
    return [];
  }
}

export async function getAllSeasons(): Promise<SeasonRow[]> {
  try {
    const { data, error } = await supabase.from("seasons").select("*").order("start_date");
    if (error) {
      console.error("getAllSeasons failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllSeasons threw:", err);
    return [];
  }
}

// Levels are a small, rarely-changing table — fetched whole (like Holidays/
// Seasons admin data), ordered so the legend and dropdowns render in a
// stable, user-controlled order rather than insertion order.
export async function getAllLevels(): Promise<LevelRow[]> {
  try {
    const { data, error } = await supabase.from("levels").select("*").order("sort_order");
    if (error) {
      console.error("getAllLevels failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllLevels threw:", err);
    return [];
  }
}

export async function getAllChecklist(): Promise<ChecklistRow[]> {
  try {
    const { data, error } = await supabase
      .from("checklist")
      .select("*")
      .order("category")
      .order("item");
    if (error) {
      console.error("getAllChecklist failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllChecklist threw:", err);
    return [];
  }
}

// Returns null if no focus row exists yet for this month — that's the normal
// case for a month nobody has filled in, not an error.
export async function getMonthFocus(year: number, month: number): Promise<MonthFocusRow | null> {
  try {
    const { data, error } = await supabase
      .from("month_focus")
      .select("*")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (error) {
      console.error("getMonthFocus failed:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("getMonthFocus threw:", err);
    return null;
  }
}

// Fetches overrides whose new_date OR original_date falls in this grid range
// — an occurrence can be dragged into view from another month, or out of
// view from this one, so both directions must be checked.
async function getOverrides(gridStartStr: string, gridEndStr: string): Promise<OverrideRow[]> {
  try {
    const { data, error } = await supabase
      .from("event_overrides")
      .select("*")
      .or(
        `and(new_date.gte.${gridStartStr},new_date.lte.${gridEndStr}),and(original_date.gte.${gridStartStr},original_date.lte.${gridEndStr})`
      );

    if (error) {
      console.error("getOverrides failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getOverrides threw:", err);
    return [];
  }
}
