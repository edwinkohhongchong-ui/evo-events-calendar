// Server-side Calendarific lookup (reads CALENDARIFIC_API_KEY, so never import this from a
// client component). Shared by "Start a New Year" (app/api/holidays/fetch-year) and the
// schedule-import holiday cross-check. The helpers that classify what comes back live in
// ./calendarific.ts.

const COUNTRY = "SG";

export interface CalendarificHoliday {
  /** yyyy-MM-dd */
  date: string;
  name: string;
  description: string;
  /** Calendarific's own classification strings, e.g. "National holiday", "Muslim". */
  type: string[];
}

/** Coarse reason, safe to branch on in UI code. */
export type CalendarificFailureReason = "no-key" | "rate-limited" | "unavailable";

/** Finer cause; lets Start-a-New-Year keep its more specific wording. */
export type CalendarificCause =
  | "no-key"
  | "rejected-key"
  | "rate-limited"
  | "http"
  | "network"
  | "timeout"
  | "bad-response"
  | "wrong-year";

export interface CalendarificFailure {
  ok: false;
  reason: CalendarificFailureReason;
  cause: CalendarificCause;
  /** Hand-written, no raw error text and never the key. Reads as "Holiday check unavailable: <message>". */
  message: string;
  /** The HTTP status, when the cause is "http". */
  status?: number;
}

export type CalendarificResult =
  | { ok: true; year: number; holidays: CalendarificHoliday[]; totalFromApi: number }
  | CalendarificFailure;

const fail = (reason: CalendarificFailureReason, cause: CalendarificCause, message: string, status?: number): CalendarificFailure => ({
  ok: false,
  reason,
  cause,
  message,
  ...(status !== undefined ? { status } : {}),
});

// Raw shape we actually read: deliberately loose, every path validated before use.
interface RawHoliday {
  name?: unknown;
  description?: unknown;
  date?: { iso?: unknown; datetime?: { year?: unknown } };
  type?: unknown;
}

/** Fetches every holiday Calendarific lists for Singapore in `year`. Never throws. */
export async function fetchCalendarificYear(year: number, opts: { timeoutMs?: number } = {}): Promise<CalendarificResult> {
  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) return fail("no-key", "no-key", "no Calendarific key is set up on this server");

  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : null;
  let json: unknown;
  try {
    const res = await fetch(`https://calendarific.com/api/v2/holidays?api_key=${apiKey}&country=${COUNTRY}&year=${year}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 401) return fail("unavailable", "rejected-key", "Calendarific did not accept the API key", res.status);
      if (res.status === 429) return fail("rate-limited", "rate-limited", "Calendarific's daily limit has been reached", res.status);
      return fail("unavailable", "http", "Calendarific returned an error", res.status);
    }
    json = await res.json();
  } catch {
    return controller.signal.aborted
      ? fail("unavailable", "timeout", "Calendarific took too long to answer")
      : fail("unavailable", "network", "Calendarific could not be reached");
  } finally {
    if (timer) clearTimeout(timer);
  }

  const raw = (json as { response?: { holidays?: unknown } } | null)?.response?.holidays;
  if (!Array.isArray(raw)) return fail("unavailable", "bad-response", "Calendarific's answer was not in the expected form");

  const list = raw as RawHoliday[];
  if (list.some((h) => typeof h?.date?.datetime?.year === "number" && h.date.datetime.year !== year)) {
    return fail("unavailable", "wrong-year", "Calendarific returned a different year than requested");
  }

  const holidays: CalendarificHoliday[] = [];
  for (const h of list) {
    const date = h?.date?.iso;
    const name = h?.name;
    if (typeof date !== "string" || typeof name !== "string") continue; // skip malformed entries individually
    holidays.push({
      date,
      name,
      description: typeof h.description === "string" ? h.description : "",
      type: Array.isArray(h.type) ? h.type.filter((t): t is string => typeof t === "string") : [],
    });
  }
  return { ok: true, year, holidays, totalFromApi: raw.length };
}

/** Public holidays only (drops observances, seasons and similar). */
export function nationalHolidays(list: CalendarificHoliday[]): CalendarificHoliday[] {
  return list.filter((h) => h.type.some((t) => /national/i.test(t)));
}

/** One lookup per year per loader: callers ask freely, the network is hit once. */
export function createCalendarificLoader(opts: { timeoutMs?: number } = {}): (year: number) => Promise<CalendarificResult> {
  const cache = new Map<number, Promise<CalendarificResult>>();
  return (year) => {
    let hit = cache.get(year);
    if (!hit) {
      hit = fetchCalendarificYear(year, opts);
      cache.set(year, hit);
    }
    return hit;
  };
}
