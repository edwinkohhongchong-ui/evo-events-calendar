"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { DndContext } from "@dnd-kit/core";
import CalendarGrid from "./CalendarGrid";
import PrintFit, { PRINT_FIT_EVENT } from "./PrintFit";
import Button from "./ui/Button";
import { PrinterIcon } from "./icons";
import {
  DEFAULT_ORIENT,
  DEFAULT_PAPER,
  ORIENTS,
  Orient,
  PAPER_IDS,
  PAPERS,
  PaperId,
  pageRule,
  parseOrient,
  parsePaper,
  printableArea,
  readStoredPaper,
  writeStoredPaper,
} from "@/lib/paper";
import { buildDayIndex } from "@/lib/dayIndex";
import { computeEventBarSegments } from "@/lib/eventBars";
import { dotStyle } from "@/lib/colorStyle";
import { resolveLevelColor } from "@/lib/levelColor";
import { LevelColorProvider } from "@/lib/levelColorContext";
import { EventChecklistProvider } from "@/lib/eventChecklistContext";
import { SeasonSegment } from "@/lib/seasonBars";
import {
  DayNoteRow,
  EventChecklistProgress,
  EventOccurrence,
  HolidayRow,
  LevelRow,
} from "@/lib/types";

export interface PrintMonthData {
  key: string;
  monthStart: Date;
  weeks: Date[][];
  occurrences: EventOccurrence[];
  holidays: HolidayRow[];
  dayNotes: DayNoteRow[];
  seasonSegmentsByWeek: SeasonSegment[][];
}

const noop = () => {};

