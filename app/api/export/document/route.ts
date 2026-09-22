import { NextRequest, NextResponse } from "next/server";
import { getCalendarData } from "@/lib/data";
import { expandEvents } from "@/lib/recurrence";
import { applyOverrides } from "@/lib/overrides";
import { parseDateStr } from "@/lib/dates";
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
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body || !body.startDate || !body.endDate || (body.format !== "pdf" && body.format !== "docx")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { format, startDate, endDate, levels } = body;

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
}
