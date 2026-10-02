// Production Next.js replaces the message of any error thrown from a Server
// Action with a generic "An error occurred in the Server Components render"
// block, so friendly messages must travel as a returned value instead.
// Actions keep throwing internally; runAction turns that into a result the
// client can show verbatim.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const GENERIC_ACTION_ERROR = "Something went wrong. Please try again.";

// Safety net, not a gate: actions throw plain hand-written Errors on purpose,
// so those pass through untouched. Only a message that looks like it came
// from Postgres/PostgREST/the driver is swapped for a generic one, so a stray
// `throw error` can never leak table/column names or SQL detail.
const DB_ERROR_PATTERNS: RegExp[] = [
  /violates/i,
  /duplicate key/i,
  /relation "/i,
  /column "/i,
  /\bPGRST\d*/i,
  /syntax error/i,
  /permission denied/i,
  /\bJWT\b/,
  /\bSQLSTATE\b/i,
  /\b(?:code|error)[:=\s]+"?[0-9A-Z]{5}"?(?![0-9A-Za-z])/,
];

export function looksLikeDatabaseError(message: string): boolean {
  return DB_ERROR_PATTERNS.some((re) => re.test(message));
}

export function safeActionMessage(err: unknown): string {
  if (!(err instanceof Error) || !err.message) return GENERIC_ACTION_ERROR;
  return looksLikeDatabaseError(err.message) ? GENERIC_ACTION_ERROR : err.message;
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    console.error(err);
    return {
      ok: false,
      error: safeActionMessage(err),
    };
  }
}

// Client-side helper: returns the data of a successful result, or throws an
// Error carrying the friendly message so an existing try/catch can show it.
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
