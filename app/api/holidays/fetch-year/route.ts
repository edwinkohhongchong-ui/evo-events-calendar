import { requireRoleRoute } from "@/lib/authRoute";
import { NextRequest, NextResponse } from "next/server";
import { getHolidaysForYear } from "@/lib/data";
import { classifyHoliday, isTentativeHoliday, suggestHolidayType } from "@/lib/calendarific";
import { HolidayDiffRow } from "@/lib/types";

// Raw shape we actually read from Calendarific — deliberately loose (all
// paths validated below) rather than a full schema, since we only pull a
// handful of fields and validate each one before using it.
interface CalendarificRawHoliday {
  name?: unknown;
  description?: unknown;
  date?: { iso?: unknown; datetime?: { year?: unknown } };
  type?: unknown;
}

export async function POST(request: NextRequest) {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const { year } = await request.json().catch(() => ({ year: null }));
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const apiKey = process.env.CALENDARIFIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Server is not configured with a Calendarific API key." },
      { status: 500 }
    );
  }

  let json: unknown;
  try {
    const res = await fetch(
      `https://calendarific.com/api/v2/holidays?api_key=${apiKey}&country=SG&year=${year}`
    );
    if (!res.ok) {
      const reason =
        res.status === 401
          ? "the API key was rejected"
          : res.status === 429
            ? "the daily rate limit was hit"
            : `it returned HTTP ${res.status}`;
      return NextResponse.json(
        { ok: false, error: `Couldn't fetch from Calendarific — ${reason}.` },
        { status: 502 }
      );
    }
    json = await res.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Couldn't reach Calendarific. Check your network connection and try again." },
      { status: 502 }
    );
  }

  const holidaysRaw = (json as { response?: { holidays?: unknown } })?.response?.holidays;
  if (!Array.isArray(holidaysRaw)) {
    return NextResponse.json(
      { ok: false, error: "Calendarific's response didn't look like what we expected." },
      { status: 502 }
    );
  }

  const mismatchedYear = (holidaysRaw as CalendarificRawHoliday[]).some(
    (h) =>
      typeof h?.date?.datetime?.year === "number" && h.date.datetime.year !== year
  );
  if (mismatchedYear) {
    return NextResponse.json(
      { ok: false, error: "Calendarific returned holidays for a different year than requested." },
      { status: 502 }
    );
  }

  const existing = await getHolidaysForYear(year);
  const existingByDate = new Map(existing.map((h) => [h.holiday_date, h]));

  const rows: HolidayDiffRow[] = [];
  for (const h of holidaysRaw as CalendarificRawHoliday[]) {
    const date = h?.date?.iso;
    const name = h?.name;
    if (typeof date !== "string" || typeof name !== "string") continue; // skip malformed entries individually

    const rawType = Array.isArray(h.type) ? h.type.filter((t): t is string => typeof t === "string") : [];
    const description = typeof h.description === "string" ? h.description : "";
    const tentative = isTentativeHoliday(name, rawType);
    const { bucket, existingName } = classifyHoliday({ date, name }, existingByDate);

    rows.push({
      bucket,
      date,
      name,
      description,
      rawType,
      suggestedType: suggestHolidayType(rawType, tentative),
      isTentative: tentative,
      existingName,
    });
  }

  return NextResponse.json({ ok: true, year, totalFromApi: holidaysRaw.length, rows });
}
