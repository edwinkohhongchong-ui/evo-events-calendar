import type { CalendarificHoliday } from "../../calendarificApi";

// A realistic Calendarific answer for Singapore 2026: public holidays plus the observances and
// seasons it also lists (which the check must ignore). Hand-written; no network.
const nat = (date: string, name: string, extra: string[] = []): CalendarificHoliday => ({
  date,
  name,
  description: `${name} in Singapore`,
  type: ["National holiday", ...extra],
});
const obs = (date: string, name: string): CalendarificHoliday => ({ date, name, description: name, type: ["Observance"] });

export const SG_2026: CalendarificHoliday[] = [
  nat("2026-01-01", "New Year's Day"),
  obs("2026-02-14", "Valentine's Day"),
  nat("2026-02-17", "Chinese New Year"),
  nat("2026-02-18", "Chinese New Year Holiday"),
  obs("2026-02-18", "Ash Wednesday"),
  nat("2026-03-21", "Hari Raya Puasa", ["Muslim"]),
  nat("2026-04-03", "Good Friday", ["Christian"]),
  nat("2026-05-01", "Labour Day"),
  nat("2026-05-27", "Hari Raya Haji", ["Muslim"]),
  nat("2026-05-31", "Vesak Day", ["Buddhist"]),
  nat("2026-06-01", "Vesak Day (Observed)"),
  nat("2026-08-09", "National Day"),
  nat("2026-08-10", "National Day (Observed)"),
  nat("2026-11-08", "Deepavali", ["Hinduism"]),
  nat("2026-11-09", "Deepavali (Observed)"),
  nat("2026-12-25", "Christmas Day", ["Christian"]),
  obs("2026-12-24", "Christmas Eve"),
];

// The 14 public-holiday rows the real 2026 education-schedules document plans.
export const DOC_HOLIDAYS_2026 = [
  { rowId: "h1", name: "New Year's Day", start: "2026-01-01" },
  { rowId: "h2", name: "Chinese New Year (Day 1)", start: "2026-02-17" },
  { rowId: "h3", name: "Chinese New Year (Day 2)", start: "2026-02-18" },
  { rowId: "h4", name: "Hari Raya Puasa", start: "2026-03-21" },
  { rowId: "h5", name: "Good Friday", start: "2026-04-03" },
  { rowId: "h6", name: "Labour Day", start: "2026-05-01" },
  { rowId: "h7", name: "Hari Raya Haji", start: "2026-05-27" },
  { rowId: "h8", name: "Vesak Day", start: "2026-05-31" },
  { rowId: "h9", name: "Vesak Day (In-Lieu)", start: "2026-06-01" },
  { rowId: "h10", name: "National Day", start: "2026-08-09" },
  { rowId: "h11", name: "National Day (In-Lieu)", start: "2026-08-10" },
  { rowId: "h12", name: "Deepavali", start: "2026-11-08" },
  { rowId: "h13", name: "Deepavali (In-Lieu)", start: "2026-11-09" },
  { rowId: "h14", name: "Christmas Day", start: "2026-12-25" },
];
