import { applyOverrides } from "../overrides";
import { withOptimisticMove } from "../optimisticMove";
import { makeEvent, makeOcc } from "./fixtures";

// Optimistic UI and the server-confirmed render must agree, or the card
// visibly jumps after the round trip.
export function optimisticParity(): boolean {
  const m = makeEvent({ id: "m", event_date: "2026-10-05", end_date: "2026-10-07" });
  const occ = makeOcc(m, "2026-10-05", "2026-10-07");
  const opt = withOptimisticMove(occ, "2026-10-12");
  const srv = applyOverrides([occ], [{ id: "o", event_id: "m", original_date: "2026-10-05", new_date: "2026-10-12", new_time: null, new_end_date: null, created_at: "" }], new Map([["m", m]]), "2026-10-01", "2026-10-31")[0];
  return opt.occurrenceDate === srv.occurrenceDate && opt.spanEndDate === srv.spanEndDate;
}
