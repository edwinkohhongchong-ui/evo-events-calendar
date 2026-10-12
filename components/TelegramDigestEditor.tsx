"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "./ui/ModalShell";
import Button from "./ui/Button";
import ConfirmModal from "./ConfirmModal";
import { INPUT, LABEL, TEXTAREA } from "./ui/fieldStyles";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { unwrap } from "@/lib/actionResult";
import {
  deleteTelegramDigest,
  generateOverrideText,
  previewTelegramDigestFor,
  saveTelegramDigest,
} from "@/lib/telegramDigestConfigActions";
import {
  DEFAULT_DIGEST_CONFIG,
  DIGEST_OVERRIDE_MAX,
  DIGEST_TEXT_MAX,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  configOf,
  type DigestConfig,
} from "@/lib/telegramDigestConfig";
import type { DigestRangeMode, LevelRow, TelegramDigestRow } from "@/lib/types";

interface Props {
  /** The digest being edited; omit to create one. */
  row?: TelegramDigestRow;
  /** Starting values for a new digest (e.g. the built-in default). */
  prefill?: DigestConfig;
  levels: LevelRow[];
  onClose: () => void;
  onChanged: (message: string) => void;
}

const FIXED_TIME_NOTE =
  "Sends around 7:30pm Singapore time on the chosen days (Vercel's free plan runs once a day, within the hour).";

const chip = (on: boolean) =>
  `inline-flex min-h-[36px] coarse:min-h-[44px] items-center justify-center rounded-pill border px-3.5 text-body font-medium transition-colors ${
    on ? "border-navy bg-navy text-white" : "border-line-strong bg-white text-ink hover:bg-fill"
  }`;

const checkRow = "flex min-h-[36px] coarse:min-h-[44px] items-center gap-2 text-body text-ink";

