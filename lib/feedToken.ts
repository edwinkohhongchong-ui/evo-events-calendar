// The calendar-feed token is pasted into a Vercel setting by hand, where a
// trailing newline/space or surrounding quotes are easy to save by accident
// and make every link fail as "Not found". Normalise before comparing.
export function normaliseFeedToken(raw: string | undefined | null): string {
  let t = (raw ?? "").trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' || first === "'") && first === last) t = t.slice(1, -1).trim();
  }
  return t;
}

// Why a feed request was refused, for the server log. Lengths only: never the
// token itself.
export function describeFeedMismatch(expected: string, supplied: string): string {
  if (!expected) return "CALENDAR_FEED_TOKEN is not set on this deployment";
  if (expected.length !== supplied.length) {
    return `token length differs (setting has ${expected.length} characters, link has ${supplied.length})`;
  }
  return "token has the right length but different characters";
}
