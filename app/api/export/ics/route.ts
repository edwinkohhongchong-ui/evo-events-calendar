import { requireRoleRoute } from "@/lib/authRoute";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildIcsCalendar } from "@/lib/icsExport";
import { EventRow, ExceptionRow, OverrideRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// The whole calendar, every event — recurring series keep their real
// recurrence in the .ics (RRULE), not expanded into individual instances,
// so Apple/Google Calendar handle "repeats weekly" the same way this app
// does rather than importing hundreds of flat one-off entries.
export async function GET() {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const [eventsRes, overridesRes, exceptionsRes] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("event_overrides").select("*"),
    supabase.from("event_exceptions").select("*"),
  ]);

  if (eventsRes.error) {
    console.error(eventsRes.error);
    return NextResponse.json({ error: "Couldn't load the calendar. Please try again." }, { status: 500 });
  }

  const ics = buildIcsCalendar(
    (eventsRes.data ?? []) as EventRow[],
    (overridesRes.data ?? []) as OverrideRow[],
    (exceptionsRes.data ?? []) as ExceptionRow[]
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="evo-events-calendar.ics"',
    },
  });
}
