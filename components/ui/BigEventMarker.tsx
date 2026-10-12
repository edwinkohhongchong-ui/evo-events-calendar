// Small gold star after an event's name: this event is flagged "Big event" and
// is asked about in the Sunday Telegram planning check.
export default function BigEventMarker({ className = "" }: { className?: string }) {
  return (
    <>
      <span aria-hidden="true" className={`ml-1 shrink-0 text-gold-600 ${className}`}>
        ★
      </span>
      <span className="sr-only">, big event</span>
    </>
  );
}