export default function TelegramDigestEditor({ row, prefill, levels, onClose, onChanged }: Props) {
  const start = row ? configOf(row) : (prefill ?? DEFAULT_DIGEST_CONFIG);
  const [name, setName] = useState(start.name);
  const [enabled, setEnabled] = useState(start.enabled);
  const [days, setDays] = useState<number[]>(start.days_of_week);
  const [mode, setMode] = useState<DigestRangeMode>(start.range_mode);
  const [rangeDays, setRangeDays] = useState(String(start.range_days));
  const [includeEvents, setIncludeEvents] = useState(start.include_events);
  const [includeGatherings, setIncludeGatherings] = useState(start.include_gatherings);
  const [picked, setPicked] = useState<string[]>(start.levels);
  const [big, setBig] = useState(start.include_big_events);
  const [bigWeeks, setBigWeeks] = useState(String(start.big_lookahead_weeks));
  const [checklist, setChecklist] = useState(start.include_checklist_counts);
  const [intro, setIntro] = useState(start.intro ?? "");
  const [outro, setOutro] = useState(start.outro ?? "");
  const [skipNext, setSkipNext] = useState(start.skip_next);
  const [override, setOverride] = useState<string | null>(start.override_text);

  const [preview, setPreview] = useState<string[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [closing, setClosing] = useState(false);
  useEscapeKey(onClose, !confirmDelete);

  // What the preview and "edit the message" are built from (never the edited text).
  const draft = useMemo<DigestConfig>(
    () => ({
      name: name.trim() || "Preview",
      enabled,
      days_of_week: days,
      range_mode: mode,
      range_days: Number(rangeDays),
      include_events: includeEvents,
      include_gatherings: includeGatherings,
      levels: picked,
      include_big_events: big,
      big_lookahead_weeks: Number(bigWeeks),
      include_checklist_counts: checklist,
      intro: intro.trim() || null,
      outro: outro.trim() || null,
      override_text: null,
      skip_next: skipNext,
    }),
    [name, enabled, days, mode, rangeDays, includeEvents, includeGatherings, picked, big, bigWeeks, checklist, intro, outro, skipNext]
  );

  // Live preview: debounced, and a slow reply for old settings never overwrites a newer one.
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        const messages = unwrap(await previewTelegramDigestFor(draft)).messages;
        if (mine !== seq.current) return;
        setPreview(messages);
        setPreviewError(null);
      } catch (err) {
        if (mine !== seq.current) return;
        setPreviewError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        if (mine === seq.current) setPreviewBusy(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [draft]);

  const allNames = useMemo(() => {
    const known = levels.map((l) => l.name);
    return [...known, ...picked.filter((p) => !known.some((k) => k.toLowerCase() === p.toLowerCase()))];
  }, [levels, picked]);
  const isPicked = (n: string) => picked.some((p) => p.toLowerCase() === n.toLowerCase());
  const toggleLevel = (n: string) => setPicked((cur) => (isPicked(n) ? cur.filter((p) => p.toLowerCase() !== n.toLowerCase()) : [...cur, n]));
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  async function loadAutoText() {
    setOverrideBusy(true);
    setError(null);
    try {
      setOverride(unwrap(await generateOverrideText({ draft })).text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setOverrideBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      unwrap(
        await saveTelegramDigest({
          id: row?.id,
          expectedUpdatedAt: row?.updated_at,
          config: { ...draft, name, override_text: override },
        })
      );
      setClosing(true);
      onChanged(row ? "Digest saved." : "Digest added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!row) return;
    setDeleting(true);
    setError(null);
    try {
      unwrap(await deleteTelegramDigest(row.id));
      setClosing(true);
      onChanged("Digest deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ModalShell
        title={row ? "Edit digest" : "Add digest"}
        subtitle="Choose what the bot posts to the group, and when."
        onClose={onClose}
        widthClass="max-w-xl"
        footer={
          <>
            {row ? (
              <Button variant="ghost" size="sm" className="!text-danger" onClick={() => { setError(null); setConfirmDelete(true); }} disabled={saving || closing}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} loading={saving} disabled={closing}>
                Save
              </Button>
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Sunday digest" className={INPUT} />
          </label>

          <label className={checkRow}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            Switched on
          </label>

          <fieldset>
            <legend className={LABEL}>Send on</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WEEKDAY_ORDER.map((d) => (
                <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={`${chip(days.includes(d))} min-w-[44px]`}>
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-micro text-ink-2 break-words">{FIXED_TIME_NOTE}</p>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>Cover</legend>
            <label className={checkRow}>
              <input type="radio" name="digest-range" checked={mode === "rest_of_month"} onChange={() => setMode("rest_of_month")} />
              Rest of this month
            </label>
            <label className={checkRow}>
              <input type="radio" name="digest-range" checked={mode === "this_week"} onChange={() => setMode("this_week")} />
              This week (up to Sunday)
            </label>
            <div className={`${checkRow} flex-wrap`}>
              <label className="flex items-center gap-2">
                <input type="radio" name="digest-range" checked={mode === "next_days"} onChange={() => setMode("next_days")} />
                Next
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={rangeDays}
                onChange={(e) => setRangeDays(e.target.value)}
                onFocus={() => setMode("next_days")}
                aria-label="Number of days"
                className={`${INPUT} !w-20`}
              />
              <span>days (from today)</span>
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>Include</legend>
            <label className={checkRow}>
              <input type="checkbox" checked={includeEvents} onChange={(e) => setIncludeEvents(e.target.checked)} className="h-4 w-4" />
              Events
            </label>
            <label className={checkRow}>
              <input type="checkbox" checked={includeGatherings} onChange={(e) => setIncludeGatherings(e.target.checked)} className="h-4 w-4" />
              Gatherings
            </label>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>Categories</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {allNames.map((n) => (
                <button key={n} type="button" aria-pressed={isPicked(n)} onClick={() => toggleLevel(n)} className={`${chip(isPicked(n))} break-words`}>
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-micro text-ink-2">
              {picked.length === 0 ? "None picked: every category is included." : "Only the picked categories are listed."}
            </p>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>Planning check</legend>
            <label className={checkRow}>
              <input type="checkbox" checked={big} onChange={(e) => setBig(e.target.checked)} className="h-4 w-4" />
              Big events planning check
            </label>
            {big && (
              <div className={`${checkRow} flex-wrap pl-6`}>
                Look
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={bigWeeks}
                  onChange={(e) => setBigWeeks(e.target.value)}
                  aria-label="Weeks ahead"
                  className={`${INPUT} !w-20`}
                />
                weeks ahead
              </div>
            )}
            <label className={checkRow}>
              <input type="checkbox" checked={checklist} onChange={(e) => setChecklist(e.target.checked)} className="h-4 w-4" />
              Show open checklist counts
            </label>
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className={LABEL}>Intro line (optional)</span>
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} maxLength={DIGEST_TEXT_MAX} className={TEXTAREA} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Closing line (optional)</span>
            <textarea value={outro} onChange={(e) => setOutro(e.target.value)} rows={2} maxLength={DIGEST_TEXT_MAX} className={TEXTAREA} />
          </label>

          <div className="flex flex-col gap-1">
            <div className={`${LABEL} flex items-center justify-between`}>
              Preview
              {previewBusy && <span className="font-normal">Updating…</span>}
            </div>
            {previewError ? (
              <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger break-words">{previewError}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(preview ?? []).map((text, i) => (
                  <pre key={i} className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-ctl border border-line bg-canvas p-3 font-sans text-body text-ink">
                    {text}
                  </pre>
                ))}
              </div>
            )}
            <p className="text-micro text-ink-2">Preview only. Nothing is sent.</p>
          </div>

          <div className="flex flex-col gap-2 rounded-card border border-line p-3">
            <div className="text-body font-medium text-ink">Edit the message for the next send</div>
            {override === null ? (
              <>
                <p className="text-micro text-ink-2">Start from the automatic message and change the wording yourself.</p>
                <div>
                  <Button size="sm" variant="secondary" onClick={loadAutoText} loading={overrideBusy}>
                    Edit the message
                  </Button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  rows={10}
                  maxLength={DIGEST_OVERRIDE_MAX}
                  aria-label="Message for the next send"
                  className="w-full rounded-card border border-line-strong bg-canvas px-3 py-2 font-mono text-body text-ink"
                />
                <p className="text-micro text-ink-2">Used once for the next send, then goes back to automatic.</p>
                <div className="flex flex-wrap gap-x-4">
                  <button type="button" onClick={loadAutoText} disabled={overrideBusy} className="min-h-[36px] coarse:min-h-[44px] text-body font-medium text-navy hover:underline">
                    Reset to auto-generated
                  </button>
                  <button type="button" onClick={() => setOverride(null)} className="min-h-[36px] coarse:min-h-[44px] text-body font-medium text-navy hover:underline">
                    Go back to automatic
                  </button>
                </div>
              </>
            )}
          </div>

          <label className={checkRow}>
            <input type="checkbox" checked={skipNext} onChange={(e) => setSkipNext(e.target.checked)} className="h-4 w-4" />
            Skip the next send
          </label>

          {error && !confirmDelete && (
            <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger break-words">
              {error}
            </p>
          )}
        </div>
      </ModalShell>
      {confirmDelete && (
        <ConfirmModal
          title="Delete this digest?"
          message="It will stop being sent. This can't be undone."
          confirmLabel="Yes, delete it"
          busyLabel="Deleting…"
          confirmVariant="danger"
          error={error}
          busy={deleting}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
