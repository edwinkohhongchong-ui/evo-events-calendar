// Paper sizes for printing. Chrome ignores the print dialog's paper choice when
// CSS @page fixes a size, so the app owns the choice: the Print Calendar toolbar
// picks the paper, an injected @page rule applies it, and PrintFit fits to it.

export const PAPER_IDS = ["a4", "a3", "a5", "letter", "legal", "tabloid"] as const;
export type PaperId = (typeof PAPER_IDS)[number];
export const ORIENTS = ["landscape", "portrait"] as const;
export type Orient = (typeof ORIENTS)[number];

export const DEFAULT_PAPER: PaperId = "a4";
export const DEFAULT_ORIENT: Orient = "landscape";

/** @page margin, mm. Keep in sync with every rule built by pageRule(). */
export const MARGIN_MM = 8;
export const MARGIN_PX = (MARGIN_MM * 96) / 25.4; // 30.24

interface PaperSpec {
  label: string;
  /** Landscape sheet in CSS px at 96dpi. */
  w: number;
  h: number;
  /** Portrait sheet in mm, written into @page explicitly (no keyword quirks). */
  mmW: number;
  mmH: number;
}

export const PAPERS: Record<PaperId, PaperSpec> = {
  a4: { label: "A4", w: 1123, h: 794, mmW: 210, mmH: 297 },
  a3: { label: "A3", w: 1587, h: 1123, mmW: 297, mmH: 420 },
  a5: { label: "A5", w: 794, h: 559, mmW: 148, mmH: 210 },
  letter: { label: "Letter", w: 1056, h: 816, mmW: 215.9, mmH: 279.4 },
  legal: { label: "Legal", w: 1344, h: 816, mmW: 215.9, mmH: 355.6 },
  tabloid: { label: "Tabloid", w: 1632, h: 1056, mmW: 279.4, mmH: 431.8 },
};

export function parsePaper(raw: unknown): PaperId | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && (PAPER_IDS as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as PaperId)
    : null;
}

export function parseOrient(raw: unknown): Orient | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && (ORIENTS as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as Orient)
    : null;
}

/** Whole sheet in CSS px for the orientation. */
export function sheetSize(paper: PaperId, orient: Orient): { w: number; h: number } {
  const { w, h } = PAPERS[paper];
  return orient === "landscape" ? { w, h } : { w: h, h: w };
}

/** Content box inside the @page margins, in CSS px (floored). */
export function printableArea(paper: PaperId, orient: Orient): { width: number; height: number } {
  const s = sheetSize(paper, orient);
  return {
    width: Math.floor(s.w - 2 * MARGIN_PX),
    height: Math.floor(s.h - 2 * MARGIN_PX),
  };
}

export function pageRule(paper: PaperId, orient: Orient): string {
  const p = PAPERS[paper];
  const [a, b] = orient === "landscape" ? [p.mmH, p.mmW] : [p.mmW, p.mmH];
  return `@page { size: ${a}mm ${b}mm; margin: ${MARGIN_MM}mm; }`;
}

export const PAPER_STORAGE_KEY = "evo-print-paper";

export function readStoredPaper(): { paper: PaperId; orient: Orient } | null {
  try {
    const raw = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { paper?: unknown; orient?: unknown };
    const paper = parsePaper(o.paper);
    const orient = parseOrient(o.orient);
    return paper && orient ? { paper, orient } : null;
  } catch {
    return null;
  }
}

export function writeStoredPaper(paper: PaperId, orient: Orient): void {
  try {
    window.localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify({ paper, orient }));
  } catch {
    /* private mode / blocked storage: the URL still carries the choice */
  }
}

/** "&paper=a3&orient=portrait" from the remembered choice, or "" (append to an existing query). */
export function storedPaperQuery(): string {
  const s = readStoredPaper();
  return s ? `&paper=${s.paper}&orient=${s.orient}` : "";
}
