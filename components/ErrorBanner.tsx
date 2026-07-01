"use client";

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-sm px-4 py-2 rounded shadow-lg flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onDismiss} className="font-bold leading-none" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
