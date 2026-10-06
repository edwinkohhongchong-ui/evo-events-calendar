// Explicit column allow-lists for Server Action writes. A Server Action
// argument is attacker-controllable JSON, so inserting/updating it wholesale
// would let a crafted call set id, created_at, updated_at or any other
// column. Each list below is typed `Record<keyof XFormValues, true>`, so
// adding a field to a form-values type without listing it here (or listing a
// key the type doesn't have) fails `tsc`. Pure and Supabase-free so it can be
// unit-tested.
import type { EventFormValues } from "./actions";
import type {
  ChecklistFormValues,
  HolidayFormValues,
  LevelFormValues,
  ReminderTemplateFormValues,
  SeasonFormValues,
} from "./types";

type Allow<T> = Record<keyof T, true>;

export const EVENT_COLUMNS: Allow<EventFormValues> = {
  name: true,
  event_date: true,
  end_date: true,
  event_time: true,
  end_time: true,
  duration_minutes: true,
  level: true,
  location: true,
  recurring: true,
  repeat_until: true,
  notes: true,
  event_type: true,
  pastoral_youth: true,
  pastoral_poly: true,
  pastoral_uni: true,
  pastoral_adults: true,
  gathering_type: true,
  series: true,
  preacher_name: true,
  sermon_title: true,
  theme: true,
  owner: true, // validated afterwards by withOwner (lib/owner.ts)
};

export const LEVEL_COLUMNS: Allow<LevelFormValues> = { name: true, color_key: true, sort_order: true };

export const SEASON_COLUMNS: Allow<SeasonFormValues> = {
  name: true,
  category: true,
  start_date: true,
  end_date: true,
  notes: true,
  color: true,
};

export const HOLIDAY_COLUMNS: Allow<HolidayFormValues> = { holiday_date: true, name: true, type: true, details: true };

export const REMINDER_TEMPLATE_COLUMNS: Allow<ReminderTemplateFormValues> = {
  name: true,
  default_message: true,
  default_telegram_handle: true,
  include_event_summary: true,
  lookahead_days: true,
};

export const CHECKLIST_COLUMNS: Allow<ChecklistFormValues> = {
  category: true,
  item: true,
  status: true,
  target_month: true,
  notes: true,
  linked_event_id: true,
  auto_check_type: true,
};

// Copies only the allow-listed keys that are present (and not undefined) on
// `input`, so an update that omits a field leaves that column alone, exactly
// as passing the raw object did.
function pick<T extends object>(allow: Allow<T>, input: T): T {
  const out: Record<string, unknown> = {};
  const source = input as Record<string, unknown>;
  for (const key of Object.keys(allow)) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) out[key] = source[key];
  }
  return out as T;
}

export const pickEventColumns = (v: EventFormValues) => pick(EVENT_COLUMNS, v);
export const pickLevelColumns = (v: LevelFormValues) => pick(LEVEL_COLUMNS, v);
export const pickSeasonColumns = (v: SeasonFormValues) => pick(SEASON_COLUMNS, v);
export const pickHolidayColumns = (v: HolidayFormValues) => pick(HOLIDAY_COLUMNS, v);
export const pickReminderTemplateColumns = (v: ReminderTemplateFormValues) =>
  pick(REMINDER_TEMPLATE_COLUMNS, v);
export const pickChecklistColumns = (v: ChecklistFormValues) => pick(CHECKLIST_COLUMNS, v);
