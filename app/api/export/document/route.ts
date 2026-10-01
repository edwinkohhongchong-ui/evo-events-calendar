import { requireRoleRoute } from "@/lib/authRoute";
import { NextRequest, NextResponse } from "next/server";
import { getCalendarData } from "@/lib/data";
import { expandEvents } from "@/lib/recurrence";
import { applyOverrides } from "@/lib/overrides";
import { isValidDateStr, parseDateStr } from "@/lib/dates";

const MAX_EXPORT_YEARS = 5;
import { renderEventLineupPdf } from "@/lib/pdfExport";
import { renderEventLineupDocx } from "@/lib/docxExport";

export const dynamic = "force-dynamic";

interface RequestBody {
  format: "pdf" | "docx";
  startDate: string;
  endDate: string;
  levels: string[]; // empty array = all categories
}

export async function POST(request: NextRequest) {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body || !body.startDate || !body.endDate || (body.format !== "pdf" && body.format !== "docx")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { format, startDate, endDate, levels } = body;

  // Guard against a date-shaped but calendrically invalid string (e.g.
  // "2026-09-31" — September has only 30 days). parseDateStr (date-fns
  // parseISO) returns an Invalid Date for these rather than throwing, and
  // that Invalid Date previously propagated all the way into
  // formatDateDisplay (lib/dates.ts), where date-fns' format() throws
  // "RangeError: Invalid time value" — an unhandled exception that Next
  // turns into a bare 500 with no JSON body, which ExportForm.tsx then
  // surfaces as the generic "Something went wrong generating the document."
  // Catching it here, before any recurrence expansion or rendering work,
  // turns that crash into a clean, specific 400.
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  // Cap the range so a crafted request can't make the server expand years of
  // recurring events into a huge PDF/DOCX.
  const spanDays = (parseDateStr(endDate).getTime() - parseDateStr(startDate).getTime()) / 86_400_000;
  if (spanDays < 0 || spanDays > MAX_EXPORT_YEARS * 366) {
    return NextResponse.json({ error: "Date range must be between 0 and 5 years." }, { status: 400 });
  }

  // Everything below can throw for reasons that have nothing to do with the
  // date-range validation above (a rendering failure inside react-pdf/docx,
  // an unexpected data shape, etc). Without this try/catch, an exception
  // here becomes an unhandled crash that Next turns into a bare 500 with no
  // JSON body — ExportForm.tsx can't parse that as JSON, so it falls back to
  // its generic "Something went wrong generating the document." banner with
  // no way to tell what actually failed. Catch it, log the real error
  // server-side (never sent to the client — see the Server Action error-leak
  // fix in v1.44), and return a proper JSON 500 so this failure mode is at
  // least diagnosable next time instead of silently reproducing the same
  // dead end.
  try {
    const { events, overrides, exceptions } = await getCalendarData(startDate, endDate);
    const eventsById = new Map(events.map((e) => [e.id, e]));
    const exceptionsByEventId = new Map<string, Set<string>>();
    for (const exception of exceptions) {
      const set = exceptionsByEventId.get(exception.event_id) ?? new Set<string>();
      set.add(exception.original_date);
      exceptionsByEventId.set(exception.event_id, set);
    }

    const rawOccurrences = expandEvents(events, parseDateStr(startDate), parseDateStr(endDate), exceptionsByEventId);
    let occurrences = applyOverrides(rawOccurrences, overrides, eventsById, startDate, endDate);

    if (levels.length > 0) {
      occurrences = occurrences.filter((occ) => levels.includes(occ.event.level));
    }
    occurrences.sort(
      (a, b) =>
        a.occurrenceDate.localeCompare(b.occurrenceDate) || (a.startTime ?? "").localeCompare(b.startTime ?? "")
    );

    const range = { startDate, endDate };

    if (format === "pdf") {
      const buffer = await renderEventLineupPdf(occurrences, range);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="evo-event-lineup.pdf"',
        },
      });
    }

    const buffer = await renderEventLineupDocx(occurrences, range);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="evo-event-lineup.docx"',
      },
    });
  } catch (err) {
    console.error("Export document generation failed:", err);
    return NextResponse.json({ error: "Something went wrong generating the document." }, { status: 500 });
  }
}
