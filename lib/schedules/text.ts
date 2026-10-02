// Text hygiene for anything that came out of a Word document or the browser.
// Control characters, zero-width characters and bidi overrides can hide or
// reorder text in the calendar, so they are removed at every trust boundary
// (document reading, parse output, Apply validation, copy-to-clipboard).

// C0 controls + DEL, zero-width / direction marks (U+200B-200F), bidi embeddings
// and overrides (U+202A-202E), bidi isolates (U+2066-2069), word joiner, BOM.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f​-‏‪-‮⁠⁦-⁩﻿]/g;
// The same set without \n, for multi-line notes.
const UNSAFE_CHARS_KEEP_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁠⁦-⁩﻿]/g;

/** One-line text (names, labels): whitespace controls become spaces, other unsafe characters are dropped. */
export function cleanText(s: string): string {
  return s
    .replace(/[\t\n\r]+/g, " ")
    .replace(UNSAFE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Notes may span lines (see mergeNotes): newlines are kept, CRLF is normalised, other unsafe characters are dropped. */
export function cleanNotes(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(UNSAFE_CHARS_KEEP_NEWLINE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Notes after an import update. Hand-written notes are never replaced: the
 * document's note is appended on a new line, unless the existing note already
 * contains it (so importing the same document twice changes nothing).
 */
export function mergeNotes(existing: string | null | undefined, planned: string): string {
  const e = (existing ?? "").trim();
  const p = planned.trim();
  if (!p) return e;
  if (!e) return p;
  return e.includes(p) ? e : `${e}\n${p}`;
}
