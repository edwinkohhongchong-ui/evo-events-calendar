import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center sm:py-24">
      <div className="w-full rounded-card bg-surface p-8">
        <h1 className="text-title text-ink">Page not found</h1>
        <p className="mt-2 text-ui text-ink-2">
          That page doesn&apos;t exist or the link is out of date.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/" className={buttonClass("primary", "md")}>
            Back to calendar
          </Link>
        </div>
      </div>
    </main>
  );
}
