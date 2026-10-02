import { describe, expect, it } from "vitest";
import type { EventFormValues } from "../actions";
import type {
  ChecklistFormValues,
  HolidayFormValues,
  LevelFormValues,
  ReminderTemplateFormValues,
  SeasonFormValues,
} from "../types";
import {
  CHECKLIST_COLUMNS,
  EVENT_COLUMNS,
  HOLIDAY_COLUMNS,
  LEVEL_COLUMNS,
  REMINDER_TEMPLATE_COLUMNS,
  SEASON_COLUMNS,
  pickChecklistColumns,
  pickEventColumns,
  pickHolidayColumns,
  pickLevelColumns,
  pickReminderTemplateColumns,
  pickSeasonColumns,
} from "../pickColumns";

// Each fixture is typed Required<...>, so tsc fails if a field is added to the
// form-values type and not listed here; the keys-equal check below then fails
// if it is not also in the allow-list.
const event: Required<EventFormValues> = {
  name: "n", event_date: "2026-01-01", end_date: "2026-01-02", event_time: "10:00:00", end_time: "11:00:00",
  duration_minutes: 60, level: "Youth", location: "Hall", recurring: "Weekly", repeat_until: "2026-06-01",
  notes: "x", event_type: "Gathering", pastoral_youth: true, pastoral_poly: false, pastoral_uni: true,
  pastoral_adults: false, gathering_type: "Gathering", series: "s", preacher_name: "p", sermon_title: "t",
  theme: "th", owner: "Sam",
};
const level: Required<LevelFormValues> = { name: "n", color_key: "#aabbcc", sort_order: 3 };
const season: Required<SeasonFormValues> = {
  name: "n", category: "Other", start_date: "2026-01-01", end_date: "2026-02-01", notes: "x", color: "#aabbcc",
};
const holiday: Required<HolidayFormValues> = { holiday_date: "2026-01-01", name: "n", type: "Custom" };
const reminder: Required<ReminderTemplateFormValues> = {
  name: "n", default_message: "m", default_telegram_handle: "@h", include_event_summary: true, lookahead_days: 7,
};
const checklist: Required<ChecklistFormValues> = {
  category: "c", item: "i", status: "Done", target_month: "Jan", notes: "n", linked_event_id: "e",
  auto_check_type: "school_holidays_present",
};

const junk = { id: "evil", created_at: "evil", updated_at: "evil", bogus: 1 };

const cases = [
  ["event", event, EVENT_COLUMNS, pickEventColumns],
  ["level", level, LEVEL_COLUMNS, pickLevelColumns],
  ["season", season, SEASON_COLUMNS, pickSeasonColumns],
  ["holiday", holiday, HOLIDAY_COLUMNS, pickHolidayColumns],
  ["reminder template", reminder, REMINDER_TEMPLATE_COLUMNS, pickReminderTemplateColumns],
  ["checklist", checklist, CHECKLIST_COLUMNS, pickChecklistColumns],
] as const;

describe.each(cases)("pick %s columns", (_name, fixture, allow, pick) => {
  it("allow-list covers exactly the form-values keys", () => {
    expect(Object.keys(allow).sort()).toEqual(Object.keys(fixture).sort());
  });

  it("keeps every field", () => {
    expect(pick(fixture as never)).toEqual(fixture);
  });

  it("drops id, created_at, updated_at and unknown keys", () => {
    const out = pick({ ...fixture, ...junk } as never) as unknown as Record<string, unknown>;
    expect(out).toEqual(fixture);
    for (const k of Object.keys(junk)) expect(k in out).toBe(false);
  });
});

describe("pickEventColumns partial input", () => {
  it("does not invent keys that were not sent (owner stays absent)", () => {
    const rest: Partial<EventFormValues> = { ...event };
    delete rest.owner;
    expect("owner" in pickEventColumns(rest as EventFormValues)).toBe(false);
  });
});
