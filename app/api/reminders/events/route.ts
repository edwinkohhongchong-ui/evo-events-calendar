import { requireRoleRoute } from "@/lib/authRoute";
import { NextRequest, NextResponse } from "next/server";
import { getUpcomingEventsForReminders } from "@/lib/data";
import { isValidDateStr, parseDateStr } from "@/lib/dates";

const MAX_RANGE_DAYS = 366;

export async function GET(request: NextRequest) {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required." }, { status: 400 });
  }

  if (!isValidDateStr(start) || !isValidDateStr(end)) {
    return NextResponse.json({ error: "start and end must be valid yyyy-MM-dd dates." }, { status: 400 });
  }
  const spanDays = (parseDateStr(end).getTime() - parseDateStr(start).getTime()) / 86_400_000;
  if (spanDays < 0 || spanDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "Date range is too large or reversed." }, { status: 400 });
  }

  const events = await getUpcomingEventsForReminders(start, end);
  return NextResponse.json({ events });
}
