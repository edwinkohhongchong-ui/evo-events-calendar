// Optimistic-lock conflict for event edits. Lives outside lib/actions.ts
// ("use server" files may only export async functions) so the server and the
// modal share one message, and the modal can recognise it in the ActionResult.
export const EVENT_CONFLICT_MESSAGE =
  "Someone else changed this event while you were editing. Reload to see their changes.";

export function isEventConflict(message: string | null | undefined): boolean {
  return message === EVENT_CONFLICT_MESSAGE;
}
