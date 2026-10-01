import { supabase } from "./supabase";
import {
  ChecklistRow,
  ChecklistTemplateItemRow,
  ChecklistTemplateRow,
  ChecklistTemplateWithItems,
  DayNoteRow,
  EventOption,
  EventRow,
  ExceptionRow,
  HolidayRow,
  LevelRow,
  NoteCommentRow,
  ReminderTemplateRow,
  SeasonRow,
  SeasonSourceDateRow,
  OverrideRow,
} from "./types";
import { expandEvents } from "./recurrence";
import { applyOverrides } from "./overrides";
import { parseDateStr } from "./dates";

export interface CalendarData {
  events: EventRow[];
  holidays: HolidayRow[];
  seasons: SeasonRow[];
  overrides: OverrideRow[];
  levels: LevelRow[];
  exceptions: ExceptionRow[];
  dayNotes: DayNoteRow[];
}

// Fetches everything needed to render the grid for [gridStart, gridEnd]
// (inclusive, "yyyy-MM-dd" strings). Never throws — on any query failure we
// log server-side and fall back to an empty list so the grid still renders.
export async function getCalendarData(
  gridStartStr: string,
  gridEndStr: string
): Promise<CalendarData> {
  const [events, holidays, seasons, overrides, levels, exceptions, dayNotes] = await Promise.all([
    getEvents(gridStartStr, gridEndStr),
    getHolidays(gridStartStr, gridEndStr),
    getSeasons(gridStartStr, gridEndStr),
    getOverrides(gridStartStr, gridEndStr),
    getAllLevels(),
    getExceptions(gridStartStr, gridEndStr),
    getDayNotes(gridStartStr, gridEndStr),
  ]);

  return { events, holidays, seasons, overrides, levels, exceptions, dayNotes };
}

// The day page only renders events, so it skips the holidays, seasons and day
// notes that getCalendarData also loads.
export async function getDayViewData(dateStr: string) {
  const [events, overrides, levels, exceptions] = await Promise.all([
    getEvents(dateStr, dateStr),
    getOverrides(dateStr, dateStr),
    getAllLevels(),
    getExceptions(dateStr, dateStr),
  ]);
  return { events, overrides, levels, exceptions };
}

// Events staff must not forget to prep collateral/to-dos for — Churchwide
// carries the same weight for plain "Event" entries as it does for
// Gatherings, so both are checked here rather than just gathering_type.
const FLAGGED_GATHERING_TYPES = new Set(["YTH Gathering", "+EVO YTH Big Day", "Easter/XMAS"]);

function isFlaggedForReminders(event: EventRow): boolean {
  if (event.level === "Churchwide") return true;
  return !!event.gathering_type && FLAGGED_GATHERING_TYPES.has(event.gathering_type);
}

export interface ReminderPickerEvent {
  occurrenceKey: string;
  eventId: string;
  name: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  flagged: boolean;
}

// Upcoming events in [startStr, endStr] for the Reminders page's event
// picker — same recurrence expansion + override application as the
// calendar grid, so this never lists something the calendar wouldn't.
// "flagged" (Churchwide, or a Gathering Type that always needs prep
// collateral) just pre-checks the box in the picker; it's a message-drafting
// convenience only, deliberately independent of the real Checklist tab/table
// (checklist_templates apply text straight into the drafted message, see
// RemindersForm.tsx, not real `checklist` rows).
export async function getUpcomingEventsForReminders(
  startStr: string,
  endStr: string
): Promise<ReminderPickerEvent[]> {
  const [events, overrides, exceptions] = await Promise.all([
    getEvents(startStr, endStr),
    getOverrides(startStr, endStr),
    getExceptions(startStr, endStr),
  ]);

  const eventsById = new Map(events.map((e) => [e.id, e]));
  const exceptionsByEventId = new Map<string, Set<string>>();
  for (const exception of exceptions) {
    const set = exceptionsByEventId.get(exception.event_id) ?? new Set<string>();
    set.add(exception.original_date);
    exceptionsByEventId.set(exception.event_id, set);
  }

  const rawOccurrences = expandEvents(events, parseDateStr(startStr), parseDateStr(endStr), exceptionsByEventId);
  const occurrences = applyOverrides(rawOccurrences, overrides, eventsById, startStr, endStr);
  occurrences.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));

  return occurrences.map((occ) => ({
    occurrenceKey: `${occ.event.id}::${occ.occurrenceDate}`,
    eventId: occ.event.id,
    name: occ.event.name,
    date: occ.occurrenceDate,
    startTime: occ.startTime,
    endTime: occ.endTime,
    location: occ.event.location,
    flagged: isFlaggedForReminders(occ.event),
  }));
}

