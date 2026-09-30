"use client";

import { useState, FormEvent } from "react";
import { EventOccurrence, EventRow, EventType, GatheringType, Level, LevelRow, Recurring } from "@/lib/types";
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
import { formatDateDisplay, formatEventTimeRange } from "@/lib/dates";
import { PastoralFocus, applyTitlePrefix, stripTitlePrefix } from "@/lib/pastoralFocus";
import { CHURCHWIDE_LEVEL_NAME, GATHERING_TYPES, TG_LEVEL_NAME, ZONE_LEVEL_NAMES } from "@/lib/constants";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { useEscapeKey } from "@/lib/useEscapeKey";
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

type Step = "view" | "form" | "editScope" | "deleteScope";

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
  const { record } = useUndo();
  const isEditor = useIsEditor();
  const [eventType, setEventType] = useState<EventType>(event?.event_type ?? "Event");
  // The Name field always holds the bare title, never the Y/P/U/A prefix —
  // an existing prefix (baked into event.name at save time, see handleSubmit)
  // is stripped back off here so editing doesn't require the user to touch
  // the prefix text directly.
  const [name, setName] = useState(() =>
    event && event.event_type === "Event" ? stripTitlePrefix(event.name) : event?.name ?? ""
  );
  // Once the user types into Name directly, stop overwriting it when
  // Gathering Type or Preacher Name change — an existing event's name
  // counts as already "touched" (never overridden just by opening the
  // form). Mirrors the same pattern used for Season/Level color suggestion.
  const [nameTouched, setNameTouched] = useState(!!event);
  const [pastoralFocus, setPastoralFocus] = useState<PastoralFocus>({
    youth: event?.pastoral_youth ?? false,
    poly: event?.pastoral_poly ?? false,
    uni: event?.pastoral_uni ?? false,
    adults: event?.pastoral_adults ?? false,
  });
  const [gatheringType, setGatheringType] = useState<GatheringType>(
    event?.gathering_type ?? GATHERING_TYPES[0]
  );
  const [series, setSeries] = useState(event?.series ?? "");
  const [preacherName, setPreacherName] = useState(event?.preacher_name ?? "");
  const [sermonTitle, setSermonTitle] = useState(event?.sermon_title ?? "");
  const [theme, setTheme] = useState(event?.theme ?? "");
  const [eventDate, setEventDate] = useState(occurrence?.occurrenceDate ?? event?.event_date ?? initialDate ?? "");
  // Blank means single-day. Pre-filled from the occurrence's effective span
  // (post drag-to-resize), falling back to the base event's own end_date.
  const [endDate, setEndDate] = useState(() => {
    const effective = occurrence?.spanEndDate ?? event?.end_date ?? "";
    return effective && effective !== (occurrence?.occurrenceDate ?? event?.event_date) ? effective : "";
  });
  const [eventTime, setEventTime] = useState(
    (occurrence?.startTime ?? event?.event_time)?.slice(0, 5) ?? ""
  );
  const [endTime, setEndTime] = useState((occurrence?.endTime ?? event?.end_time)?.slice(0, 5) ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    event?.duration_minutes != null ? String(event.duration_minutes) : ""
  );
  // Blank (not levels[0]) for a brand-new event — an unset category is more
  // honest than silently pre-selecting whichever category happens to sort
  // first, which a leader could easily save without ever noticing (see
  // Pastor review finding #1).
  const [level, setLevel] = useState<Level>(event?.level ?? "");
  // Tracks that "Zone" was clicked as the top-level category while no
  // specific zone Level has been chosen yet (level stays "" in that state —
  // see handleEventTypeCategoryChange/Bug 1 fix). Needed because
  // topCategoryFor("") can't tell "Zone, undecided" apart from "nothing
  // picked yet"; this flag disambiguates purely for display/validation.
  const [zonePickedWithoutLevel, setZonePickedWithoutLevel] = useState(false);
  const [location, setLocation] = useState(event?.location ?? "");
  const [recurring, setRecurring] = useState<Recurring>(event?.recurring ?? "None");
  const [repeatUntil, setRepeatUntil] = useState(event?.repeat_until ?? "");
  // Gate for saving a recurring event with no Repeat Until — forces an
  // explicit "yes, forever" choice instead of silently defaulting to
  // indefinite recurrence (see Pastor review finding — mirrors the same
  // "force an explicit choice" pattern as the Zone picker below). Purely a
  // client-side confirmation; nothing is persisted for this.
  const [acknowledgeNoEndDate, setAcknowledgeNoEndDate] = useState(false);
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Clicking an occurrence opens straight into a read-only "confirmed
  // values" view — editing is a deliberate extra step (the Edit button),
  // not the default. Adding a brand new event has nothing to view yet, so
  // it goes straight to the form.
  const [step, setStep] = useState<Step>(mode === "edit" ? "view" : "form");
  const [pendingValues, setPendingValues] = useState<EventFormValues | null>(null);

  useEscapeKey(onClose);

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

  function handleNameChange(value: string) {
    setName(value);
    setNameTouched(true);
  }

  // "Gathering with Edwin Koh" — Gathering Type alone if no preacher is set
  // yet. Only auto-applied while the user hasn't typed into Name directly.
  function autoGatheringName(type: GatheringType, preacher: string): string {
    return preacher.trim() ? `${type} with ${preacher.trim()}` : type;
  }

  function handleGatheringTypeChange(type: GatheringType) {
    setGatheringType(type);
    if (!nameTouched) {
      setName(autoGatheringName(type, preacherName));
    }
  }

  function handlePreacherNameChange(value: string) {
    setPreacherName(value);
    if (!nameTouched) {
      setName(autoGatheringName(gatheringType, value));
    }
  }

  // The three-way Churchwide/Zone/TG picker (Event type only — Gatherings
  // keep their own flat Level dropdown, unchanged) is a grouping over the
  // same underlying `level` field, not a separate one — derived from its
  // current value rather than tracked as its own state, so there's only
  // ever one source of truth for which Level is actually selected.
  function topCategoryFor(levelName: string): "Churchwide" | "Zone" | "TG" | "" {
    if (!levelName) return "";
    if (levelName === CHURCHWIDE_LEVEL_NAME) return "Churchwide";
    if (levelName === TG_LEVEL_NAME) return "TG";
    return "Zone";
  }

  // Like topCategoryFor, but also reports "Zone" while the user has clicked
  // Zone as the top category yet hasn't picked a specific zone Level yet
  // (level is still "" in that state) — topCategoryFor("") alone can't
  // distinguish "Zone, undecided" from "nothing picked at all".
  function displayCategoryFor(levelName: string): "Churchwide" | "Zone" | "TG" | "" {
    const cat = topCategoryFor(levelName);
    if (cat) return cat;
    return zonePickedWithoutLevel ? "Zone" : "";
  }

  function handleEventTypeCategoryChange(category: "Churchwide" | "Zone" | "TG") {
    if (category === "Churchwide") {
      setZonePickedWithoutLevel(false);
      setLevel(CHURCHWIDE_LEVEL_NAME);
    } else if (category === "TG") {
      setZonePickedWithoutLevel(false);
      setLevel(TG_LEVEL_NAME);
    } else if (!ZONE_LEVEL_NAMES.includes(level)) {
      // Zone: do NOT auto-select whichever zone Level happens to sort
      // first — leave the choice unset and force the user to explicitly
      // open the sub-dropdown and pick one (see Bug 1 fix). If a zone
      // Level is already selected (e.g. editing an existing event), leave
      // it as-is.
      setLevel("");
      setZonePickedWithoutLevel(true);
    }
  }

  // What actually gets saved, shown so a mistake is caught before Save
  // rather than after — same title-prefix logic handleSubmit uses, not a
  // separate approximation of it.
  function previewLines(): string[] {
    const baseName = name.trim() || "…";
    const titleLine = eventType === "Event" ? applyTitlePrefix(baseName, pastoralFocus) : baseName;
    const lines = [titleLine];

    if (eventType === "Gathering") {
      const subtitle = [series.trim(), sermonTitle.trim()].filter(Boolean).join(" — ");
      if (subtitle) lines.push(subtitle);
    }

    const timeLine = formatEventTimeRange(eventTime ? `${eventTime}:00` : null, endTime ? `${endTime}:00` : null);
    if (timeLine) lines.push(timeLine);

    return lines;
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
    if (!level) {
      if (eventType === "Event" && zonePickedWithoutLevel) {
        setFormError("Choose a zone.");
      } else {
        setFormError(eventType === "Event" ? "Choose an Event Type." : "Choose a Level.");
      }
      return;
    }
    if (recurring !== "None" && !repeatUntil && !acknowledgeNoEndDate) {
      setFormError("Set a Repeat Until date, or confirm this repeats with no end date.");
      return;
    }

    const baseName = name.trim();
    const values: EventFormValues = {
      name: eventType === "Event" ? applyTitlePrefix(baseName, pastoralFocus) : baseName,
      event_date: eventDate,
      end_date: endDate && endDate !== eventDate ? endDate : null,
      event_time: eventTime || null,
      end_time: endTime || null,
      duration_minutes: durationMinutes !== "" ? Number(durationMinutes) : null,
      level,
      location: location.trim() || null,
      recurring,
      repeat_until: recurring === "None" ? null : repeatUntil || null,
      notes: notes.trim() || null,
      event_type: eventType,
      pastoral_youth: eventType === "Event" && pastoralFocus.youth,
      pastoral_poly: eventType === "Event" && pastoralFocus.poly,
      pastoral_uni: eventType === "Event" && pastoralFocus.uni,
      pastoral_adults: eventType === "Event" && pastoralFocus.adults,
      gathering_type: eventType === "Gathering" ? gatheringType : null,
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
        const affected = await createEvent(values);
        record(`Add "${values.name}"`, affected);
      } else if (event) {
        const affected = await updateEvent(event.id, values);
        record(`Edit "${values.name}"`, affected);
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
        const affected = await detachOccurrence(event, occurrence.originalDate, pendingValues);
        record(`Edit "${pendingValues.name}" (only this event)`, affected);
      } else {
        const affected = await splitSeriesFromOccurrence(event, occurrence.originalDate, pendingValues);
        record(`Edit "${pendingValues.name}" (this and future events)`, affected);
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
      const affected = await deleteOccurrence(event, occurrence.originalDate);
      record(`Delete "${event.name}" (only this event)`, affected);
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
      const affected = await deleteEvent(event.id);
      record(`Delete "${event.name}"`, affected);
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
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-navy mb-1">
          {mode === "add" ? "Add Event" : step === "view" ? "Event Details" : "Edit Event"}
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
                  one date.
                </>
              ) : (
                <>Delete &ldquo;{event?.name}&rdquo;?</>
              )
            }
            error={formError}
            busy={saving}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        ) : step === "view" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600">
                {eventType}
              </span>
              {level && (
                <span className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600">
                  {level}
                </span>
              )}
            </div>
            <div className="text-base font-medium text-navy">{name}</div>
            <div className="text-sm text-gray-700 flex flex-col gap-1">
              <div>
                {formatDateDisplay(eventDate)}
                {endDate && endDate !== eventDate && <> – {formatDateDisplay(endDate)}</>}
              </div>
              {(eventTime || endTime) && (
                <div>
                  {formatEventTimeRange(
                    eventTime ? `${eventTime}:00` : null,
                    endTime ? `${endTime}:00` : null
                  )}
                </div>
              )}
              {recurring !== "None" && (
                <div>
                  Repeats {recurring}
                  {repeatUntil ? ` until ${formatDateDisplay(repeatUntil)}` : ""}
                </div>
              )}
              {location && <div>📍 {location}</div>}
            </div>
            {eventType === "Event" &&
              (pastoralFocus.youth || pastoralFocus.poly || pastoralFocus.uni || pastoralFocus.adults) && (
                <div className="text-sm text-gray-700">
                  <span className="text-gray-400">Pastoral Focus:</span>{" "}
                  {[
                    pastoralFocus.youth && "Youth",
                    pastoralFocus.poly && "Poly",
                    pastoralFocus.uni && "Uni",
                    pastoralFocus.adults && "Adults",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
            {eventType === "Gathering" && (series || preacherName || sermonTitle || theme) && (
              <div className="text-sm text-gray-700 flex flex-col gap-0.5">
                {series && (
                  <div>
                    <span className="text-gray-400">Series:</span> {series}
                  </div>
                )}
                {preacherName && (
                  <div>
                    <span className="text-gray-400">Preacher:</span> {preacherName}
                  </div>
                )}
                {sermonTitle && (
                  <div>
                    <span className="text-gray-400">Sermon:</span> {sermonTitle}
                  </div>
                )}
                {theme && (
                  <div>
                    <span className="text-gray-400">Theme:</span> {theme}
                  </div>
                )}
              </div>
            )}
            {notes && (
              <div className="text-sm text-gray-700 whitespace-pre-wrap">
                <span className="text-gray-400">Notes:</span> {notes}
              </div>
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center justify-between mt-2">
              <div>
                {isEditor && (
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
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="px-3 py-1.5 text-sm rounded bg-navy text-white"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
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
            optionBDescription={`Deletes every occurrence of "${event?.name}" (${event?.recurring}).`}
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
                    onClick={() => {
                      setEventType(t);
                      if (t === "Gathering" && !nameTouched) {
                        setName(autoGatheringName(gatheringType, preacherName));
                      }
                    }}
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
            {eventType === "Gathering" && (
              <label className="flex flex-col gap-1 text-sm">
                Gathering Type
                <select
                  value={gatheringType}
                  onChange={(e) => handleGatheringTypeChange(e.target.value as GatheringType)}
                  className="border rounded px-2 py-1"
                >
                  {GATHERING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            )}

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
                  Adds a prefix to the Name field below, e.g. Youth + Poly checked saves as
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
                    onChange={(e) => handlePreacherNameChange(e.target.value)}
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

            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
              {eventType === "Gathering" && (
                <span className="text-xs text-gray-400 font-normal">
                  Auto-filled from Gathering Type and Preacher Name above — edit only if necessary.
                </span>
              )}
            </label>

            {eventType === "Event" ? (
              <div className="flex flex-col gap-1 text-sm">
                Event Type
                <div className="flex gap-2">
                  {(["Churchwide", "Zone", "TG"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleEventTypeCategoryChange(cat)}
                      className={[
                        "flex-1 px-3 py-1.5 rounded border text-sm",
                        displayCategoryFor(level) === cat
                          ? "bg-navy text-white border-navy"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {displayCategoryFor(level) === "Zone" && (
                  <select
                    value={level}
                    onChange={(e) => {
                      setLevel(e.target.value as Level);
                      setZonePickedWithoutLevel(false);
                    }}
                    className="border rounded px-2 py-1"
                  >
                    {!level && (
                      <option value="" disabled>
                        — Select zone —
                      </option>
                    )}
                    {levels
                      .filter((l) => ZONE_LEVEL_NAMES.includes(l.name))
                      .map((l) => (
                        <option key={l.id} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                Level
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as Level)}
                  className="border rounded px-2 py-1"
                >
                  {!level && (
                    <option value="" disabled>
                      — Select —
                    </option>
                  )}
                  {levels.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
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
            <label className="flex flex-col gap-1 text-sm">
              End Date <span className="text-gray-400 font-normal">(optional — makes this a multi-day event)</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={eventDate || undefined}
                className="border rounded px-2 py-1"
              />
            </label>
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
              Location <span className="text-gray-400 font-normal">(optional)</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Main Hall"
                className="border rounded px-2 py-1"
              />
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
                  onChange={(e) => {
                    setRepeatUntil(e.target.value);
                    if (e.target.value) setAcknowledgeNoEndDate(false);
                  }}
                  disabled={recurring === "None"}
                  className="border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-400"
                />
                {recurring !== "None" && !repeatUntil && (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-xs text-amber-600 font-normal">
                      ⚠ No end date — this event will repeat forever until removed.
                    </span>
                    <label className="flex items-center gap-1.5 text-xs font-normal text-gray-600">
                      <input
                        type="checkbox"
                        checked={acknowledgeNoEndDate}
                        onChange={(e) => setAcknowledgeNoEndDate(e.target.checked)}
                      />
                      No end date — this repeats indefinitely
                    </label>
                  </div>
                )}
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

            <div className="border border-gray-200 rounded-md p-3 bg-gray-50 flex flex-col gap-0.5">
              <span className="text-xs font-medium text-gray-400">Preview</span>
              {previewLines().map((line, i) => (
                <span
                  key={i}
                  className={i === 0 ? "text-sm font-semibold text-navy" : "text-xs text-gray-500"}
                >
                  {line}
                </span>
              ))}
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center justify-between mt-2">
              <div>
                {mode === "edit" && isEditor && (
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
                  onClick={() => (mode === "edit" ? setStep("view") : onClose())}
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
