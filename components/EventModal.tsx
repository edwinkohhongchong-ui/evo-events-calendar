"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChecklistTemplateWithItems, EventOccurrence, EventRow, EventType, GatheringType, Level, LevelRow, Recurring } from "@/lib/types";
import { applyChecklistTemplate, getChecklistTemplateOptions } from "@/lib/eventChecklistActions";
import { SUGGESTED_TEMPLATE_BY_GATHERING_TYPE } from "@/lib/eventChecklist";
import {
  createEvent,
  updateEvent,
  getEventById,
  deleteEvent,
  detachOccurrence,
  splitSeriesFromOccurrence,
  deleteOccurrence,
  EventFormValues,
} from "@/lib/actions";
import { unwrap } from "@/lib/actionResult";
import { isEventConflict } from "@/lib/eventConflict";
import { computeDuration, computeEndTime, endsNextDay } from "@/lib/timeMath";
import { formatDateDisplay, formatEventTimeRange } from "@/lib/dates";
import { PastoralFocus, applyTitlePrefix, stripTitlePrefix } from "@/lib/pastoralFocus";
import { GATHERING_TYPES, ZONE_LEVEL_NAMES } from "@/lib/constants";
import { displayCategoryFor as displayCategory, eventTypeButtonNames, zoneLevelsOf } from "@/lib/quickAdd";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";
import ModalShell from "./ui/ModalShell";
import { INPUT, LABEL, TEXTAREA } from "./ui/fieldStyles";
import Button from "./ui/Button";
import Pill from "./ui/Pill";
import { CheckSquareIcon, ChevronIcon, MapPinIcon, RepeatIcon, StickyNoteIcon, ClockIcon } from "./icons";
import { useLevelColor } from "@/lib/levelColorContext";
import { LEVEL_DOT_CLASSES } from "@/lib/constants";
import RecurringScopeDialog from "./RecurringScopeDialog";
import EventChecklist from "./EventChecklist";

