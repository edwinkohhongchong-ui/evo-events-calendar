import { requireRoleRoute } from "@/lib/authRoute";
import { NextResponse } from "next/server";
import { readAll } from "@/lib/readAll";
import { buildIcsCalendar } from "@/lib/icsExport";
import { EventRow, ExceptionRow, OverrideRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// The whole calendar, every event — recurring series keep their real
// recurrence in the .ics (RRULE), not expanded into individual instances,
// so Apple/Google Calendar handle "repeats weekly" the same way this app
// does rather than importing hundreds of flat one-off entries.
export async function GET() {
  const denied = await requireRoleRoute("viewer");
  if (denied) return denied;

  let eventsRows: EventRow[], overrideRows: OverrideRow[], exceptionRows: ExceptionRow[];
  try {
    [eventsRows, overrideRows, exceptionRows] = await Promise.all([
      readAll<EventRow>("events"),
      readAll<OverrideRow>("event_overrides"),
      readAll<ExceptionRow>("event_exceptions"),
    ]);
  } catch {
    // readAll already logged the driver detail; a partial calendar must never be served.
    return NextResponse.json({ error: "Couldn't load the calendar. Please try again." }, { status: 500 });
  }

  const ics = buildIcsCalendar(eventsRows, overrideRows, exceptionRows);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="evo-events-calendar.ics"',
    },
  });
}
