import { supabase } from "./supabase";
import { EventRow, HolidayRow, SeasonRow, OverrideRow } from "./types";

export interface CalendarData {
  events: EventRow[];
  holidays: HolidayRow[];
  seasons: SeasonRow[];
  overrides: OverrideRow[];
}

// Fetches everything needed to render the grid for [gridStart, gridEnd]
// (inclusive, "yyyy-MM-dd" strings). Never throws — on any query failure we
// log server-side and fall back to an empty list so the grid still renders.
export async function getCalendarData(
  gridStartStr: string,
  gridEndStr: string
): Promise<CalendarData> {
  const [events, holidays, seasons, overrides] = await Promise.all([
    getEvents(gridStartStr, gridEndStr),
    getHolidays(gridStartStr, gridEndStr),
    getSeasons(gridStartStr, gridEndStr),
    getOverrides(gridStartStr, gridEndStr),
  ]);

  return { events, holidays, seasons, overrides };
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
