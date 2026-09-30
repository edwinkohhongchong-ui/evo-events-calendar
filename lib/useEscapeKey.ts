import { useEffect } from "react";

// Shared "Escape closes this modal" behavior — every modal in the app binds
// this the same way: pressing Escape anywhere inside (or outside) it calls
// the modal's onClose, regardless of which internal step/form state it's in.
export function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}
