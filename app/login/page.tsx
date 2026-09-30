"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@/lib/auth";

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
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm flex flex-col gap-3"
      >
        <h1 className="text-lg font-semibold text-navy mb-1">+EVO Events Calendar</h1>
        <p className="text-sm text-gray-500 mb-2">Choose your access level and enter the passcode.</p>

        <div className="flex gap-2 mb-1">
          {(["editor", "viewer"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={[
                "flex-1 px-3 py-1.5 rounded border text-sm",
                role === r
                  ? "bg-navy text-white border-navy"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50",
              ].join(" ")}
            >
              {r === "editor" ? "Edit access" : "View access"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 -mt-1 mb-1">
          {role === "editor"
            ? "Full access — add, edit, delete."
            : "View the calendar, edit existing events, and comment — can't add or delete anything."}
        </p>

        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="border rounded px-2 py-1.5"
          placeholder="Passcode"
          autoFocus
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded bg-navy text-white disabled:opacity-50"
        >
          {submitting ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
