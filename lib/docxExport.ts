import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  TableLayoutType,
} from "docx";
import { EventOccurrence } from "./types";
import { formatDateDisplay, formatEventTimeRange } from "./dates";

// Column widths in twips (1/20 pt) — mirrors the PDF table's proportions
// (narrow Date/Time/Category, wide Event name). Sums to ~6.5in, the usable
// width on a Letter page with default 1in margins. Without explicit
// widths here (and matching per-cell widths below), `docx` falls back to a
// nominal placeholder <w:gridCol w:w="100"/> per column — a few points wide
// — and, without `layout: FIXED`, Word's "autofit contents" then repeatedly
// recalculates column widths from cell content, so the table renders
// squished/misaligned instead of the intended layout.
const COLUMN_WIDTHS_DXA = [1400, 1400, 4680, 1870];
const TABLE_WIDTH_DXA = COLUMN_WIDTHS_DXA.reduce((sum, w) => sum + w, 0);

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function cell(text: string, width: number): TableCell {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, children: [new Paragraph(text)] });
}

export async function renderEventLineupDocx(
  occurrences: EventOccurrence[],
  range: { startDate: string; endDate: string }
): Promise<Buffer> {
  const [dateWidth, timeWidth, eventWidth, categoryWidth] = COLUMN_WIDTHS_DXA;

  const headerRow = new TableRow({
    children: [
      headerCell("Date", dateWidth),
      headerCell("Time", timeWidth),
      headerCell("Event", eventWidth),
      headerCell("Category", categoryWidth),
    ],
  });

  const rows =
    occurrences.length > 0
      ? occurrences.map(
          (occ) =>
            new TableRow({
              children: [
                cell(formatDateDisplay(occ.occurrenceDate), dateWidth),
                cell(formatEventTimeRange(occ.startTime, occ.endTime) ?? "—", timeWidth),
                cell(occ.event.name, eventWidth),
                cell(occ.event.level, categoryWidth),
              ],
            })
        )
      : [
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 4,
                width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
                children: [new Paragraph("No events match this date range and category selection.")],
              }),
            ],
          }),
        ];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "+EVO Events Calendar — Event Lineup", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `${formatDateDisplay(range.startDate)} – ${formatDateDisplay(range.endDate)}` }),
          new Paragraph({ text: "" }),
          new Table({
            rows: [headerRow, ...rows],
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: COLUMN_WIDTHS_DXA,
            layout: TableLayoutType.FIXED,
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
