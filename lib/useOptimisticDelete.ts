"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent, deleteOccurrence } from "./actions";
import { unwrap } from "./actionResult";
import { isEventConflict } from "./eventConflict";
import { DeleteRequest, deleteHideKey } from "./eventDelete";
import { useUndo } from "./undo/UndoProvider";

const NONE: ReadonlySet<string> = new Set();

// Optimistic event delete shared by every surface that opens EventModal: the
// target is hidden at once (callers filter their occurrences with `hidden`),
// the server call runs in the background, and the page refresh runs in a
// transition so it never blocks the UI. On failure the target comes back and
// `error` says why. Undo is recorded once the server confirms, with the rows
// it actually removed.
export function useOptimisticDelete() {
  const router = useRouter();
  const { record } = useUndo();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(0);

  // Once the refresh lands the fresh props no longer contain the target, so the
  // local hiding can go (it must not outlive an Undo that brings it back). An
  // earlier refresh finishing must not unhide a delete still in flight.
  useEffect(() => {
    if (!isPending && inFlight.current === 0) setHidden((prev) => (prev.size ? NONE : prev));
  }, [isPending]);

  const requestDelete = useCallback(
    async (req: DeleteRequest) => {
      const key = deleteHideKey(req);
      setHidden((prev) => new Set(prev).add(key));
      setError(null);
      inFlight.current++;
      try {
        const affected =
          req.scope === "occurrence"
            ? unwrap(await deleteOccurrence(req.event, req.originalDate))
            : unwrap(await deleteEvent(req.event.id, req.lockToken));
        record(
          req.scope === "occurrence" ? `Delete "${req.event.name}" (only this event)` : `Delete "${req.event.name}"`,
          affected
        );
        startTransition(() => router.refresh());
      } catch (err) {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        const message = err instanceof Error ? err.message : "Something went wrong deleting this event.";
        setError(`${message} Nothing was deleted.`);
        if (isEventConflict(message)) startTransition(() => router.refresh()); // show their version
      } finally {
        inFlight.current--;
      }
    },
    [record, router]
  );

  return { hidden, requestDelete, error, dismissError: () => setError(null) };
}
