"use client";

import { forwardRef, TextareaHTMLAttributes, useCallback, useLayoutEffect, useRef } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  // Beyond this height the box scrolls instead of growing further.
  maxHeightPx?: number;
};

// A textarea that wraps text and grows with it, so everything typed stays
// visible. Starts at `rows` (default 1) and re-measures on every value change,
// which also shrinks it back after the field is cleared on submit.
const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(function AutoGrowTextarea(
  { maxHeightPx = 320, rows = 1, className = "", value, onChange, ...rest },
  forwardedRef
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    // Empty: size by `rows` only. scrollHeight would count the wrapped
    // placeholder, which makes an empty box balloon in narrow containers.
    if (!el.value) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }
    el.style.height = "auto";
    // scrollHeight excludes borders but height (border-box) includes them.
    const borders = el.offsetHeight - el.clientHeight;
    const wanted = el.scrollHeight + borders;
    el.style.height = `${Math.min(wanted, maxHeightPx)}px`;
    el.style.overflowY = wanted > maxHeightPx ? "auto" : "hidden";
  }, [maxHeightPx]);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      {...rest}
      ref={(el) => {
        innerRef.current = el;
        if (typeof forwardedRef === "function") forwardedRef(el);
        else if (forwardedRef) forwardedRef.current = el;
      }}
      rows={rows}
      value={value}
      onChange={onChange}
      className={`resize-none overflow-hidden break-words ${className}`}
    />
  );
});

export default AutoGrowTextarea;
