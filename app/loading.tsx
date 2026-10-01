// Calm route-level skeleton shown while a page's server data loads. Quiet
// grey blocks on the canvas (no spinner); the pulse is switched off for
// reduced-motion users by the global rule in globals.css.
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-6xl p-4 sm:p-6"
    >
      <span className="sr-only">Loading…</span>
      <div className="animate-pulse" aria-hidden="true">
        <div className="mb-5 flex items-center gap-3">
          <div className="h-8 w-48 rounded-ctl bg-fill" />
          <div className="ml-auto h-8 w-24 rounded-pill bg-fill" />
        </div>
        <div className="rounded-card bg-surface p-4">
          <div className="mb-3 grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-4 rounded-chip bg-fill" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} className="h-16 rounded-chip bg-canvas" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
