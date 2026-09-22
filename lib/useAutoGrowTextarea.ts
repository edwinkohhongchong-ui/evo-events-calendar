import { useEffect, useRef } from "react";

// Grows a textarea's height to fit its content instead of scrolling inside a
// fixed box. Resizes on mount (so pre-existing long content isn't clipped)
// and on every change. CSS min-height still applies as a floor — this only
// ever grows the element taller, never shrinks it below that.
export function useAutoGrowTextarea<T extends string>(value: T) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return ref;
}
