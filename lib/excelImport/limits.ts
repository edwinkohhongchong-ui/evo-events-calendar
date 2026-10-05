// Kept apart from readXlsx.ts (which pulls in jszip) so the browser can import the limits.
import { MAX_DOCX_BYTES } from "../schedules/limits";

/** Same 5 MB upload cap as the Word importer, so one upload route can serve both. */
export const MAX_XLSX_BYTES = MAX_DOCX_BYTES;
export const MAX_ENTRIES = 500;
/** Declared uncompressed size of ANY zip entry (zip-bomb guard). */
export const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
/** Tighter cap for the parts we actually read (workbook, rels, sharedStrings, each worksheet), declared and streamed. */
export const MAX_PART_XML_BYTES = 8 * 1024 * 1024;
/** All parts read in one workbook, so many big sheets cannot add up. */
export const MAX_TOTAL_XML_BYTES = 32 * 1024 * 1024;
export const MAX_SHEETS = 40;
export const MAX_CELLS_PER_SHEET = 100_000;
export const MAX_CELLS_TOTAL = 400_000;
export const MAX_SHARED_STRINGS = 100_000;
export const MAX_MERGES_PER_SHEET = 10_000;
/** Longer cell text is truncated (and the workbook flagged `truncated`), not rejected. */
export const MAX_STRING_LENGTH = 5000;
export const MAX_READ_MS = 4000;
export const MAX_XML_TOKENS = 4_000_000;
export const MAX_XML_DEPTH = 64;

/**
 * Rows one Apply call accepts. Equal to the Word importer's cap. A bigger selection is applied in
 * sequential calls of at most this many rows, and the client joins every call's `affected` rows
 * into ONE Undo record (see applyExcelImport).
 */
export const MAX_EXCEL_APPLY_ROWS = 300;
