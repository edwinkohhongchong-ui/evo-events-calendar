"use client";

import { useState } from "react";
import { previewTelegramDigest, sendTelegramDigestTest } from "@/lib/telegramDigestActions";
import { unwrap } from "@/lib/actionResult";
import ConfirmModal from "./ConfirmModal";
import Button from "./ui/Button";

// Editor-only. The automatic Sunday message is set up in Vercel; these two
// buttons let an Editor see what it would say, or send it once to the group.
export default function TelegramDigestPanel() {
  const [preview, setPreview] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handlePreview() {
    setBusy("preview");
    setError(null);
    setNotice(null);
    try {
      setPreview(unwrap(await previewTelegramDigest()).messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSend() {
    setBusy("send");
    setError(null);
    try {
      const { sent } = unwrap(await sendTelegramDigestTest());
      setNotice(`Sent to the group (${sent} ${sent === 1 ? "message" : "messages"}).`);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-4 rounded-card bg-surface p-4">
      <h2 className="text-ui font-medium text-ink">Automatic Sunday Telegram message</h2>
      <p className="mt-1 text-body text-ink-2">
        Every Sunday evening the bot posts this month&rsquo;s events to the group, and asks the team about big events up to 8 weeks ahead.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={handlePreview} loading={busy === "preview"}>
          Preview the message
        </Button>
        <Button size="sm" onClick={() => { setError(null); setConfirming(true); }} disabled={busy !== null}>
          Send digest to the group now (test)
        </Button>
      </div>
      {error && !confirming && <p className="mt-2 text-body text-danger">{error}</p>}
      {notice && <p className="mt-2 text-body text-ok">{notice}</p>}
      {preview && (
        <div className="mt-3 flex flex-col gap-2">
          {preview.map((text, i) => (
            <pre key={i} className="whitespace-pre-wrap break-words rounded-ctl border border-line bg-canvas p-3 font-sans text-body text-ink">
              {text}
            </pre>
          ))}
          <p className="text-micro text-ink-2">Preview only. Nothing was sent.</p>
        </div>
      )}
      {confirming && (
        <ConfirmModal
          title="Send to the group?"
          message="This posts the message to the whole group chat right now."
          confirmLabel="Yes, send it"
          busyLabel="Sending…"
          confirmVariant="primary"
          error={error}
          busy={busy === "send"}
          onClose={() => setConfirming(false)}
          onConfirm={handleSend}
        />
      )}
    </section>
  );
}
