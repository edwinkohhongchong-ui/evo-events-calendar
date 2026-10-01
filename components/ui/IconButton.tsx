"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required: used as aria-label and shown as a tooltip on hover/focus. */
  label: string;
  icon: ReactNode;
  /** Where the tooltip appears. Default: below. */
  tooltipSide?: "top" | "bottom";
}

const SHOW_DELAY_MS = 300;

export default function IconButton({
  label,
  icon,
  tooltipSide = "bottom",
  className = "",
  type = "button",
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: IconButtonProps) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = useId();

  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(true), SHOW_DELAY_MS);
  };
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span className="relative inline-flex">
      <button
        type={type}
        aria-label={label}
        aria-describedby={show ? tipId : undefined}
        className={`inline-flex h-8 w-8 coarse:h-11 coarse:w-11 items-center justify-center rounded-full text-ink-2 transition-colors duration-fast ease-apple hover:bg-fill hover:text-navy disabled:opacity-40 disabled:pointer-events-none ${className}`}
        onMouseEnter={(e) => { open(); onMouseEnter?.(e); }}
        onMouseLeave={(e) => { close(); onMouseLeave?.(e); }}
        onFocus={(e) => { open(); onFocus?.(e); }}
        onBlur={(e) => { close(); onBlur?.(e); }}
        {...rest}
      >
        {icon}
      </button>
      {show && (
        <span
          id={tipId}
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-chip bg-ink px-2 py-1 text-micro font-medium text-white ${
            tooltipSide === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
