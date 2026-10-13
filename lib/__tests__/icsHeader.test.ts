import { describe, it, expect } from "vitest";
import { buildIcsCalendar } from "../icsExport";

describe("buildIcsCalendar header", () => {
  const ics = buildIcsCalendar([], [], []);

  it("names the calendar and hints at an hourly refresh", () => {
    expect(ics).toContain("X-WR-CALNAME:+EVO Events\r\n");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    expect(ics).toContain("X-PUBLISHED-TTL:PT1H\r\n");
  });

  it("is still a well-formed calendar", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
