"use client";

import type { ReactNode } from "react";
import { XIcon } from "../icons";

interface ModalShellProps {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Sticky footer (buttons). Omit when the body carries its own buttons. */
  footer?: ReactNode;
  /** Tailwind max-width class; defaults to ~560px. */
  widthClass?: string;
  children: ReactNode;
}

// Shared modal chrome: dimmed + blurred backdrop, 20px-radius card, sticky
// header (title + close) and optional sticky footer, with only the body
// scrolling (90vh cap). Escape handling stays with each modal's own
// useEscapeKey so existing behaviour is unchanged.
export default function ModalShell({
  title,
  subtitle,
  onClose,
  footer,
  widthClass = "max-w-[560px]",
  children,
}: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm evo-modal-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`evo-modal-card flex max-h-[90vh] w-full flex-col overflow-hidden rounded-modal bg-surface shadow-modal ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-title text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-chip text-ink-2">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-fill hover:text-ink"
          >
            <XIcon className="!h-4 !w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
