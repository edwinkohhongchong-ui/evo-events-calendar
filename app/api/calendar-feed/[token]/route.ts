import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildIcsCalendar } from "@/lib/icsExport";
import { EventRow, ExceptionRow, OverrideRow } from "@/lib/types";
import { describeFeedMismatch, normaliseFeedToken } from "@/lib/feedToken";

export const dynamic = "force-dynamic";

// Live "subscribe" feed for Apple/Google Calendar to auto-refresh from,
// as opposed to the one-time authenticated download at /api/export/ics.
// A calendar app can't hold the passcode cookie, so this route is excluded
// from middleware auth entirely (see middleware.ts matcher) and instead
// gates access on a long random token baked into the URL path itself —
// e.g. https://<domain>/api/calendar-feed/<64-char-hex-token>.ics
//
// The [token] segment includes the trailing ".ics" (it's just part of the
// path), so it's stripped before comparing against CALENDAR_FEED_TOKEN.
function timingSafeTokenMatch(candidate: string, expected: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  const expectedBuf = Buffer.from(expected);
  if (candidateBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, expectedBuf);
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const expectedToken = normaliseFeedToken(process.env.CALENDAR_FEED_TOKEN);
  const suppliedToken = normaliseFeedToken(params.token.endsWith(".ics") ? params.token.slice(0, -4) : params.token);

  // 404 (not 403) on any mismatch — a 403 would confirm the route pattern
  // exists at all to someone probing for it.
  if (!expectedToken || !timingSafeTokenMatch(suppliedToken, expectedToken)) {
    console.error(`calendar feed refused: ${describeFeedMismatch(expectedToken, suppliedToken)}.`);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
    },
  });
}
