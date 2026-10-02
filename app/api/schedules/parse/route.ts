import { NextRequest, NextResponse } from "next/server";
import { requireRoleRoute } from "@/lib/authRoute";
import { getAllHolidays, getAllSeasons } from "@/lib/data";
import { DocxReadError, MAX_DOCX_BYTES, readDocxParagraphs } from "@/lib/schedules/readDocx";
import { ImportLimitError } from "@/lib/schedules/limits";
import { BodyTooLargeError, hasZipMagic, isDocxName, MAX_BODY_BYTES, readBodyCapped } from "@/lib/schedules/upload";
import { parseScheduleLines } from "@/lib/schedules/parseSchedule";
import { classifySchedule } from "@/lib/schedules/classify";
import { planDiff } from "@/lib/schedules/diff";
import { buildSchedulePlan } from "@/lib/schedules/planRows";
import { runHolidayCheck } from "@/lib/schedules/holidayCheckRun";

export const dynamic = "force-dynamic";

// Reads an uploaded .docx entirely in memory and returns a preview of what it
// would add or change. Nothing is written anywhere: not to disk, not to the
// database. Saving happens only in applyScheduleImport, for rows the user ticks.
const TOO_LARGE = "That file is larger than 5 MB. Please upload a smaller Word document.";

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
    return fail("Choose a Word (.docx) file first.", 400);
  }
  if (!isDocxName(file.name)) {
    return fail("Only Word (.docx) documents can be read. If yours is .doc, open it in Word and Save As .docx.", 415);
  }
  if (file.size > MAX_DOCX_BYTES) return fail(TOO_LARGE, 413);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasZipMagic(bytes)) {
      return fail("That file doesn't look like a Word (.docx) document. Please save it as .docx and try again.", 415);
    }
    const parsed = parseScheduleLines(await readDocxParagraphs(bytes));
    if (parsed.items.length === 0) {
      return fail("I could not find any dates in that document. Is it the yearly education schedule?", 422);
    }
    const [holidays, seasons] = await Promise.all([getAllHolidays(), getAllSeasons()]);
    const diff = planDiff(classifySchedule(parsed), { holidays, seasons });
    const plan = buildSchedulePlan(parsed, diff);
    // Advisory only and never throws: a Calendarific problem must not fail the parse.
    return NextResponse.json({ ...plan, holidayCheck: await runHolidayCheck(plan) });
  } catch (err) {
    if (err instanceof DocxReadError || err instanceof ImportLimitError) return fail(err.message, 422);
    console.error("schedule import parse failed:", err);
    return fail("Something went wrong reading that document. Please try again.", 500);
  }
}
