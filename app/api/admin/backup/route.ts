import { requireRoleRoute } from "@/lib/authRoute";
import { NextResponse } from "next/server";
import {
  getAllChecklist,
  getAllChecklistTemplateItemsRaw,
  getAllChecklistTemplatesRaw,
  getAllDayNotes,
  getAllEventExceptions,
  getAllEventOverrides,
  getAllEventsRaw,
  getAllGeneralNotes,
  getAllHolidays,
  getAllLevels,
  getAllMonthFocus,
  getAllNoteComments,
  getAllReminderTemplates,
  getAllSeasons,
} from "@/lib/data";

export const dynamic = "force-dynamic";

// Full data export — every row from every table, as one JSON object keyed
// by table name. This is a developer-restorable safety net (RLS is "allow
// all", so a bad bulk edit/mass-delete has no recovery path beyond the
// session-local Undo history) — not a polished feature. See PROJECT
// decision, CLAUDE.md/ONBOARDING.md context on the passcode gate being a
// deterrent only.
export async function GET() {
  const denied = await requireRoleRoute("editor");
  if (denied) return denied;

  const [
    events,
    holidays,
    seasons,
    levels,
    checklist,
    checklistTemplates,
    checklistTemplateItems,
    dayNotes,
    noteComments,
    reminderTemplates,
    eventOverrides,
    eventExceptions,
    monthFocus,
    generalNotes,
  ] = await Promise.all([
    getAllEventsRaw(),
    getAllHolidays(),
    getAllSeasons(),
    getAllLevels(),
    getAllChecklist(),
    getAllChecklistTemplatesRaw(),
    getAllChecklistTemplateItemsRaw(),
    getAllDayNotes(),
    getAllNoteComments(),
    getAllReminderTemplates(),
    getAllEventOverrides(),
    getAllEventExceptions(),
    getAllMonthFocus(),
    getAllGeneralNotes(),
  ]);

  const backup = {
    generated_at: new Date().toISOString(),
    events,
    holidays,
    seasons,
    levels,
    checklist,
    checklist_templates: checklistTemplates,
    checklist_template_items: checklistTemplateItems,
    day_notes: dayNotes,
    note_comments: noteComments,
    reminder_templates: reminderTemplates,
    event_overrides: eventOverrides,
    event_exceptions: eventExceptions,
    month_focus: monthFocus,
    general_notes: generalNotes,
  };

  const today = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify(backup, null, 2);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="evo-backup-${today}.json"`,
    },
  });
}
