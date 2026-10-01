// Production Next.js replaces the message of any error thrown from a Server
// Action with a generic "An error occurred in the Server Components render"
// block, so friendly messages must travel as a returned value instead.
// Actions keep throwing internally; runAction turns that into a result the
// client can show verbatim.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    console.error(err);
    return {
      ok: false,
      error: err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.",
    };
  }
}

// Client-side helper: returns the data of a successful result, or throws an
// Error carrying the friendly message so an existing try/catch can show it.
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
