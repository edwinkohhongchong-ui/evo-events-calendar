"use server";

import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import { insertHolidayRow, insertSeasonRow, updateHolidayRow, updateSeasonRow } from "./rowWrites";
import { earliestDate, runImport } from "./schedules/applyRunner";
import type { ImportOutcome } from "./schedules/applyRunner";
import { validateSelection } from "./schedules/applyValidation";
import type { ImportRowInput } from "./schedules/applyValidation";

// Applies ONLY the rows the user ticked in the import preview. The browser is
// never trusted: every row is re-validated here and the whole selection is
// rejected before the first write if any row is bad. Rows are then saved one
// at a time through the same writers as createSeason/updateSeason/createHoliday/
// updateHoliday (lib/rowWrites.ts). A failure part-way is returned as data, not
// thrown, so the rows already saved still come back as `affected` and one Undo
// can revert them.
async function applyScheduleImportImpl(selection: ImportRowInput[]): Promise<ImportOutcome> {
  await requireRole("editor");
  const checked = validateSelection(selection);
  if (!checked.ok) throw new Error(checked.error);

  const outcome = await runImport(checked.rows, {
    insertSeason: (v) => insertSeasonRow(v),
    updateSeason: (id, v, at) => updateSeasonRow(id, v, at),
    insertHoliday: (v) => insertHolidayRow(v),
    updateHoliday: (id, v, at) => updateHolidayRow(id, v, at),
  });

  // One summary entry instead of one per row, so a big import does not flood the notification bell.
  const { holidaysAdded, holidaysUpdated, seasonsAdded, seasonsUpdated } = outcome.summary;
  const holidays = holidaysAdded + holidaysUpdated;
  const seasons = seasonsAdded + seasonsUpdated;
  if (holidays + seasons > 0) {
    const added = holidaysAdded + seasonsAdded > 0;
    await logActivity({
      action: added ? "added" : "edited",
      entity: "season",
      label: `${added ? "Imported" : "Updated"} ${holidays} holidays, ${seasons} seasons`,
      itemDate: earliestDate(checked.rows),
    });
  }
  return outcome;
}

// Public Server Action: returns an ActionResult (see lib/actionResult.ts).
export async function applyScheduleImport(...args: Parameters<typeof applyScheduleImportImpl>) {
  return runAction(() => applyScheduleImportImpl(...args));
}