async function getDayNotes(gridStartStr: string, gridEndStr: string): Promise<DayNoteRow[]> {
  try {
    const { data, error } = await supabase
      .from("day_notes")
      .select("*")
      .gte("note_date", gridStartStr)
      .lte("note_date", gridEndStr)
      .order("created_at");

    if (error) {
      console.error("getDayNotes failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getDayNotes threw:", err);
    return [];
  }
}

async function getEvents(gridStartStr: string, gridEndStr: string): Promise<EventRow[]> {
  try {
    const [oneOff, recurring] = await Promise.all([
      // Overlap check, not just "does the start date fall in range" — a
      // multi-day event that started before gridStart can still be ongoing
      // when the grid begins. end_date is null for single-day events, so
      // the null branch falls back to event_date as its own end.
      supabase
        .from("events")
        .select("*")
        .eq("recurring", "None")
        .lte("event_date", gridEndStr)
        .or(`end_date.gte.${gridStartStr},and(end_date.is.null,event_date.gte.${gridStartStr})`),
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

// All entered institution dates for one year — backs the Seasons
// "Update Calendar" (current year) and "Start a New Year" (next year) forms.
// See migration 021 / lib/examScheduleSources.ts.
export async function getSeasonSourceDates(year: number): Promise<SeasonSourceDateRow[]> {
  try {
    const { data, error } = await supabase
      .from("season_source_dates")
      .select("*")
      .eq("year", year);
    if (error) {
      console.error("getSeasonSourceDates failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getSeasonSourceDates threw:", err);
    return [];
  }
}

// Finds the most recent year with ANY entered data before `beforeYear` and
// returns all its rows — used to prefill "Start a New Year"'s per-
// institution inputs from whatever year was last actually entered, which
// isn't necessarily beforeYear - 1 (a year could have been skipped).
export async function getLatestSeasonSourceDatesBefore(
  beforeYear: number
): Promise<SeasonSourceDateRow[]> {
  try {
    const { data: yearRow, error: yearError } = await supabase
      .from("season_source_dates")
      .select("year")
      .lt("year", beforeYear)
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (yearError) {
      console.error("getLatestSeasonSourceDatesBefore failed:", yearError.message);
      return [];
    }
    if (!yearRow) return [];
    return getSeasonSourceDates(yearRow.year);
  } catch (err) {
    console.error("getLatestSeasonSourceDatesBefore threw:", err);
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
export async function getAllReminderTemplates(): Promise<ReminderTemplateRow[]> {
  try {
    const { data, error } = await supabase.from("reminder_templates").select("*").order("name");
    if (error) {
      console.error("getAllReminderTemplates failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllReminderTemplates threw:", err);
    return [];
  }
}

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

export async function getAllChecklistTemplates(): Promise<ChecklistTemplateWithItems[]> {
  try {
    const [{ data: templates, error: templatesError }, { data: items, error: itemsError }] = await Promise.all([
      supabase.from("checklist_templates").select("*").order("name"),
      supabase.from("checklist_template_items").select("*").order("sort_order"),
    ]);
    if (templatesError) {
      console.error("getAllChecklistTemplates (templates) failed:", templatesError.message);
      return [];
    }
    if (itemsError) {
      console.error("getAllChecklistTemplates (items) failed:", itemsError.message);
      return [];
    }

    const itemsByTemplate = new Map<string, { id: string; item: string; repeat_count: number }[]>();
    for (const item of items ?? []) {
      const list = itemsByTemplate.get(item.template_id) ?? [];
      list.push({ id: item.id, item: item.item, repeat_count: item.repeat_count });
      itemsByTemplate.set(item.template_id, list);
    }

    return (templates ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      items: itemsByTemplate.get(t.id) ?? [],
    }));
  } catch (err) {
    console.error("getAllChecklistTemplates threw:", err);
    return [];
  }
}

// Slim event list for the checklist's "Link to event" picker.
export async function getEventOptions(): Promise<EventOption[]> {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("id, name, event_date")
      .order("event_date");
    if (error) {
      console.error("getEventOptions failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getEventOptions threw:", err);
    return [];
  }
}

// Newest first — a log reads most-recent-on-top. See migration 011.
export async function getGeneralComments(): Promise<NoteCommentRow[]> {
  try {
    const { data, error } = await supabase
      .from("note_comments")
      .select("*")
      .eq("scope", "general")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("getGeneralComments failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getGeneralComments threw:", err);
    return [];
  }
}

export async function getMonthComments(year: number, month: number): Promise<NoteCommentRow[]> {
  try {
    const { data, error } = await supabase
      .from("note_comments")
      .select("*")
      .eq("scope", "month")
      .eq("year", year)
      .eq("month", month)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("getMonthComments failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getMonthComments threw:", err);
    return [];
  }
}

// ---------- Full-table fetchers for the Backup page (app/admin/backup) ----------
// Read-only, whole-table dumps — deliberately separate from the scoped/
// windowed fetchers above (getEvents, getOverrides, getExceptions, etc.),
// which only ever return the slice needed to render a given month/range.
// month_focus and general_notes have no dedicated row types elsewhere in the
// app (their UI-facing concepts were retired — see migration 011's comment),
// so minimal local shapes are declared here just for the backup dump.

interface MonthFocusRow {
  id: string;
  year: number;
  month: number;
  series_focus: string | null;
  key_theme: string | null;
  notes: string | null;
}

interface GeneralNoteRow {
  id: string;
  content: string | null;
  updated_at: string;
}

export async function getAllEventsRaw(): Promise<EventRow[]> {
  try {
    const { data, error } = await supabase.from("events").select("*").order("event_date");
    if (error) {
      console.error("getAllEventsRaw failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllEventsRaw threw:", err);
    return [];
  }
}

export async function getAllEventOverrides(): Promise<OverrideRow[]> {
  try {
    const { data, error } = await supabase.from("event_overrides").select("*");
    if (error) {
      console.error("getAllEventOverrides failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllEventOverrides threw:", err);
    return [];
  }
}

export async function getAllEventExceptions(): Promise<ExceptionRow[]> {
  try {
    const { data, error } = await supabase.from("event_exceptions").select("*");
    if (error) {
      console.error("getAllEventExceptions failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllEventExceptions threw:", err);
    return [];
  }
}

export async function getAllMonthFocus(): Promise<MonthFocusRow[]> {
  try {
    const { data, error } = await supabase.from("month_focus").select("*").order("year").order("month");
    if (error) {
      console.error("getAllMonthFocus failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllMonthFocus threw:", err);
    return [];
  }
}

export async function getAllGeneralNotes(): Promise<GeneralNoteRow[]> {
  try {
    const { data, error } = await supabase.from("general_notes").select("*");
    if (error) {
      console.error("getAllGeneralNotes failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllGeneralNotes threw:", err);
    return [];
  }
}

export async function getAllNoteComments(): Promise<NoteCommentRow[]> {
  try {
    const { data, error } = await supabase.from("note_comments").select("*").order("created_at");
    if (error) {
      console.error("getAllNoteComments failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllNoteComments threw:", err);
    return [];
  }
}

export async function getAllDayNotes(): Promise<DayNoteRow[]> {
  try {
    const { data, error } = await supabase.from("day_notes").select("*").order("note_date");
    if (error) {
      console.error("getAllDayNotes failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllDayNotes threw:", err);
    return [];
  }
}

export async function getAllChecklistTemplatesRaw(): Promise<ChecklistTemplateRow[]> {
  try {
    const { data, error } = await supabase.from("checklist_templates").select("*").order("name");
    if (error) {
      console.error("getAllChecklistTemplatesRaw failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllChecklistTemplatesRaw threw:", err);
    return [];
  }
}

export async function getAllChecklistTemplateItemsRaw(): Promise<ChecklistTemplateItemRow[]> {
  try {
    const { data, error } = await supabase
      .from("checklist_template_items")
      .select("*")
      .order("sort_order");
    if (error) {
      console.error("getAllChecklistTemplateItemsRaw failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("getAllChecklistTemplateItemsRaw threw:", err);
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
