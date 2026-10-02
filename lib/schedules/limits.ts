// Kept apart from readDocx.ts (which pulls in jszip) so the browser can import the limits.
export const MAX_DOCX_BYTES = 5 * 1024 * 1024;

/** Rows one document may produce (holidays + seasons). Equal to the Apply cap, so any selection can be applied in one go. */
export const MAX_PLAN_ROWS = 300;
/** A holiday range longer than this is almost certainly a mis-read date, not a real run of public holidays. */
export const MAX_HOLIDAY_DAYS_PER_RANGE = 40;
/** Paragraphs read from one document (the real one has about 150). */
export const MAX_DOC_LINES = 5000;

/** An error whose message is safe to show to the user as-is. */
export class ImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportLimitError";
  }
}
