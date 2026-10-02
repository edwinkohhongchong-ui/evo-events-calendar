import { requireRoleRoute } from "@/lib/authRoute";
import { NextRequest, NextResponse } from "next/server";
import { getHolidaysForYear } from "@/lib/data";
import { classifyHoliday, isTentativeHoliday, suggestHolidayType } from "@/lib/calendarific";
import { fetchCalendarificYear } from "@/lib/calendarificApi";
import { HolidayDiffRow } from "@/lib/types";

export async function POST(request: NextRequest) {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const { year } = await request.json().catch(() => ({ year: null }));
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const result = await fetchCalendarificYear(year);
  if (!result.ok) {
    const error =
      result.cause === "no-key"
        ? "Server is not configured with a Calendarific API key."
        : result.cause === "rejected-key"
          ? "Couldn't fetch from Calendarific — the API key was rejected."
          : result.cause === "rate-limited"
            ? "Couldn't fetch from Calendarific — the daily rate limit was hit."
            : result.cause === "http"
              ? `Couldn't fetch from Calendarific — it returned HTTP ${result.status}.`
              : result.cause === "bad-response"
                ? "Calendarific's response didn't look like what we expected."
                : result.cause === "wrong-year"
                  ? "Calendarific returned holidays for a different year than requested."
                  : "Couldn't reach Calendarific. Check your network connection and try again.";
    return NextResponse.json({ ok: false, error }, { status: result.cause === "no-key" ? 500 : 502 });
  }

  const existing = await getHolidaysForYear(year);
  const existingByDate = new Map(existing.map((h) => [h.holiday_date, h]));

  const rows: HolidayDiffRow[] = [];
  for (const h of result.holidays) {
    const tentative = isTentativeHoliday(h.name, h.type);
    const { bucket, existingName } = classifyHoliday({ date: h.date, name: h.name }, existingByDate);

    rows.push({
      bucket,
      date: h.date,
      name: h.name,
      description: h.description,
      rawType: h.type,
      suggestedType: suggestHolidayType(h.type, tentative),
      isTentative: tentative,
      existingName,
    });
  }

  return NextResponse.json({ ok: true, year, totalFromApi: result.totalFromApi, rows });
}
