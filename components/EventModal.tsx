"use client";

import { useState, FormEvent } from "react";
import { EventOccurrence, EventRow, EventType, Level, LevelRow, Recurring } from "@/lib/types";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  detachOccurrence,
  splitSeriesFromOccurrence,
  deleteOccurrence,
  EventFormValues,
} from "@/lib/actions";
import { computeDuration, computeEndTime, endsNextDay } from "@/lib/timeMath";
import { PastoralFocus, applyTitlePrefix, stripTitlePrefix } from "@/lib/pastoralFocus";
import ConfirmDialog from "./ConfirmDialog";
import RecurringScopeDialog from "./RecurringScopeDialog";

interface EventModalProps {
  mode: "add" | "edit";
  initialDate?: string;
  event?: EventRow;
  // The specific occurrence being edited — present whenever this modal was
  // opened from a rendered occurrence (calendar, day view, category list).
  // Pre-fills date/time from the occurrence's effective (post-override)
  // values, and is required to resolve "only this event" vs "all future
  // events" when the underlying event is a recurring series.
  occurrence?: EventOccurrence;
  levels: LevelRow[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

type Step = "form" | "editScope" | "deleteScope";

const RECURRING_OPTIONS: Recurring[] = ["None", "Weekly", "Monthly", "Yearly"];

export default function EventModal({
  mode,
  initialDate,
  event,
  occurrence,
  levels,
  onClose,
  onSaved,
  onDeleted,
}: EventModalProps) {
  const [eventType, setEventType] = useState<EventType>(event?.event_type ?? "Event");
  // The Name field always holds the bare title, never the Y/P/U/A prefix —
  // an existing prefix (baked into event.name at save time, see handleSubmit)
  // is stripped back off here so editing doesn't require the user to touch
  // the prefix text directly.
  const [name, setName] = useState(() =>
    event && event.event_type === "Event" ? stripTitlePrefix(event.name) : event?.name ?? ""
  );
  const [pastoralFocus, setPastoralFocus] = useState<PastoralFocus>({
    youth: event?.pastoral_youth ?? false,
    poly: event?.pastoral_poly ?? false,
    uni: event?.pastoral_uni ?? false,
    adults: event?.pastoral_adults ?? false,
  });
  const [series, setSeries] = useState(event?.series ?? "");
  const [preacherName, setPreacherName] = useState(event?.preacher_name ?? "");
  const [sermonTitle, setSermonTitle] = useState(event?.sermon_title ?? "");
  const [theme, setTheme] = useState(event?.theme ?? "");
  const [eventDate, setEventDate] = useState(occurrence?.occurrenceDate ?? event?.event_date ?? initialDate ?? "");
  const [eventTime, setEventTime] = useState(
    (occurrence?.startTime ?? event?.event_time)?.slice(0, 5) ?? ""
  );
  const [endTime, setEndTime] = useState((occurrence?.endTime ?? event?.end_time)?.slice(0, 5) ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    event?.duration_minutes != null ? String(event.duration_minutes) : ""
  );
  const [level, setLevel] = useState<Level>(event?.level ?? levels[0]?.name ?? "");
  const [recurring, setRecurring] = useState<Recurring>(event?.recurring ?? "None");
  const [repeatUntil, setRepeatUntil] = useState(event?.repeat_until ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [pendingValues, setPendingValues] = useState<EventFormValues | null>(null);

  const isRecurringSeries = mode === "edit" && !!event && event.recurring !== "None";
  // Scope choices need to know which specific occurrence was clicked —
  // without it there's nothing to resolve "only this event" against, so
  // callers that can't supply one (there currently are none) fall back to
  // the old whole-series-only behavior.
  const canChooseScope = isRecurringSeries && !!occurrence;
  const wrapsPastMidnight = !!eventTime && !!endTime && endsNextDay(eventTime, endTime);

  // Start/End/Duration stay independently editable at all times — each
  // handler recomputes only the one derived field for that edit, and never
  // touches whichever field the user just typed into.
  function handleStartTimeChange(value: string) {
    setEventTime(value);
    if (value && durationMinutes !== "") {
      const duration = Number(durationMinutes);
      if (!Number.isNaN(duration)) {
        setEndTime(computeEndTime(value, duration));
      }
    }
  }

  function handleDurationChange(value: string) {
    setDurationMinutes(value);
    if (eventTime && value !== "") {
      const duration = Number(value);
      if (!Number.isNaN(duration)) {
        setEndTime(computeEndTime(eventTime, duration));
      }
    }
  }

  function handleEndTimeChange(value: string) {
    setEndTime(value);
    if (eventTime && value) {
      setDurationMinutes(String(computeDuration(eventTime, value)));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!eventDate) {
      setFormError("Date is required.");
      return;
    }

    const baseName = name.trim();
    const values: EventFormValues = {
      name: eventType === "Event" ? applyTitlePrefix(baseName, pastoralFocus) : baseName,
      event_date: eventDate,
      event_time: eventTime || null,
      end_time: endTime || null,
      duration_minutes: durationMinutes !== "" ? Number(durationMinutes) : null,
      level,
      recurring,
      repeat_until: recurring === "None" ? null : repeatUntil || null,
      notes: notes.trim() || null,
      event_type: eventType,
      pastoral_youth: eventType === "Event" && pastoralFocus.youth,
      pastoral_poly: eventType === "Event" && pastoralFocus.poly,
      pastoral_uni: eventType === "Event" && pastoralFocus.uni,
      pastoral_adults: eventType === "Event" && pastoralFocus.adults,
      series: eventType === "Gathering" ? series.trim() || null : null,
      preacher_name: eventType === "Gathering" ? preacherName.trim() || null : null,
      sermon_title: eventType === "Gathering" ? sermonTitle.trim() || null : null,
      theme: eventType === "Gathering" ? theme.trim() || null : null,
    };

    if (canChooseScope) {
      setPendingValues(values);
      setStep("editScope");
      return;
    }

    setSaving(true);
    try {
      if (mode === "add") {
        await createEvent(values);
      } else if (event) {
        await updateEvent(event.id, values);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this event.");
      setSaving(false);
    }
  }

  async function handleEditScope(scope: "only" | "future") {
    if (!pendingValues || !event || !occurrence) return;
    setSaving(true);
    setFormError(null);
    try {
      if (scope === "only") {
        await detachOccurrence(event, occurrence.originalDate, pendingValues);
      } else {
        await splitSeriesFromOccurrence(event, occurrence.originalDate, pendingValues);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this event.");
      setSaving(false);
    }
  }

  function handleDeleteClick() {
    if (canChooseScope) {
      setStep("deleteScope");
    } else {
      setConfirmDelete(true);
    }
  }

  async function handleDeleteOnlyThis() {
    if (!event || !occurrence) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteOccurrence(event, occurrence.originalDate);
      onDeleted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong deleting this event.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteEvent(event.id);
      onDeleted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong deleting this event.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-navy mb-1">
          {mode === "add" ? "Add Event" : "Edit Event"}
        </h2>
        {isRecurringSeries && step === "form" && !confirmDelete && (
          <p className="text-xs text-gray-500 mb-3">
            {canChooseScope
              ? "This is part of a recurring series — you'll be asked whether changes apply to just this event or this and future ones."
              : "Editing the recurring pattern — changes apply to the whole series, not just one occurrence."}
          </p>
        )}

        {confirmDelete ? (
          <ConfirmDialog
            message={
              isRecurringSeries ? (
                <>
                  <strong className="text-red-600">
                    This will delete all occurrences of this recurring event
                  </strong>{" "}
                  — the entire &ldquo;{event?.name}&rdquo; series ({event?.recurring}), not just
                  one date. This can&apos;t be undone.
                </>
              ) : (
                <>Delete &ldquo;{event?.name}&rdquo;? This can&apos;t be undone.</>
              )
            }
            error={formError}
            busy={saving}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        ) : step === "editScope" ? (
          <RecurringScopeDialog
            title={`Apply this change to just “${name}” on ${eventDate}, or to this and all future occurrences?`}
            optionALabel="Only this event"
            optionADescription="Pulls this one occurrence out on its own — the rest of the series is unaffected."
            optionBLabel="This and all future events"
            optionBDescription="Occurrences before this date keep their old values; this one and everything after gets the new ones."
            busy={saving}
            error={formError}
            onCancel={() => setStep("form")}
            onChooseA={() => handleEditScope("only")}
            onChooseB={() => handleEditScope("future")}
          />
        ) : step === "deleteScope" ? (
          <RecurringScopeDialog
            title="Delete just this occurrence, or the whole recurring series?"
            optionALabel="Only this event"
            optionADescription="Removes just this occurrence — the rest of the series is unaffected."
            optionBLabel="The whole series"
            optionBDescription={`Deletes every occurrence of "${event?.name}" (${event?.recurring}). This can't be undone.`}
            optionBDanger
            busy={saving}
            error={formError}
            onCancel={() => setStep("form")}
            onChooseA={handleDeleteOnlyThis}
            onChooseB={() => {
              setStep("form");
              setConfirmDelete(true);
            }}
          />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 text-sm">
              Type
              <div className="flex gap-2">
                {(["Event", "Gathering"] as EventType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEventType(t)}
                    className={[
                      "flex-1 px-3 py-1.5 rounded border text-sm",
                      eventType === t
                        ? "bg-navy text-white border-navy"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
            </label>

            {eventType === "Event" ? (
              <div className="flex flex-col gap-1 text-sm">
                Pastoral Focus
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ["youth", "Youth"],
                      ["poly", "Poly"],
                      ["uni", "Uni"],
                      ["adults", "Adults"],
                    ] as Array<[keyof PastoralFocus, string]>
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5 text-sm font-normal">
                      <input
                        type="checkbox"
                        checked={pastoralFocus[key]}
                        onChange={(e) =>
                          setPastoralFocus((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <span className="text-xs text-gray-400">
                  Adds a prefix to the saved title, e.g. Youth + Poly checked saves as
                  &ldquo;YP: {name || "…"}&rdquo;.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Series
                  <input
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    className="border rounded px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Preacher Name
                  <input
                    value={preacherName}
                    onChange={(e) => setPreacherName(e.target.value)}
                    className="border rounded px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Sermon Title
                  <input
                    value={sermonTitle}
                    onChange={(e) => setSermonTitle(e.target.value)}
                    className="border rounded px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Theme
                  <input
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="border rounded px-2 py-1"
                  />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Date
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="border rounded px-2 py-1"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Time
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="border rounded px-2 py-1"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                End time
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className="border rounded px-2 py-1"
                />
                {wrapsPastMidnight && (
                  <span className="text-xs text-gray-500">(next day)</span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Duration (min)
                <input
                  type="number"
                  min={0}
                  value={durationMinutes}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="border rounded px-2 py-1"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Level
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                className="border rounded px-2 py-1"
              >
                {levels.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Recurring
                <select
                  value={recurring}
                  onChange={(e) => setRecurring(e.target.value as Recurring)}
                  className="border rounded px-2 py-1"
                >
                  {RECURRING_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {canChooseScope && (
                  <span className="text-xs text-gray-400">
                    Only used if you choose &ldquo;this and all future events&rdquo; when saving.
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Repeat until
                <input
                  type="date"
                  value={repeatUntil ?? ""}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  disabled={recurring === "None"}
                  className="border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border rounded px-2 py-1"
                rows={2}
              />
            </label>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center justify-between mt-2">
              <div>
                {mode === "edit" && (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 text-sm rounded bg-navy text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
