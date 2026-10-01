"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@/lib/auth";
import Button from "@/components/ui/Button";

export default function LoginPage() {
  const [role, setRole] = useState<Role>("editor");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, passcode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Incorrect passcode.");
        setSubmitting(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[360px] flex-col gap-4 rounded-card bg-surface p-7 shadow-pop"
      >
        <div className="mb-1 text-center">
          <h1 className="text-[28px] font-semibold leading-8 tracking-tight text-navy">+EVO Events</h1>
          <p className="mt-1 text-body text-ink-2">Choose your access level and enter the passcode.</p>
        </div>

        <div
          role="group"
          aria-label="Access level"
          className="grid grid-cols-2 gap-1 rounded-pill bg-fill p-1"
        >
          {(["editor", "viewer"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={[
                "min-h-[36px] rounded-pill px-3 text-body font-medium transition-colors duration-fast",
                role === r ? "bg-surface text-navy shadow-sm" : "text-ink-2 hover:text-ink",
              ].join(" ")}
            >
              {r === "editor" ? "Edit access" : "View access"}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-center text-micro text-ink-2">
          {role === "editor"
            ? "Full access — add, edit, delete."
            : "View the calendar, edit existing events, and comment — can't add or delete anything."}
        </p>

        <div className="flex flex-col gap-1.5">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="min-h-[44px] w-full rounded-ctl border border-line-strong bg-white px-3.5 text-ui text-ink placeholder:text-ink-3"
            placeholder="Passcode"
            aria-label="Passcode"
            aria-invalid={error ? true : undefined}
            autoFocus
            required
          />
          {error && (
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" loading={submitting} className="min-h-[44px]">
          {submitting ? "Checking…" : "Continue"}
        </Button>
      </form>
    </main>
  );
}
