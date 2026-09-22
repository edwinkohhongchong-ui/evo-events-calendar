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
} from "docx";
import { EventOccurrence } from "./types";
import { formatDateDisplay, formatEventTimeRange } from "./dates";

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph(text)] });
}

export async function renderEventLineupDocx(
  occurrences: EventOccurrence[],
  range: { startDate: string; endDate: string }
): Promise<Buffer> {
  const headerRow = new TableRow({
    children: [headerCell("Date"), headerCell("Time"), headerCell("Event"), headerCell("Category")],
  });

  const rows =
    occurrences.length > 0
      ? occurrences.map(
          (occ) =>
            new TableRow({
              children: [
                cell(formatDateDisplay(occ.occurrenceDate)),
                cell(formatEventTimeRange(occ.startTime, occ.endTime) ?? "—"),
                cell(occ.event.name),
                cell(occ.event.level),
              ],
            })
        )
      : [
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 4,
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
          new Table({ rows: [headerRow, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
