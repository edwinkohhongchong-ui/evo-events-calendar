"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUndo } from "@/lib/undo/UndoProvider";
import { deleteReminderTemplate } from "@/lib/reminderTemplateActions";
import { ReminderTemplateRow } from "@/lib/types";
import { toDateStr } from "@/lib/dates";
import ReminderTemplateModal from "./ReminderTemplateModal";

interface RemindersFormProps {
  templates: ReminderTemplateRow[];
}

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; template: ReminderTemplateRow };

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default function RemindersForm({ templates }: RemindersFormProps) {
  const router = useRouter();
  const { record } = useUndo();
  const [selectedId, setSelectedId] = useState<string>("");
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function applyTemplate(id: string) {
    setSelectedId(id);
    setError(null);
    const template = templates.find((t) => t.id === id);
    if (!template) {
      setHandle("");
      setMessage("");
      return;
    }

    setHandle(template.default_telegram_handle ?? "");

    if (!template.include_event_summary) {
      setMessage(template.default_message ?? "");
      return;
    }

    setLoadingSummary(true);
    try {
      const start = toDateStr(new Date());
      const end = toDateStr(addDays(new Date(), template.lookahead_days));
      const res = await fetch(`/api/reminders/summary?start=${start}&end=${end}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't load the upcoming events summary.");
      const intro = template.default_message?.trim();
      setMessage(intro ? `${intro}\n\n${data.summary}` : data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the upcoming events summary.");
      setMessage(template.default_message ?? "");
    } finally {
      setLoadingSummary(false);
    }
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

  async function handleRemoveTemplate(template: ReminderTemplateRow) {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    setRemovingId(template.id);
    try {
      const affected = await deleteReminderTemplate(template.id);
      record(`Delete reminder template "${template.name}"`, affected);
      if (selectedId === template.id) {
        setSelectedId("");
        setHandle("");
        setMessage("");
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Something went wrong deleting this template.");
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

        <label className="flex flex-col gap-1 text-sm">
          Template
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
          Telegram handle
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@tevo_leaders"
            className="border rounded px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            placeholder={loadingSummary ? "Loading upcoming events…" : "Your message…"}
            className="border rounded px-2 py-1 font-mono text-xs"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={openInTelegram}
          disabled={loadingSummary}
          className="self-start px-3 py-1.5 text-sm rounded bg-navy text-white disabled:opacity-50"
        >
          Open in Telegram
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy">Saved templates</h2>
          <button
            type="button"
            onClick={() => setModal({ type: "add" })}
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
                <th className="px-3 py-2">Event summary</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setModal({ type: "edit", template: t })}
                  className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2 text-gray-600">{t.default_telegram_handle ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {t.include_event_summary ? `Next ${t.lookahead_days} days` : "No"}
                  </td>
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

      {modal.type !== "closed" && (
        <ReminderTemplateModal
          mode={modal.type}
          template={modal.type === "edit" ? modal.template : undefined}
          onClose={() => setModal({ type: "closed" })}
          onSaved={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
