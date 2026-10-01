import { XIcon } from "@/components/icons";

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

/** Presentational bottom-center toast. Positioning is fixed; the parent decides when to mount it. */
export default function Toast({ message, actionLabel, onAction, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-pill bg-ink py-2 pl-5 pr-2 text-body text-white shadow-pop"
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-pill px-3 py-1 text-body font-medium text-gold transition-colors duration-fast ease-apple hover:bg-white/10 focus-visible:outline-gold"
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors duration-fast ease-apple hover:bg-white/10 hover:text-white focus-visible:outline-gold"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
