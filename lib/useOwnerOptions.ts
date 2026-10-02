import { useEffect, useState } from "react";
import { getOwnerOptions } from "./eventChecklistActions";
import { unwrap } from "./actionResult";

/** Owner names already in use (for a datalist). Editors only; empty if it can't load. */
export function useOwnerOptions(enabled: boolean): string[] {
  const [options, setOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const list = unwrap(await getOwnerOptions());
        if (!cancelled) setOptions(list);
      } catch {
        /* the field still works as plain text without suggestions */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return options;
}
