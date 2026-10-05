"use server";

import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import {
  fetchEventRecurring,
  fetchLevelNames,
  insertChecklistRow,
  insertEventRow,
  insertHolidayRow,
  insertSeasonRow,
  updateChecklistRow,
  updateEventRow,
  updateHolidayRow,
  updateSeasonRow,
} from "./rowWrites";
import { earliestExcelDate, runExcelImport } from "./excelImport/applyRunner";
import type { ExcelOutcome } from "./excelImport/applyRunner";
import { eventUpdateIds, validateExcelSelection } from "./excelImport/applyValidation";
import type { ExcelApplyRow } from "./excelImport/applyValidation";
import { MAX_EXCEL_APPLY_ROWS } from "./excelImport/limits";

// Applies ONLY the rows the user ticked in the Excel import preview. The
// browser is never trusted: every row is re-validated here (levels are read
// from the database once) and the whole selection is rejected before the first
// write if any row is bad. Rows are then saved one at a time through the same
// writers as createEvent/updateEvent, the season and holiday actions and the
// checklist actions (lib/rowWrites.ts). A failure part-way is returned as data,
// not thrown, so the rows already saved still come back as `affected`.
//
// Several calls, ONE Undo: a selection bigger than MAX_EXCEL_APPLY_ROWS is
// applied by the client in sequential calls. The client concatenates the
// `affected` arrays of all calls, in order, into a single UndoableAction and
// records it once after the last call (or after the first failed one), so one
// Undo reverts everything the import saved. Each call writes one summary entry
// to the activity feed, never one per row.
async function applyExcelImportImpl(selection: ExcelApplyRow[]): Promise<ExcelOutcome> {
  await requireRole("editor");
  if (!Array.isArray(selection)) throw new Error("Nothing to import.");
  if (selection.length > MAX_EXCEL_APPLY_ROWS) {
    throw new Error(`That is more than ${MAX_EXCEL_APPLY_ROWS} rows at once. Import in more than one go.`);
  }
  const levelNames = await fetchLevelNames();
  const eventRecurring = await fetchEventRecurring(eventUpdateIds(selection));
  const checked = validateExcelSelection(selection, { levelNames, eventRecurring });
  if (!checked.ok) throw new Error(checked.error);

  const outcome = await runExcelImport(checked.rows, {
    insertEvent: (v) => insertEventRow(v),
    // A patch: keep the owner and every column the import does not touch.
    updateEvent: (id, patch, at) => updateEventRow(id, patch as Parameters<typeof updateEventRow>[1], at, { preserveOwner: true }),
    insertSeason: (v) => insertSeasonRow(v),
    updateSeason: (id, v, at) => updateSeasonRow(id, v, at),
    insertHoliday: (v) => insertHolidayRow(v),
    updateHoliday: (id, v, at) => updateHolidayRow(id, v, at),
    insertChecklist: (v) => insertChecklistRow(v),
    updateChecklist: (id, patch, at) => updateChecklistRow(id, patch as Parameters<typeof updateChecklistRow>[1], at),
  });

  const s = outcome.summary;
  const parts = [
    ["event", s.eventsAdded + s.eventsUpdated],
    ["season", s.seasonsAdded + s.seasonsUpdated],
    ["observance", s.holidaysAdded + s.holidaysUpdated],
    ["checklist item", s.checklistAdded + s.checklistUpdated],
  ] as const;
  const bits = parts.filter(([, n]) => n > 0).map(([w, n]) => `${n} ${w}${n === 1 ? "" : "s"}`);
  if (bits.length > 0) {
    const added = s.eventsAdded + s.seasonsAdded + s.holidaysAdded + s.checklistAdded > 0;
    await logActivity({
      action: added ? "added" : "edited",
      entity: s.eventsAdded + s.eventsUpdated > 0 ? "event" : "season",
      label: `Imported from Excel: ${bits.join(", ")}`,
      itemDate: earliestExcelDate(checked.rows),
    });
  }
  return outcome;
}

// Public Server Action: returns an ActionResult (see lib/actionResult.ts).
export async function applyExcelImport(...args: Parameters<typeof applyExcelImportImpl>) {
  return runAction(() => applyExcelImportImpl(...args));
}
