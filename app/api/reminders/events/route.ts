import { NextRequest, NextResponse } from "next/server";
import { getUpcomingEventsForReminders } from "@/lib/data";

export async function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required." }, { status: 400 });
  }

  const events = await getUpcomingEventsForReminders(start, end);
  return NextResponse.json({ events });
}
