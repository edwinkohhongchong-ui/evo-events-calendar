import { useEffect, type RefObject } from "react";
import { nextFocusIndex } from "./focusTrap";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0
  );
}

// Dialog focus management: moves focus into the container on open (unless an
// inner autoFocus already did), keeps Tab/Shift+Tab inside it, and returns
// focus to whatever opened it on close.
export function useFocusTrap(ref: RefObject<HTMLElement>, active = true) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !root) return;
      // Stop here so a dialog nested in this one's DOM doesn't also trap.
      e.stopPropagation();
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = nextFocusIndex(items.length, current, e.shiftKey);
      if (next !== null) {
        e.preventDefault();
        items[next].focus();
      }
    }
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
