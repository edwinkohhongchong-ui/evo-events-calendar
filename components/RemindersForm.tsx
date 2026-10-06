"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUndo } from "@/lib/undo/UndoProvider";
import { deleteReminderTemplate } from "@/lib/reminderTemplateActions";
import { ChecklistTemplateWithItems, OpenChecklistRow, ReminderTemplateRow } from "@/lib/types";
import { ReminderPickerEvent } from "@/lib/data";
import { expandTemplateItems } from "@/lib/eventChecklist";
import { todayDate, todayStr, toDateStr, formatDateDisplay, formatEventTimeRange } from "@/lib/dates";
import { buildOverdueSummary } from "@/lib/overdueSummary";
import ReminderTemplateModal from "./ReminderTemplateModal";
import ConfirmModal from "./ConfirmModal";
import { unwrap } from "@/lib/actionResult";
import Card from "./ui/Card";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { INPUT, LABEL } from "./ui/fieldStyles";
import { TABLE_CARD, TABLE, TH, TD, TR, EMPTY_CELL, ROW_ACTION } from "./ui/tableStyles";
import { PlusIcon, TrashIcon } from "./icons";

interface RemindersFormProps {
  templates: ReminderTemplateRow[];
  checklistTemplates: ChecklistTemplateWithItems[];
  openChecklistRows?: OpenChecklistRow[];
}

