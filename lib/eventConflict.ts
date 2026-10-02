// Optimistic-lock conflict for event edits. Lives outside lib/actions.ts
// ("use server" files may only export async functions) so the server and the
// modal share one message, and the modal can recognise it in the ActionResult.
export const EVENT_CONFLICT_MESSAGE =
  "Someone else changed this event while you were editing. Reload to see their changes.";

export function isEventConflict(message: string | null | undefined): boolean {
  return message === EVENT_CONFLICT_MESSAGE;
}

// Drag/resize/retime lock tokens. A non-recurring drag rewrites the events
// row (bumping updated_at), so the NEXT drag of the same event, started before
// the post-write refresh delivers the new row, must use the token the first
// write returned or it would conflict with itself. `fresh` holds those
// just-returned tokens; callers clear it once a refresh has landed.
export function eventLockToken(
  event: { id: string; updated_at?: string },
  fresh: ReadonlyMap<string, string>
): string | undefined {
  return fresh.get(event.id) ?? event.updated_at;
}

export function rememberEventToken(
  fresh: Map<string, string>,
  eventId: string,
  affected: ReadonlyArray<{ table: string; id: string; after: { updated_at?: unknown } | null }>
): string | undefined {
  const next = affected.find((a) => a.table === "events" && a.id === eventId)?.after?.updated_at;
  if (typeof next !== "string") return undefined;
  fresh.set(eventId, next);
  return next;
}