interface EventModalProps {
  mode: "add" | "edit";
  initialDate?: string;
  // Pre-fill for a new event handed over from the quick-add popover.
  initialName?: string;
  initialTime?: string;
  initialLevel?: string;
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


function CategoryDot({ levelName }: { levelName: string }) {
  const color = useLevelColor(levelName);
  return <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT_CLASSES[color]}`} aria-hidden="true" />;
}

// Segmented-control button used for Type and Event Type.
function Seg({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex min-h-[36px] min-w-0 flex-1 items-center whitespace-nowrap justify-center gap-1.5 rounded-pill px-3 text-body font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-navy text-white" : "bg-fill text-ink hover:bg-line",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

type EventModalInnerProps = EventModalProps & {
  /** Edit mode, Editors only: reopen as an Add form pre-filled from this event. */
  onDuplicate?: (source: EventRow) => void;
  /** Add form pre-filled from an existing event: no checklist template pre-selected. */
  isDuplicate?: boolean;
  /** Edit conflict: fetch the latest event and remount with it. */
  onReload?: (eventId: string) => Promise<void>;
};

// "Duplicate" swaps the edit modal for an Add form pre-filled from the
// event (no id, so Save goes through the normal createEvent path). Overrides
// and exceptions are deliberately not copied: only the event row's own fields.
export default function EventModal(props: EventModalProps) {
  const router = useRouter();
  const [duplicateOf, setDuplicateOf] = useState<EventRow | null>(null);
  // After an edit conflict, "Reload" swaps in the latest row (and drops the
  // clicked occurrence, whose times may be stale) by remounting the modal.
  const [reloaded, setReloaded] = useState<{ event: EventRow; n: number } | null>(null);

  async function reload(eventId: string) {
    const fresh = unwrap(await getEventById(eventId));
    router.refresh();
    if (!fresh) {
      props.onDeleted();
      return;
    }
    setReloaded((r) => ({ event: fresh, n: (r?.n ?? 0) + 1 }));
  }

  if (duplicateOf) {
    return (
      <EventModalInner
        key="duplicate"
        {...props}
        mode="add"
        event={duplicateOf}
        occurrence={undefined}
        initialDate={duplicateOf.event_date}
        isDuplicate
      />
    );
  }
  return (
    <EventModalInner
      key={reloaded?.n ?? 0}
      {...props}
      event={reloaded?.event ?? props.event}
      occurrence={reloaded ? undefined : props.occurrence}
      onDuplicate={setDuplicateOf}
      onReload={reload}
    />
  );
}

function EventModalInner({
  mode,
  initialDate,
  initialName,
  initialTime,
  initialLevel,
  event,
  occurrence,
  levels,
  onClose,
  onSaved,
  onDeleted,
  onDuplicate,
  isDuplicate = false,
  onReload,
}: EventModalInnerProps) {
  const { record } = useUndo();
  const isEditor = useIsEditor();
  const [eventType, setEventType] = useState<EventType>(event?.event_type ?? "Event");
  // The Name field always holds the bare title, never the Y/P/U/A prefix —
  // an existing prefix (baked into event.name at save time, see handleSubmit)
  // is stripped back off here so editing doesn't require the user to touch
  // the prefix text directly.
  const [name, setName] = useState(() =>
    event && event.event_type === "Event" ? stripTitlePrefix(event.name) : event?.name ?? initialName ?? ""
  );
  // Once the user types into Name directly, stop overwriting it when
  // Gathering Type or Preacher Name change — an existing event's name
  // counts as already "touched" (never overridden just by opening the
  // form). Mirrors the same pattern used for Season/Level color suggestion.
  const [nameTouched, setNameTouched] = useState(!!event || !!initialName);
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
    (occurrence?.startTime ?? event?.event_time)?.slice(0, 5) ?? initialTime ?? ""
  );
  const [endTime, setEndTime] = useState((occurrence?.endTime ?? event?.end_time)?.slice(0, 5) ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    event?.duration_minutes != null ? String(event.duration_minutes) : ""
  );
  // Blank (not levels[0]) for a brand-new event — an unset category is more
  // honest than silently pre-selecting whichever category happens to sort
  // first, which a leader could easily save without ever noticing (see
  // Pastor review finding #1).
  const [level, setLevel] = useState<Level>(event?.level ?? initialLevel ?? "");
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
  // "More details" stays closed for a quick add, but opens by itself whenever
  // one of the fields inside it already has a value (editing an existing
  // event, or a recurring/multi-day one) so nothing is ever hidden.
  const [moreOpen, setMoreOpen] = useState(
    () =>
      !!(
        (event &&
          (event.end_date ||
            event.end_time ||
            event.duration_minutes != null ||
            event.location ||
            event.notes ||
            event.recurring !== "None")) ||
        (occurrence && (occurrence.spanEndDate !== occurrence.occurrenceDate || occurrence.endTime))
      )
  );
  // Optional checklist copied onto a brand-new one-off event right after it is
  // created. A suggested template is pre-selected (visibly) for Big Day and
  // Easter/XMAS gatherings until the user picks something themselves.
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplateWithItems[]>([]);
  const [checklistChoice, setChecklistChoice] = useState<string | null>(isDuplicate ? "" : null); // null = untouched; "" = explicitly none
  // Set once the event row exists, so a retry after a failed checklist step
  // doesn't create the event twice.
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  // Lock token for updateEvent; advanced after each successful save so a
  // user's own consecutive saves never conflict with themselves.
  const [lockToken, setLockToken] = useState(event?.updated_at);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Clicking an occurrence opens straight into a read-only "confirmed
  // values" view — editing is a deliberate extra step (the Edit button),
  // not the default. Adding a brand new event has nothing to view yet, so
  // it goes straight to the form.
  const [step, setStep] = useState<Step>(mode === "edit" ? "view" : "form");
  const [pendingValues, setPendingValues] = useState<EventFormValues | null>(null);

  useEscapeKey(onClose);

  useEffect(() => {
    if (mode !== "add" || !isEditor) return;
    (async () => {
      try {
        setChecklistTemplates(unwrap(await getChecklistTemplateOptions()));
      } catch {
        /* no picker if templates can't be loaded; the event can still be saved */
      }
    })();
  }, [mode, isEditor]);
  const suggestedTemplateName =
    eventType === "Gathering" ? SUGGESTED_TEMPLATE_BY_GATHERING_TYPE[gatheringType] : undefined;
  const suggestedTemplate = suggestedTemplateName
    ? checklistTemplates.find((t) => t.name === suggestedTemplateName)
    : undefined;
  const checklistTemplateId = checklistChoice ?? suggestedTemplate?.id ?? "";

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

  // The Event-type picker is built from the Categories table, so adding,
  // renaming or deleting a category shows up here with its exact name. The
  // only grouping kept is "Zone", which folds the youth-stage categories in
  // ZONE_LEVEL_NAMES (those that still exist) into one dropdown. Gatherings
  // keep their own flat Level dropdown. Everything is derived from `level`
  // (one source of truth), not tracked as separate state.
  function displayCategoryFor(levelName: string): string {
    return displayCategory(levelName, zonePickedWithoutLevel);
  }

  function handleEventTypeCategoryChange(category: string) {
    if (category !== "Zone") {
      setZonePickedWithoutLevel(false);
      setLevel(category);
    } else if (!ZONE_LEVEL_NAMES.includes(level)) {
      // Zone: do NOT auto-select whichever zone Level happens to sort
      // first — leave the choice unset and force the user to explicitly
      // open the sub-dropdown and pick one. If a zone Level is already
      // selected (e.g. editing an existing event), leave it as-is.
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
    if (!levels.some((l) => l.name === level)) {
      // Caught here because the server's own message is hidden in production.
      setFormError(`There's no “${level}” category. Add it with + Category (exact name), then try again.`);
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
        let newId = createdEventId;
        if (!newId) {
          const affected = unwrap(await createEvent(values));
          record(`Add "${values.name}"`, affected);
          newId = affected.find((a) => a.table === "events")?.id ?? null;
          setCreatedEventId(newId);
        }
        if (newId && recurring === "None" && checklistTemplateId) {
          try {
            unwrap(await applyChecklistTemplate(newId, checklistTemplateId));
          } catch (err) {
            setFormError(
              `The event was saved, but its checklist couldn't be added: ${
                err instanceof Error ? err.message : "please try again."
              } Press Save to retry, or add it later from the event's details.`
            );
            setSaving(false);
            return;
          }
        }
      } else if (event) {
        const affected = unwrap(await updateEvent(event.id, values, lockToken));
        record(`Edit "${values.name}"`, affected);
        const next = affected.find((a) => a.table === "events")?.after?.updated_at;
        if (typeof next === "string") setLockToken(next);
      }
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong saving this event.";
      setConflict(isEventConflict(message));
      setFormError(message);
      setSaving(false);
    }
  }

  async function handleReload() {
    if (!event || !onReload) return;
    setReloading(true);
    try {
      await onReload(event.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't reload this event. Please try again.");
      setReloading(false);
    }
  }

  async function handleEditScope(scope: "only" | "future") {
    if (!pendingValues || !event || !occurrence) return;
    setSaving(true);
    setFormError(null);
    try {
      if (scope === "only") {
        const affected = unwrap(await detachOccurrence(event, occurrence.originalDate, pendingValues));
        record(`Edit "${pendingValues.name}" (only this event)`, affected);
      } else {
        const affected = unwrap(await splitSeriesFromOccurrence(event, occurrence.originalDate, pendingValues));
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
      const affected = unwrap(await deleteOccurrence(event, occurrence.originalDate));
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
      const affected = unwrap(await deleteEvent(event.id));
      record(`Delete "${event.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong deleting this event.");
      setSaving(false);
    }
  }

  // The event as it appears on the clicked date (post-override time/span), minus its id.
  function duplicateSource(): EventRow | null {
    if (!event) return null;
    const date = occurrence?.occurrenceDate ?? event.event_date;
    const spanEnd = occurrence?.spanEndDate ?? event.end_date;
    return {
      ...event,
      id: "",
      event_date: date,
      end_date: spanEnd && spanEnd !== date ? spanEnd : null,
      event_time: occurrence?.startTime ?? event.event_time,
      end_time: occurrence?.endTime ?? event.end_time,
    };
  }

  const title = mode === "add" ? (isDuplicate ? "Duplicate Event" : "Add Event") : step === "view" ? "Event Details" : "Edit Event";
  const subtitle =
    isRecurringSeries && step === "form" && !confirmDelete
      ? canChooseScope
        ? "Part of a recurring series — you'll choose whether changes apply to just this event or this and future ones."
        : "Editing the recurring pattern — changes apply to the whole series."
      : undefined;

  const deleteButton = (
    <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger/10" onClick={handleDeleteClick}>
      Delete
    </Button>
  );

  let footer: React.ReactNode = undefined;
  if (!confirmDelete && step === "view") {
    footer = (
      <>
        <div>{isEditor && deleteButton}</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {isEditor && onDuplicate && (
            <Button
              variant="ghost"
              onClick={() => {
                const source = duplicateSource();
                if (source) onDuplicate(source);
              }}
            >
              Duplicate
            </Button>
          )}
          <Button onClick={() => setStep("form")}>Edit</Button>
        </div>
      </>
    );
  } else if (!confirmDelete && step === "form") {
    footer = (
      <>
        <div>{mode === "edit" && isEditor && deleteButton}</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => (mode === "edit" ? setStep("view") : onClose())}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </>
    );
  }

  const zoneLevels = zoneLevelsOf(levels);
  const eventTypeButtons = eventTypeButtonNames(levels);

  return (
    <ModalShell title={title} subtitle={subtitle} onClose={onClose} footer={footer}>
      {confirmDelete ? (
        <ConfirmDialog
          message={
            isRecurringSeries ? (
              <>
                <strong className="text-danger">This will delete all occurrences of this recurring event</strong>{" "}
                — the entire &ldquo;{event?.name}&rdquo; series ({event?.recurring}), not just one date.
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
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{eventType}</Pill>
            {level && (
              <Pill icon={<CategoryDot levelName={level} />}>{level}</Pill>
            )}
          </div>
          <div className="text-title text-ink">{name}</div>
          <div className="flex flex-col gap-1.5 text-ui text-ink">
            <div>
              {formatDateDisplay(eventDate)}
              {endDate && endDate !== eventDate && <> – {formatDateDisplay(endDate)}</>}
            </div>
            {(eventTime || endTime) && (
              <div className="flex items-center gap-1.5 text-ink-2">
                <ClockIcon className="!h-4 !w-4" />
                {formatEventTimeRange(eventTime ? `${eventTime}:00` : null, endTime ? `${endTime}:00` : null)}
              </div>
            )}
            {recurring !== "None" && (
              <div className="flex items-center gap-1.5 text-ink-2">
                <RepeatIcon className="!h-4 !w-4" />
                Repeats {recurring}
                {repeatUntil ? ` until ${formatDateDisplay(repeatUntil)}` : ""}
              </div>
            )}
            {location && (
              <div className="flex items-center gap-1.5 text-ink-2">
                <MapPinIcon className="!h-4 !w-4" />
                {location}
              </div>
            )}
          </div>
          {eventType === "Event" &&
            (pastoralFocus.youth || pastoralFocus.poly || pastoralFocus.uni || pastoralFocus.adults) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={LABEL}>Pastoral focus</span>
                {[
                  pastoralFocus.youth && "Youth",
                  pastoralFocus.poly && "Poly",
                  pastoralFocus.uni && "Uni",
                  pastoralFocus.adults && "Adults",
                ]
                  .filter(Boolean)
                  .map((f) => (
                    <Pill key={String(f)} variant="navy">
                      {f}
                    </Pill>
                  ))}
              </div>
            )}
          {eventType === "Gathering" && (series || preacherName || sermonTitle || theme) && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ui">
              {series && (
                <>
                  <dt className="text-ink-2">Series</dt>
                  <dd>{series}</dd>
                </>
              )}
              {preacherName && (
                <>
                  <dt className="text-ink-2">Preacher</dt>
                  <dd>{preacherName}</dd>
                </>
              )}
              {sermonTitle && (
                <>
                  <dt className="text-ink-2">Sermon</dt>
                  <dd>{sermonTitle}</dd>
                </>
              )}
              {theme && (
                <>
                  <dt className="text-ink-2">Theme</dt>
                  <dd>{theme}</dd>
                </>
              )}
            </dl>
          )}
          {notes && (
            <div className="flex items-start gap-1.5 whitespace-pre-wrap rounded-ctl bg-canvas p-3 text-ui text-ink">
              <StickyNoteIcon className="!h-4 !w-4 mt-0.5 text-ink-2" />
              <span>{notes}</span>
            </div>
          )}
          {mode === "edit" && event && <EventChecklist event={event} />}
          {formError && <p className="text-body text-danger">{formError}</p>}
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
        <form id="event-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && (
            <div role="alert" className="flex flex-col gap-2 rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
              <p>{formError}</p>
              {conflict && onReload && (
                <div className="flex flex-col items-start gap-1">
                  <p>Your edits are still below if you want to copy them first.</p>
                  <Button type="button" size="sm" variant="ghost" loading={reloading} onClick={handleReload}>
                    Reload
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2" role="group" aria-label="Type">
            {(["Event", "Gathering"] as EventType[]).map((t) => (
              <Seg
                key={t}
                active={eventType === t}
                onClick={() => {
                  setEventType(t);
                  if (t === "Gathering" && !nameTouched) {
                    setName(autoGatheringName(gatheringType, preacherName));
                  }
                }}
              >
                {t}
              </Seg>
            ))}
          </div>

          {eventType === "Gathering" && (
            <>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Gathering type</span>
                <select
                  value={gatheringType}
                  onChange={(e) => handleGatheringTypeChange(e.target.value as GatheringType)}
                  className={INPUT}
                >
                  {GATHERING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  placeholder="Series"
                  aria-label="Series"
                  className={INPUT}
                />
                <input
                  value={preacherName}
                  onChange={(e) => handlePreacherNameChange(e.target.value)}
                  placeholder="Preacher name"
                  aria-label="Preacher name"
                  className={INPUT}
                />
                <input
                  value={sermonTitle}
                  onChange={(e) => setSermonTitle(e.target.value)}
                  placeholder="Sermon title"
                  aria-label="Sermon title"
                  className={INPUT}
                />
                <input
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Theme"
                  aria-label="Theme"
                  className={INPUT}
                />
              </div>
            </>
          )}

          <label className="flex flex-col gap-1">
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Event name"
              aria-label="Name"
              className="w-full border-0 border-b border-line-strong bg-transparent px-0 py-1.5 text-title text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none"
              required
              autoFocus={mode === "add"}
            />
            {eventType === "Gathering" && (
              <span className="text-micro text-ink-2">
                Filled in from the gathering type and preacher — change it only if needed.
              </span>
            )}
          </label>

          {eventType === "Event" && (
            <div
              className="flex flex-wrap items-center gap-2"
              title="Adds a prefix to the name, e.g. Youth + Poly saves as “YP: …”"
            >
              <span className={LABEL}>Pastoral focus</span>
              {(
                [
                  ["youth", "Youth"],
                  ["poly", "Poly"],
                  ["uni", "Uni"],
                  ["adults", "Adults"],
                ] as Array<[keyof PastoralFocus, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={pastoralFocus[key]}
                  onClick={() => setPastoralFocus((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className={[
                    "min-h-[30px] rounded-pill px-3 text-body font-medium transition-colors duration-fast",
                    pastoralFocus[key] ? "bg-navy text-white" : "bg-fill text-ink hover:bg-line",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {eventType === "Event" ? (
            <div className="flex flex-col gap-2">
              <span className={LABEL}>Event type</span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Event type">
                {eventTypeButtons.map((cat) => (
                  <Seg
                    key={cat}
                    active={displayCategoryFor(level) === cat}
                    onClick={() => handleEventTypeCategoryChange(cat)}
                  >
                    {(cat !== "Zone" || ZONE_LEVEL_NAMES.includes(level)) && (
                      <CategoryDot levelName={cat === "Zone" ? level : cat} />
                    )}
                    {cat}
                  </Seg>
                ))}
              </div>
              {displayCategoryFor(level) === "Zone" && (
                <select
                  value={level}
                  onChange={(e) => {
                    setLevel(e.target.value as Level);
                    setZonePickedWithoutLevel(false);
                  }}
                  aria-label="Zone"
                  className={INPUT}
                >
                  {!level && (
                    <option value="" disabled>
                      — Select zone —
                    </option>
                  )}
                  {zoneLevels.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className={INPUT}>
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
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Date</span>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className={INPUT}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Time</span>
              <input
                type="time"
                value={eventTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className={INPUT}
              />
            </label>
          </div>

          {mode === "add" && isEditor && recurring === "None" && checklistTemplates.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className={`${LABEL} flex items-center gap-1`}>
                <CheckSquareIcon className="!h-3.5 !w-3.5" /> Checklist (optional)
              </span>
              <select
                value={checklistTemplateId}
                onChange={(e) => setChecklistChoice(e.target.value)}
                className={INPUT}
              >
                <option value="">No checklist</option>
                {checklistTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {suggestedTemplate && checklistTemplateId === suggestedTemplate.id && checklistChoice === null && (
                <span className="text-micro text-ink-2">
                  Suggested for this type of event. Choose &ldquo;No checklist&rdquo; if you don&rsquo;t need one.
                </span>
              )}
            </label>
          )}

          <div className="rounded-card border border-line">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-ui font-medium text-ink"
            >
              <span>More details</span>
              <span className="flex items-center gap-2 text-ink-3">
                {!moreOpen && (
                  <span className="flex items-center gap-1.5">
                    <RepeatIcon className="!h-4 !w-4" />
                    <MapPinIcon className="!h-4 !w-4" />
                    <StickyNoteIcon className="!h-4 !w-4" />
                  </span>
                )}
                <ChevronIcon open={moreOpen} />
              </span>
            </button>
            {moreOpen && (
              <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>End date (multi-day)</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={eventDate || undefined}
                      className={INPUT}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>
                      End time{wrapsPastMidnight ? " (next day)" : ""}
                    </span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => handleEndTimeChange(e.target.value)}
                      className={INPUT}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>Duration (min)</span>
                    <input
                      type="number"
                      min={0}
                      value={durationMinutes}
                      onChange={(e) => handleDurationChange(e.target.value)}
                      className={INPUT}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className={`${LABEL} flex items-center gap-1`}>
                    <MapPinIcon className="!h-3.5 !w-3.5" /> Location
                  </span>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Main Hall"
                    className={INPUT}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className={`${LABEL} flex items-center gap-1`}>
                      <RepeatIcon className="!h-3.5 !w-3.5" /> Repeats
                    </span>
                    <select
                      value={recurring}
                      onChange={(e) => setRecurring(e.target.value as Recurring)}
                      className={INPUT}
                    >
                      {RECURRING_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r === "None" ? "Does not repeat" : r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>Repeat until</span>
                    <input
                      type="date"
                      value={repeatUntil ?? ""}
                      onChange={(e) => {
                        setRepeatUntil(e.target.value);
                        if (e.target.value) setAcknowledgeNoEndDate(false);
                      }}
                      disabled={recurring === "None"}
                      className={INPUT}
                    />
                  </label>
                </div>
                {canChooseScope && (
                  <p className="-mt-2 text-micro text-ink-2">
                    The repeat pattern only changes if you choose &ldquo;this and all future events&rdquo; when saving.
                  </p>
                )}
                {recurring !== "None" && !repeatUntil && (
                  <div className="-mt-2 flex flex-col gap-1.5 rounded-ctl bg-warn/10 p-3">
                    <span className="text-body text-warn">
                      No end date — this event will repeat forever until removed.
                    </span>
                    <label className="flex items-center gap-2 text-body text-ink">
                      <input
                        type="checkbox"
                        checked={acknowledgeNoEndDate}
                        onChange={(e) => setAcknowledgeNoEndDate(e.target.checked)}
                      />
                      Yes, repeat with no end date
                    </label>
                  </div>
                )}

                <label className="flex flex-col gap-1">
                  <span className={`${LABEL} flex items-center gap-1`}>
                    <StickyNoteIcon className="!h-3.5 !w-3.5" /> Notes
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={TEXTAREA}
                    rows={2}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-0.5 rounded-ctl bg-canvas p-3">
            <span className="text-micro font-medium text-ink-3">Preview</span>
            {previewLines().map((line, i) => (
              <span key={i} className={i === 0 ? "text-ui font-semibold text-ink" : "text-body text-ink-2"}>
                {line}
              </span>
            ))}
          </div>

        </form>
      )}
    </ModalShell>
  );
}