type TemplateModalState = { type: "closed" } | { type: "add" } | { type: "edit"; template: ReminderTemplateRow };

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Same layout as originally designed: intro text, then each selected event
// with its time/location and, if a checklist template was chosen for it,
// that template's lines underneath — so the Telegram message is
// self-contained without anyone needing to open the app.
function buildMessage(
  introText: string,
  events: ReminderPickerEvent[],
  selected: Set<string>,
  eventTemplates: Record<string, string>,
  checklistTemplates: ChecklistTemplateWithItems[]
): string {
  const lines: string[] = [];
  if (introText.trim()) lines.push(introText.trim(), "");

  for (const ev of events) {
    if (!selected.has(ev.occurrenceKey)) continue;
    const timeRange = formatEventTimeRange(ev.startTime, ev.endTime);
    const details = [formatDateDisplay(ev.date), timeRange, ev.location ? `📍 ${ev.location}` : null]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${ev.flagged ? "⭐ " : ""}${ev.name} — ${details}`);

    const templateId = eventTemplates[ev.occurrenceKey];
    const template = templateId ? checklistTemplates.find((t) => t.id === templateId) : undefined;
    if (template) {
      for (const { item: line } of expandTemplateItems(template)) {
        lines.push(`  ☐ ${line}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export default function RemindersForm({ templates, checklistTemplates, openChecklistRows = [] }: RemindersFormProps) {
  const router = useRouter();
  const { record } = useUndo();
  const [selectedId, setSelectedId] = useState("");
  const [handle, setHandle] = useState("");
  const [introText, setIntroText] = useState("");
  // 60, not 30 — a Churchwide/Xmas/Easter event planned a couple months out
  // would otherwise silently not appear until someone thinks to widen this
  // (Pastor review finding #3); the empty-state message below also now says
  // so explicitly rather than just showing a blank list.
  const [lookaheadDays, setLookaheadDays] = useState(60);
  const [message, setMessage] = useState("");
  const [messageTouched, setMessageTouched] = useState(false);
  const [pickerEvents, setPickerEvents] = useState<ReminderPickerEvent[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Which checklist template (message-only) is chosen per event occurrence —
  // deliberately separate from the real Checklist table, per explicit
  // feedback that the two shouldn't be linked.
  const [eventTemplates, setEventTemplates] = useState<Record<string, string>>({});
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState<TemplateModalState>({ type: "closed" });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReminderTemplateRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [overdueNote, setOverdueNote] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  // Each fetch gets a sequence number; only the newest may write state, so a
  // slow earlier response can't overwrite a newer lookahead's list.
  const fetchSeq = useRef(0);
  const fetchAbort = useRef<AbortController | null>(null);

  const fetchEvents = useCallback(async (days: number) => {
    const seq = ++fetchSeq.current;
    fetchAbort.current?.abort();
    const controller = new AbortController();
    fetchAbort.current = controller;
    setLoadingEvents(true);
    setError(null);
    try {
      const start = todayStr();
      const end = toDateStr(addDays(todayDate(), days));
      const res = await fetch(`/api/reminders/events?start=${start}&end=${end}`, { signal: controller.signal });
      const data = await res.json();
      if (seq !== fetchSeq.current) return;
      if (!res.ok) throw new Error(data?.error ?? "Couldn't load upcoming events.");
      const events: ReminderPickerEvent[] = data.events;
      setPickerEvents(events);
      setSelectedKeys(new Set(events.filter((e) => e.flagged).map((e) => e.occurrenceKey)));
      setEventTemplates({});
    } catch (err) {
      if (seq !== fetchSeq.current) return;
      setError(err instanceof Error ? err.message : "Couldn't load upcoming events.");
      setPickerEvents([]);
      setSelectedKeys(new Set());
    } finally {
      if (seq === fetchSeq.current) setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(60);
    // Only on mount — subsequent range/template changes call fetchEvents explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-regenerates the message from the intro text + current selection —
  // same "auto-suggest until touched" pattern used elsewhere in this app
  // (Season/Level color, Gathering auto-name) — stops once the user directly
  // edits the textarea, so their edits are never silently clobbered.
  useEffect(() => {
    if (messageTouched) return;
    setMessage(buildMessage(introText, pickerEvents, selectedKeys, eventTemplates, checklistTemplates));
  }, [introText, pickerEvents, selectedKeys, eventTemplates, checklistTemplates, messageTouched]);

  function applyTemplate(id: string) {
    setSelectedId(id);
    setMessageTouched(false);
    const template = templates.find((t) => t.id === id);
    if (!template) {
      setHandle("");
      setIntroText("");
      return;
    }
    setHandle(template.default_telegram_handle ?? "");
    setIntroText(template.default_message ?? "");
    setLookaheadDays(template.lookahead_days);
    fetchEvents(template.lookahead_days);
  }

  function toggleEvent(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setEventTemplate(occurrenceKey: string, templateId: string) {
    setEventTemplates((prev) => {
      const next = { ...prev };
      if (templateId) next[occurrenceKey] = templateId;
      else delete next[occurrenceKey];
      return next;
    });
  }

  function handleLookaheadChange(days: number) {
    setLookaheadDays(days);
    fetchEvents(days);
  }

  function resetMessage() {
    setMessageTouched(false);
    setMessage(buildMessage(introText, pickerEvents, selectedKeys, eventTemplates, checklistTemplates));
  }

  function openInTelegram() {
    const cleanHandle = handle.trim().replace(/^@/, "");
    if (!cleanHandle) {
      setError("Enter a Telegram handle first.");
      return;
    }
    setError(null);
    const url = `https://t.me/${encodeURIComponent(cleanHandle)}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyOverdueSummary() {
    const text = buildOverdueSummary(openChecklistRows, todayStr());
    if (!text) {
      setOverdueNote("Nothing overdue — all caught up.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setOverdueNote("Copied");
    } catch {
      setOverdueNote("Couldn't copy — your browser blocked clipboard access.");
    }
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setOverdueNote(null), 3000);
  }

  function handleRemoveTemplate(template: ReminderTemplateRow) {
    setDeleteError(null);
    setPendingDelete(template);
  }

  async function handleConfirmRemoveTemplate() {
    if (!pendingDelete) return;
    const template = pendingDelete;
    setRemovingId(template.id);
    try {
      const affected = unwrap(await deleteReminderTemplate(template.id));
      record(`Delete reminder template "${template.name}"`, affected);
      if (selectedId === template.id) {
        setSelectedId("");
        setHandle("");
        setIntroText("");
      }
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Something went wrong deleting this template."
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card padding="p-5" className="flex flex-col gap-4">
        <h2 className="text-title text-ink">Draft a reminder</h2>
        <p className="-mt-2 text-body text-ink-2">
          This never sends anything by itself — it opens Telegram with the message pre-filled so
          you can review and hit send yourself. The target must be a public channel/group/bot
          username.
        </p>

        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Reminder template</span>
            <select
              value={selectedId}
              onChange={(e) => applyTemplate(e.target.value)}
              className={INPUT}
            >
              <option value="">— Freeform (no template) —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Show events in the next (days)</span>
            <input
              type="number"
              min={1}
              value={lookaheadDays}
              onChange={(e) => handleLookaheadChange(Number(e.target.value) || 1)}
              className={INPUT}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Telegram handle</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@tevo_leaders"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Intro text (optional)</span>
          <input
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            placeholder="Please prepare e-invites and confirm pastoral goals for next month."
            className={INPUT}
          />
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className={LABEL}>
              Events to include
              <span className="font-normal text-ink-3"> — ⭐ pre-checked as important</span>
            </span>
            {loadingEvents && <span className="text-micro text-ink-3">Loading…</span>}
          </div>
          <div className="rounded-card border border-line divide-y divide-line max-h-72 overflow-y-auto">
            {pickerEvents.length === 0 && !loadingEvents && (
              <p className="px-4 py-6 text-body text-ink-2 text-center">
                No events in the next {lookaheadDays} days — try widening the range above if you
                expected to see something (e.g. a Christmas/Easter event planned further out).
              </p>
            )}
            {pickerEvents.map((ev) => {
              const timeRange = formatEventTimeRange(ev.startTime, ev.endTime);
              const chosenTemplateId = eventTemplates[ev.occurrenceKey] ?? "";
              return (
                <div key={ev.occurrenceKey} className="px-4 py-2.5 flex flex-col gap-1 hover:bg-canvas">
                  <label className="flex items-start gap-2.5 text-ui cursor-pointer coarse:min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(ev.occurrenceKey)}
                      onChange={() => toggleEvent(ev.occurrenceKey)}
                      className="mt-0.5 shrink-0 coarse:h-5 coarse:w-5"
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {ev.flagged && <span title="Flagged as important">⭐ </span>}
                      {ev.name}
                      <span className="text-ink-2">
                        {" "}
                        — {formatDateDisplay(ev.date)}
                        {timeRange ? ` · ${timeRange}` : ""}
                        {ev.location ? ` · 📍 ${ev.location}` : ""}
                      </span>
                    </span>
                  </label>
                  {selectedKeys.has(ev.occurrenceKey) && (
                    <div className="pl-6 coarse:pl-[30px] flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={chosenTemplateId}
                          onChange={(e) => setEventTemplate(ev.occurrenceKey, e.target.value)}
                          className="min-h-[28px] max-w-full rounded-pill border border-line-strong bg-white px-2.5 text-body"
                        >
                          <option value="">No checklist template</option>
                          {checklistTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        {chosenTemplateId && (
                          <button
                            type="button"
                            onClick={() => setEventTemplate(ev.occurrenceKey, "")}
                            title="Remove this checklist template from the message"
                            aria-label="Remove this checklist template from the message"
                            className="text-ink-3 hover:text-danger leading-none coarse:min-h-[44px] coarse:min-w-[44px]"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {chosenTemplateId &&
                        (() => {
                          const template = checklistTemplates.find((t) => t.id === chosenTemplateId);
                          if (!template) return null;
                          return expandTemplateItems(template).map(({ item: line }, i) => (
                            <div key={i} className="text-body text-ink-2">
                              ☐ {line}
                            </div>
                          ));
                        })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <div className={`${LABEL} flex items-center justify-between`}>
            Message
            {messageTouched && (
              <button type="button" onClick={resetMessage} className="text-body font-medium text-navy hover:underline">
                Reset to auto-generated
              </button>
            )}
          </div>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setMessageTouched(true);
            }}
            rows={10}
            className="w-full rounded-card border border-line-strong bg-canvas px-4 py-3 font-mono text-body text-ink"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
            {error}
          </p>
        )}

        <Button onClick={openInTelegram} className="self-start">
          Open in Telegram
        </Button>
      </Card>

      <Card padding="p-5" className="flex flex-col gap-3">
        <h2 className="text-title text-ink">Overdue checklist items</h2>
        <p className="-mt-1 text-body text-ink-2">
          Copies a plain-text list of open overdue items, grouped by event, to paste wherever you like. Nothing is sent.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={copyOverdueSummary}>
            Copy overdue summary
          </Button>
          <span role="status" aria-live="polite" className="text-body text-ink-2">
            {overdueNote}
          </span>
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-title text-ink">Saved reminder templates</h2>
          <Button size="sm" icon={<PlusIcon className="!h-4 !w-4" />} onClick={() => setTemplateModal({ type: "add" })}>
            Add Template
          </Button>
        </div>
        <div className={TABLE_CARD}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Name</th>
                <th className={TH}>Default handle</th>
                <th className={TH}>Default lookahead</th>
                <th className={`${TH} w-12`}></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setTemplateModal({ type: "edit", template: t })}
                  className={TR}
                >
                  <td className={`${TD} font-medium`}>{t.name}</td>
                  <td className={`${TD} text-ink-2`}>{t.default_telegram_handle ?? "—"}</td>
                  <td className={`${TD} text-ink-2`}>{t.lookahead_days} days</td>
                  <td className={`${TD} text-right`}>
                    <span className={ROW_ACTION}>
                      <IconButton
                        label={`Remove "${t.name}"`}
                        icon={<TrashIcon className="!h-4 !w-4" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTemplate(t);
                        }}
                        disabled={removingId === t.id}
                        className="hover:!text-danger"
                      />
                    </span>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={4} className={EMPTY_CELL}>
                    No saved templates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {templateModal.type !== "closed" && (
        <ReminderTemplateModal
          mode={templateModal.type}
          template={templateModal.type === "edit" ? templateModal.template : undefined}
          onClose={() => setTemplateModal({ type: "closed" })}
          onSaved={() => {
            setTemplateModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setTemplateModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
              message={<>Delete &ldquo;{pendingDelete.name}&rdquo;?</>}
              error={deleteError}
              busy={removingId === pendingDelete.id}
              onClose={() => setPendingDelete(null)}
              onConfirm={handleConfirmRemoveTemplate}
            />
      )}
    </div>
  );
}