// Static legend (the live LevelChips is a filter/edit control).
function PrintLegend({ levels }: { levels: LevelRow[] }) {
  if (levels.length === 0) return null;
  return (
    <div className="print-legend mb-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-chip text-ink">
      {levels.map((level) => {
        const dot = dotStyle(resolveLevelColor(level));
        return (
          <span key={level.id} className="inline-flex items-center gap-1.5 font-medium">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot.className}`}
              style={dot.style}
            />
            {level.name}
          </span>
        );
      })}
    </div>
  );
}

function PrintMonthPage({
  month,
  levels,
  printedOn,
  paper,
  orient,
}: {
  month: PrintMonthData;
  levels: LevelRow[];
  printedOn: string;
  paper: PaperId;
  orient: Orient;
}) {
  const { weeks, monthStart, occurrences, holidays, dayNotes, seasonSegmentsByWeek } = month;
  const dayIndex = useMemo(
    () => buildDayIndex(weeks.flat(), occurrences, holidays, monthStart, dayNotes),
    [weeks, occurrences, holidays, monthStart, dayNotes]
  );
  const eventSegmentsByWeek = useMemo(
    () => computeEventBarSegments(occurrences, weeks, weeks[0][0], weeks[weeks.length - 1][6]),
    [occurrences, weeks]
  );

  return (
    <section
      data-print-page
      className="print-page"
      style={{ "--print-page-h": `${printableArea(paper, orient).height}px` } as CSSProperties}
    >
      <div className="print-header mb-1 flex items-center">
        <h1 className="text-display text-navy">{format(monthStart, "MMMM yyyy")}</h1>
      </div>
      <PrintLegend levels={levels} />
      <PrintFit paper={paper} orient={orient}>
        <CalendarGrid
          weeks={weeks}
          monthStart={monthStart}
          dayIndex={dayIndex}
          seasonSegmentsByWeek={seasonSegmentsByWeek}
          eventSegmentsByWeek={eventSegmentsByWeek}
          onDayClick={noop}
          onEventClick={noop}
          onHolidayClick={noop}
          onSeasonClick={noop}
        />
      </PrintFit>
      <p className="print-footer mt-2 text-right text-micro text-ink-2">Printed {printedOn}</p>
    </section>
  );
}

interface PrintCalendarProps {
  months: PrintMonthData[];
  levels: LevelRow[];
  checklistProgress: Record<string, EventChecklistProgress>;
  printedOn: string;
  backHref?: string;
  backLabel?: string;
  /** Validated from the URL; null = not in the URL, so the remembered choice (or A4 landscape) applies. */
  initialPaper?: PaperId | null;
  initialOrient?: Orient | null;
}

/**
 * Non-interactive stack of month pages for /export/print. The grid pieces call
 * dnd-kit hooks, so a sensor-less DndContext keeps them inert (nothing can be
 * dragged); click handlers are no-ops.
 */
export default function PrintCalendar({ months, levels, checklistProgress, printedOn, backHref = "/export/calendar", backLabel = "Back to Export", initialPaper = null, initialOrient = null }: PrintCalendarProps) {
  const colorMap = useMemo(
    () => Object.fromEntries(levels.map((l) => [l.name, resolveLevelColor(l)])),
    [levels]
  );

  const [paper, setPaper] = useState<PaperId>(initialPaper ?? DEFAULT_PAPER);
  const [orient, setOrient] = useState<Orient>(initialOrient ?? DEFAULT_ORIENT);
  // Nothing in the URL: fall back to the choice remembered on this device.
  useEffect(() => {
    if (initialPaper && initialOrient) return;
    const stored = readStoredPaper();
    if (!stored) return;
    if (!initialPaper) setPaper(stored.paper);
    if (!initialOrient) setOrient(stored.orient);
  }, [initialPaper, initialOrient]);

  function choose(nextPaper: PaperId, nextOrient: Orient) {
    setPaper(nextPaper);
    setOrient(nextOrient);
    writeStoredPaper(nextPaper, nextOrient);
    const url = new URL(window.location.href);
    url.searchParams.set("paper", nextPaper);
    url.searchParams.set("orient", nextOrient);
    window.history.replaceState(window.history.state, "", url);
  }

  // PrintFit flags a month it had to clip at the minimum scale.
  const [tooBusy, setTooBusy] = useState(false);
  useEffect(() => {
    const update = () => setTooBusy(document.querySelector('[data-print-overflow="true"]') !== null);
    window.addEventListener(PRINT_FIT_EVENT, update);
    return () => window.removeEventListener(PRINT_FIT_EVENT, update);
  }, [months]);

  return (
    <>
      <style>{pageRule(paper, orient)}</style>
      <div className="print-hide sticky top-[var(--nav-h,50px)] z-30 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2">
        <Link href={backHref} className="text-body font-medium text-navy hover:underline">
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-2">
          <span className="hidden sm:inline">
            {months.length} {months.length === 1 ? "page" : "pages"}, one month per page
          </span>
          <label className="inline-flex items-center gap-1.5">
            Paper
            <select
              value={paper}
              onChange={(e) => choose(parsePaper(e.target.value) ?? DEFAULT_PAPER, orient)}
              className="rounded-ctl border border-line bg-surface px-2 py-1 text-ink"
            >
              {PAPER_IDS.map((id) => (
                <option key={id} value={id}>
                  {PAPERS[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5">
            Orientation
            <select
              value={orient}
              onChange={(e) => choose(paper, parseOrient(e.target.value) ?? DEFAULT_ORIENT)}
              className="rounded-ctl border border-line bg-surface px-2 py-1 text-ink"
            >
              {ORIENTS.map((o) => (
                <option key={o} value={o}>
                  {o === "landscape" ? "Landscape" : "Portrait"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button size="sm" icon={<PrinterIcon className="!h-4 !w-4" />} onClick={() => window.print()}>
          Print
        </Button>
      </div>
      {tooBusy && (
        <p role="alert" className="print-hide mx-4 mt-3 rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
          This month is very busy and may be cut off; try printing fewer weeks.
        </p>
      )}
      <main className="print-pages">
        <LevelColorProvider colorMap={colorMap}>
          <EventChecklistProvider progress={checklistProgress}>
            <DndContext id="print-dnd" sensors={[]}>
              {months.map((m) => (
                <PrintMonthPage key={m.key} month={m} levels={levels} printedOn={printedOn} paper={paper} orient={orient} />
              ))}
            </DndContext>
          </EventChecklistProvider>
        </LevelColorProvider>
      </main>
    </>
  );
}
