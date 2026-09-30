"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUndo } from "@/lib/undo/UndoProvider";
import { deleteReminderTemplate } from "@/lib/reminderTemplateActions";
import { ChecklistTemplateWithItems, ReminderTemplateRow } from "@/lib/types";
import { ReminderPickerEvent } from "@/lib/data";
import { toDateStr, formatDateDisplay, formatEventTimeRange } from "@/lib/dates";
import ReminderTemplateModal from "./ReminderTemplateModal";
import ConfirmDialog from "./ConfirmDialog";

interface RemindersFormProps {
  templates: ReminderTemplateRow[];
  checklistTemplates: ChecklistTemplateWithItems[];
}

type TemplateModalState = { type: "closed" } | { type: "add" } | { type: "edit"; template: ReminderTemplateRow };

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Expands a checklist template's items by their repeat_count into plain
// text lines (e.g. a weekly check-in ×4 becomes 4 separately numbered
// lines) — message-composition only, no relation to the real `checklist`
// table.
function expandChecklistTemplate(template: ChecklistTemplateWithItems): string[] {
  const lines: string[] = [];
  for (const item of template.items) {
    const count = item.repeat_count ?? 1;
    for (let i = 1; i <= count; i++) {
      lines.push(count > 1 ? `${item.item} — Week ${i} of ${count}` : item.item);
    }
  }
  return lines;
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
      for (const line of expandChecklistTemplate(template)) {
        lines.push(`  ☐ ${line}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export default function RemindersForm({ templates, checklistTemplates }: RemindersFormProps) {
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

  const fetchEvents = useCallback(async (days: number) => {
    setLoadingEvents(true);
    setError(null);
    try {
      const start = toDateStr(new Date());
      const end = toDateStr(addDays(new Date(), days));
      const res = await fetch(`/api/reminders/events?start=${start}&end=${end}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't load upcoming events.");
      const events: ReminderPickerEvent[] = data.events;
      setPickerEvents(events);
      setSelectedKeys(new Set(events.filter((e) => e.flagged).map((e) => e.occurrenceKey)));
      setEventTemplates({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load upcoming events.");
      setPickerEvents([]);
      setSelectedKeys(new Set());
    } finally {
      setLoadingEvents(false);
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

  function handleRemoveTemplate(template: ReminderTemplateRow) {
    setDeleteError(null);
    setPendingDelete(template);
  }

  async function handleConfirmRemoveTemplate() {
    if (!pendingDelete) return;
    const template = pendingDelete;
    setRemovingId(template.id);
    try {
      const affected = await deleteReminderTemplate(template.id);
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
      <div className="border border-gray-200 rounded-md p-4 flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Draft a reminder</h2>
        <p className="text-xs text-gray-500 -mt-2">
          This never sends anything by itself — it opens Telegram with the message pre-filled so
          you can review and hit send yourself. The target must be a public channel/group/bot
          username.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Reminder template
            <select
              value={selectedId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option value="">— Freeform (no template) —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Show events in the next (days)
            <input
              type="number"
              min={1}
              value={lookaheadDays}
              onChange={(e) => handleLookaheadChange(Number(e.target.value) || 1)}
              className="border rounded px-2 py-1"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Telegram handle
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@tevo_leaders"
            className="border rounded px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Intro text (optional)
          <input
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            placeholder="Please prepare e-invites and confirm pastoral goals for next month."
            className="border rounded px-2 py-1"
          />
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm">
              Events to include
              <span className="text-gray-400 font-normal"> — ⭐ pre-checked as important</span>
            </span>
            {loadingEvents && <span className="text-xs text-gray-400">Loading…</span>}
          </div>
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {pickerEvents.length === 0 && !loadingEvents && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">
                No events in the next {lookaheadDays} days — try widening the range above if you
                expected to see something (e.g. a Christmas/Easter event planned further out).
              </p>
            )}
            {pickerEvents.map((ev) => {
              const timeRange = formatEventTimeRange(ev.startTime, ev.endTime);
              const chosenTemplateId = eventTemplates[ev.occurrenceKey] ?? "";
              return (
                <div key={ev.occurrenceKey} className="px-3 py-2 flex flex-col gap-1">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(ev.occurrenceKey)}
                      onChange={() => toggleEvent(ev.occurrenceKey)}
                      className="mt-0.5"
                    />
                    <span className="flex-1">
                      {ev.flagged && <span title="Flagged as important">⭐ </span>}
                      {ev.name}
                      <span className="text-gray-400">
                        {" "}
                        — {formatDateDisplay(ev.date)}
                        {timeRange ? ` · ${timeRange}` : ""}
                        {ev.location ? ` · 📍 ${ev.location}` : ""}
                      </span>
                    </span>
                  </label>
                  {selectedKeys.has(ev.occurrenceKey) && (
                    <div className="pl-6 flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={chosenTemplateId}
                          onChange={(e) => setEventTemplate(ev.occurrenceKey, e.target.value)}
                          className="border rounded px-1.5 py-0.5 text-xs"
                        >
                          <option value="">No message snippet</option>
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
                            title="Remove this message snippet from the message"
                            className="text-gray-300 hover:text-red-600 leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {chosenTemplateId &&
                        (() => {
                          const template = checklistTemplates.find((t) => t.id === chosenTemplateId);
                          if (!template) return null;
                          return expandChecklistTemplate(template).map((line, i) => (
                            <div key={i} className="text-xs text-gray-600">
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

        <label className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between">
            Message
            {messageTouched && (
              <button type="button" onClick={resetMessage} className="text-xs text-navy hover:underline">
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
            className="border rounded px-2 py-1 font-mono text-xs"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={openInTelegram}
          className="self-start px-3 py-1.5 text-sm rounded bg-navy text-white"
        >
          Open in Telegram
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy">Saved reminder templates</h2>
          <button
            type="button"
            onClick={() => setTemplateModal({ type: "add" })}
            className="px-3 py-1.5 text-sm rounded bg-navy text-white"
          >
            Add Template
          </button>
        </div>
        <div className="border border-gray-200 rounded-md overflow-hidden overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Default handle</th>
                <th className="px-3 py-2">Default lookahead</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setTemplateModal({ type: "edit", template: t })}
                  className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2 text-gray-600">{t.default_telegram_handle ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{t.lookahead_days} days</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTemplate(t);
                      }}
                      disabled={removingId === t.id}
                      title={`Remove "${t.name}"`}
                      className="text-gray-300 hover:text-red-600 disabled:opacity-30 leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
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
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <ConfirmDialog
              message={<>Delete &ldquo;{pendingDelete.name}&rdquo;?</>}
              error={deleteError}
              busy={removingId === pendingDelete.id}
              onCancel={() => setPendingDelete(null)}
              onConfirm={handleConfirmRemoveTemplate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
