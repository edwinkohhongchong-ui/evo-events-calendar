// Pure clock-arithmetic helpers for the Start/End/Duration derivation.
// event_time and end_time are plain "time" columns with no date component —
// consistent with the rest of this app, there is no day-crossing logic here.
// Arithmetic wraps within a 24-hour clock: an end time numerically earlier
// than its start time just means it wrapped past midnight (see endsNextDay),
// not that it fell on some other date.

export function timeStrToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTimeStr(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeEndTime(startTime: string, durationMinutes: number): string {
  return minutesToTimeStr(timeStrToMinutes(startTime) + durationMinutes);
}

export function computeDuration(startTime: string, endTime: string): number {
  const diff = timeStrToMinutes(endTime) - timeStrToMinutes(startTime);
  return ((diff % 1440) + 1440) % 1440;
}

// True when endTime is numerically earlier than startTime — i.e. the
// start/duration/end combination wraps past midnight.
export function endsNextDay(startTime: string, endTime: string): boolean {
  return timeStrToMinutes(endTime) < timeStrToMinutes(startTime);
}
