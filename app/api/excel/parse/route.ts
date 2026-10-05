import { NextRequest, NextResponse } from "next/server";
import { requireRoleRoute } from "@/lib/authRoute";
import { readXlsx, XlsxReadError } from "@/lib/excelImport/readXlsx";
import { MAX_XLSX_BYTES } from "@/lib/excelImport/limits";
import { parseCalendarWorkbook } from "@/lib/excelImport/parseCalendarSheets";
import { classifyWorkbook } from "@/lib/excelImport/classifyExcel";
import { planExcelDiff } from "@/lib/excelImport/diffExcel";
import { loadExcelExisting } from "@/lib/excelImport/loadExisting";
import { isXlsxName, safeFileName } from "@/lib/excelImport/upload";
import { ImportLimitError } from "@/lib/schedules/limits";
import { BodyTooLargeError, hasZipMagic, MAX_BODY_BYTES, readBodyCapped } from "@/lib/schedules/upload";

export const dynamic = "force-dynamic";

// Reads an uploaded .xlsx entirely in memory and returns a preview of what it
// would add or change. Nothing is written anywhere: not to disk, not to the
// database. Saving happens only in applyExcelImport, for rows the user ticks.
const TOO_LARGE = "That file is larger than 5 MB. Please upload a smaller Excel workbook.";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(TOO_LARGE, 413);

  // Content-Length can be absent or wrong, so the size is enforced while reading, and the
  // multipart is parsed only from the bytes that were actually accepted.
  const contentType = request.headers.get("content-type") ?? "";
  let file: FormDataEntryValue | null;
  try {
    const buffer = await readBodyCapped(request.body, MAX_BODY_BYTES);
    file = (await new Response(buffer, { headers: { "content-type": contentType } }).formData()).get("file");
  } catch (err) {
    if (err instanceof BodyTooLargeError) return fail(TOO_LARGE, 413);
    return fail("The upload could not be read. Please choose the file again.", 400);
  }
  if (!file || typeof file === "string") {
    return fail("Choose an Excel (.xlsx) file first.", 400);
  }
  if (!isXlsxName(file.name)) {
    return fail("Only Excel (.xlsx) workbooks can be read. If yours is .xls, open it in Excel and Save As .xlsx.", 415);
  }
  if (file.size > MAX_XLSX_BYTES) return fail(TOO_LARGE, 413);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasZipMagic(bytes)) {
      return fail("That file doesn't look like an Excel (.xlsx) workbook. Please save it as .xlsx and try again.", 415);
    }
    const workbook = await readXlsx(bytes);
    const parsed = parseCalendarWorkbook(workbook);
    const classified = classifyWorkbook(parsed);
    if (classified.events.length + classified.seasons.length + classified.holidays.length + classified.checklist.length === 0) {
      return fail("I could not find any events, seasons, observances or checklist items in that workbook. Is it the old events calendar?", 422);
    }
    const existing = await loadExcelExisting();
    const plan = planExcelDiff(classified, existing);
    return NextResponse.json({
      plan,
      levels: existing.levels.map((l) => l.name),
      truncated: workbook.truncated,
      fileName: safeFileName(file.name),
      notes: {
        ignoredSheets: parsed.ignoredSheets,
        sheetFlags: parsed.flags.map((f) => ({ sheet: f.source.sheet, cell: f.source.cell, severity: f.severity, message: f.message })),
      },
    });
  } catch (err) {
    if (err instanceof XlsxReadError || err instanceof ImportLimitError) return fail(err.message, 422);
    console.error("excel import parse failed:", err);
    return fail("Something went wrong reading that workbook. Please try again.", 500);
  }
}
