// Cost cap for the Export document route: Viewers can trigger it, so a wide
// range of heavily recurring events must not turn into a huge PDF/DOCX.
export const MAX_EXPORT_OCCURRENCES = 2000;

export const EXPORT_TOO_MANY_EVENTS_MESSAGE =
  "That range has too many events to export at once. Choose a shorter date range.";

export function exceedsExportOccurrenceCap(count: number): boolean {
  return count > MAX_EXPORT_OCCURRENCES;
}
