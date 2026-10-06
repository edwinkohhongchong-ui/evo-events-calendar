// Read-only display of free-text remarks (day note / holiday details, event
// and season notes): keeps the author's line breaks and wraps long words so
// nothing runs off a narrow card.
export default function DetailsText({
  text,
  className = "",
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return <p className="text-micro text-ink-2">No details.</p>;
  return <div className={`whitespace-pre-wrap break-words text-ink ${className}`}>{text}</div>;
}

// Quiet "⋯" after a calendar item's label meaning "click for details". The
// screen-reader text only counts where the trigger has no aria-label of its own.
export function DetailsMarker({ className = "" }: { className?: string }) {
  return (
    <>
      <span aria-hidden="true" className={`ml-1 shrink-0 text-ink-3 ${className}`}>
        ⋯
      </span>
      <span className="sr-only">, has details</span>
    </>
  );
}
