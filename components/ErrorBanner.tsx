"use client";

import { XIcon } from "./icons";

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-3 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-pill bg-danger py-2 pl-5 pr-2 text-body text-white shadow-pop"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors duration-fast ease-apple hover:bg-white/15 hover:text-white focus-visible:outline-white"
      >
        <XIcon />
      </button>
    </div>
  );
}
