"use client";

import { useState } from "react";
import { previewTelegramDigest, sendTelegramDigestTest } from "@/lib/telegramDigestActions";
import {
  listTelegramDigests,
  saveTelegramDigest,
  sendTelegramDigestNow,
} from "@/lib/telegramDigestConfigActions";
import { unwrap } from "@/lib/actionResult";
import { todayStr } from "@/lib/dates";
import {
  DEFAULT_DIGEST_CONFIG,
  DIGEST_MIGRATION_HINT,
  configOf,
  daysSummary,
  formatDayShort,
  nextSendDate,
  rangeSummary,
  type DigestConfig,
} from "@/lib/telegramDigestConfig";
import type { DigestList } from "@/lib/telegramDigestStore";
import type { LevelRow, TelegramDigestRow } from "@/lib/types";
import ConfirmModal from "./ConfirmModal";
import Button from "./ui/Button";
import TelegramDigestEditor from "./TelegramDigestEditor";

interface Props {
  /** null = the digests could not be loaded. */
  initial: DigestList | null;
  levels: LevelRow[];
}

type Editing = { row?: TelegramDigestRow; prefill?: DigestConfig } | null;

const FIXED_TIME_NOTE =
  "Sends around 7:30pm Singapore time on the chosen days (Vercel's free plan runs once a day, within the hour).";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");

// Editor-only. Digests are the messages the bot posts to the Telegram group on
// chosen weekdays; this panel lists them and opens the editor. With none set
// up, the built-in Sunday message stays active (see the cron route).
export default function TelegramDigestPanel({ initial, levels }: Props) {
  const [list, setList] = useState<DigestList | null>(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [sendTarget, setSendTarget] = useState<TelegramDigestRow | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | "digest" | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [confirmingDefault, setConfirmingDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ready = list?.ready === true;
  const rows = list?.rows ?? [];
  const today = todayStr();

  async function refresh(message?: string) {
    try {
      setList(unwrap(await listTelegramDigests()));
      if (message) setNotice(message);
    } catch (err) {
      setError(errorText(err));
    }
  }

  function closeEditor(message: string) {
    setEditing(null);
    setError(null);
    void refresh(message);
  }

  async function toggleEnabled(row: TelegramDigestRow) {
    setBusy("digest");
    setError(null);
    setNotice(null);
    try {
      unwrap(await saveTelegramDigest({ id: row.id, expectedUpdatedAt: row.updated_at, config: { ...configOf(row), enabled: !row.enabled } }));
      await refresh();
    } catch (err) {
      setError(errorText(err));
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleSendNow() {
    if (!sendTarget) return;
    setBusy("send");
    setError(null);
    try {
      const { sent } = unwrap(await sendTelegramDigestNow(sendTarget.id));
      setNotice(`Sent to the group (${sent} ${sent === 1 ? "message" : "messages"}).`);
      setSendTarget(null);
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePreviewDefault() {
    setBusy("preview");
    setError(null);
    setNotice(null);
    try {
      setPreview(unwrap(await previewTelegramDigest()).messages);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleSendDefault() {
    setBusy("send");
    setError(null);
    try {
      const { sent } = unwrap(await sendTelegramDigestTest());
      setNotice(`Sent to the group (${sent} ${sent === 1 ? "message" : "messages"}).`);
      setConfirmingDefault(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-4 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ui font-medium text-ink">Telegram group digests</h2>
        {ready && (
          <Button size="sm" onClick={() => { setError(null); setNotice(null); setEditing({}); }}>
            Add digest
          </Button>
        )}
      </div>
      <p className="mt-1 text-body text-ink-2">
        The bot posts these to the group by itself. Pick the days, what to list, and edit the wording whenever you need to. {FIXED_TIME_NOTE}
      </p>

      {list === null && <p className="mt-3 text-body text-danger">The digests could not be loaded. Please reload the page.</p>}
      {list && !list.ready && <p className="mt-3 rounded-ctl bg-fill px-3 py-2 text-body text-ink">{DIGEST_MIGRATION_HINT}</p>}

      {ready && rows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => {
            const next = nextSendDate(row, today);
            return (
              <li key={row.id} className="rounded-ctl border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-words text-ui font-medium text-ink">{row.name}</div>
                    <div className="mt-0.5 break-words text-body text-ink-2">
                      {daysSummary(row.days_of_week)} &middot; {rangeSummary(row)}
                    </div>
                  </div>
                  <label className="flex min-h-[36px] coarse:min-h-[44px] items-center gap-2 text-body text-ink">
                    <input type="checkbox" checked={row.enabled} disabled={busy !== null} onChange={() => toggleEnabled(row)} className="h-4 w-4" />
                    {row.enabled ? "On" : "Off"}
                  </label>
                </div>
                <div className="mt-1 break-words text-micro text-ink-2">
                  {row.last_sent_on ? `Last sent ${formatDayShort(row.last_sent_on)}` : "Not sent yet"}
                  {" · "}
                  {row.enabled ? (next ? `Next: ${formatDayShort(next)}${row.skip_next ? " (the one after, as the next is skipped)" : ""}` : "Nothing scheduled") : "Switched off"}
                  {row.override_text ? " · Edited message waiting" : ""}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setError(null); setNotice(null); setEditing({ row }); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setError(null); setNotice(null); setSendTarget(row); }} disabled={busy !== null}>
                    Send now
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {list && rows.length === 0 && (
        <div className="mt-3 rounded-ctl border border-line p-3">
          <p className="text-body text-ink">
            No digests are set up yet, so the default Sunday message is active: this month&rsquo;s events, plus a planning check for big events up to 8 weeks ahead.
            {ready ? " Create a digest to choose your own days and content." : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ready && (
              <Button size="sm" onClick={() => { setError(null); setNotice(null); setEditing({ prefill: DEFAULT_DIGEST_CONFIG }); }}>
                Create from the default
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handlePreviewDefault} loading={busy === "preview"}>
              Preview the default message
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setError(null); setConfirmingDefault(true); }} disabled={busy !== null}>
              Send the default now (test)
            </Button>
          </div>
        </div>
      )}

      {error && !sendTarget && !confirmingDefault && <p role="alert" className="mt-2 break-words text-body text-danger">{error}</p>}
      {notice && <p className="mt-2 break-words text-body text-ok">{notice}</p>}

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

      {editing && (
        <TelegramDigestEditor row={editing.row} prefill={editing.prefill} levels={levels} onClose={() => setEditing(null)} onChanged={closeEditor} />
      )}
      {sendTarget && (
        <ConfirmModal
          title="Send to the group?"
          message={`This posts "${sendTarget.name}" to the whole group chat right now, and counts as today's send, so the schedule won't post it again today.`}
          confirmLabel="Yes, send it"
          busyLabel="Sending…"
          confirmVariant="primary"
          error={error}
          busy={busy === "send"}
          onClose={() => setSendTarget(null)}
          onConfirm={handleSendNow}
        />
      )}
      {confirmingDefault && (
        <ConfirmModal
          title="Send to the group?"
          message="This posts the default Sunday message to the whole group chat right now."
          confirmLabel="Yes, send it"
          busyLabel="Sending…"
          confirmVariant="primary"
          error={error}
          busy={busy === "send"}
          onClose={() => setConfirmingDefault(false)}
          onConfirm={handleSendDefault}
        />
      )}
    </section>
  );
}
