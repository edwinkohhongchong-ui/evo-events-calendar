"use client";

import { useEffect } from "react";
import Link from "next/link";
import Button, { buttonClass } from "@/components/ui/Button";

// Route-level error boundary. Plain-language message only: the raw error
// text is never rendered (it stays in the console for debugging).
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center sm:py-24">
      <div className="w-full rounded-card bg-surface p-8">
        <h1 className="text-title text-ink">Something went wrong</h1>
        <p className="mt-2 text-ui text-ink-2">
          We couldn&apos;t load this page. Your events are safe. Try again, or head back to the
          calendar.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className={buttonClass("secondary", "md")}>
            Back to calendar
          </Link>
        </div>
      </div>
    </main>
  );
}
