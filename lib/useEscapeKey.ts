import { useEffect, useRef } from "react";
import { dispatchEscape, pushEscapeHandler } from "./escapeStack";

let listening = false;
function ensureListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dispatchEscape();
  });
}

// Shared "Escape closes this layer" behavior. Layers stack in the order they
// start listening, and only the top-most one reacts — so a nested confirm
// dialog closes alone, not together with the modal underneath it. Pass
// `enabled=false` for always-mounted UI so it only joins the stack while open.
export function useEscapeKey(onClose: () => void, enabled = true) {
  const handler = useRef(onClose);
  handler.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    ensureListener();
    return pushEscapeHandler(handler);
  }, [enabled]);
}
