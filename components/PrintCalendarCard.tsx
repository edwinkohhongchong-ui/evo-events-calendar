"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_YEAR, MIN_YEAR, todayStr } from "@/lib/dates";
import {
  MAX_PRINT_MONTHS,
  MONTH_ABBREVIATIONS,
  clampPrintYear,
  monthKey,
  monthKeysForYear,
  monthKeysFrom,
  printHref,
  summarizeMonthKeys,
} from "@/lib/printMonths";
import Button from "./ui/Button";
import Card from "./ui/Card";
import { INPUT, LABEL } from "./ui/fieldStyles";
import { PrinterIcon } from "./icons";

const QUICK_BTN = "min-h-[32px] coarse:min-h-[44px] rounded-pill bg-fill px-3.5 text-body font-medium text-ink transition-colors duration-fast hover:bg-line";

export default function PrintCalendarCard() {
  const router = useRouter();
  const [year, setYear] = useState(() => clampPrintYear(Number(todayStr().slice(0, 4))));
  // "yyyy-MM" keys; may span several years.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function replace(keys: string[]) {
    setSelected(new Set(keys));
    if (keys.length > 0) setYear(Number(keys[0].slice(0, 4)));
  }

  const tooMany = selected.size > MAX_PRINT_MONTHS;
  const summary = summarizeMonthKeys(selected);

  return (
    <Card padding="p-5" className="flex flex-col gap-4">
      <p className="text-body text-ink-2">Pick the months to print. Each month prints on its own landscape page.</p>

      <section className="flex flex-col gap-2">
        <label className="flex w-32 flex-col gap-1">
          <span className={LABEL}>Year</span>
          <input
            type="number"
            min={MIN_YEAR}
            max={MAX_YEAR}
            value={year}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && e.target.value !== "") setYear(clampPrintYear(n));
            }}
            className={INPUT}
          />
        </label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label={`Months of ${year}`}>
          {MONTH_ABBREVIATIONS.map((label, i) => {
            const key = monthKey(year, i + 1);
            const on = selected.has(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(key)}
                className={[
                  "min-h-[32px] coarse:min-h-[44px] rounded-pill px-3.5 text-body font-medium transition-colors duration-fast",
                  on ? "bg-navy text-white" : "bg-fill text-ink hover:bg-line",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <button type="button" className={QUICK_BTN} onClick={() => replace(monthKeysFrom(todayStr(), 1))}>
          This month
        </button>
        <button type="button" className={QUICK_BTN} onClick={() => replace(monthKeysFrom(todayStr(), 3))}>
          Next 3 months
        </button>
        <button type="button" className={QUICK_BTN} onClick={() => replace(monthKeysForYear(year))}>
          Whole year
        </button>
        <button type="button" className={QUICK_BTN} onClick={() => setSelected(new Set())}>
          Clear
        </button>
      </section>

      <p className="text-body text-ink-2" aria-live="polite">
        {selected.size === 0
          ? "No months selected."
          : `${selected.size} ${selected.size === 1 ? "month" : "months"} selected: ${summary}`}
      </p>

      {tooMany && (
        <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
          Choose at most {MAX_PRINT_MONTHS} months at a time.
        </p>
      )}

      <div className="flex flex-col items-end gap-1">
        <Button
          disabled={selected.size === 0 || tooMany}
          icon={<PrinterIcon className="!h-4 !w-4" />}
          onClick={() => router.push(printHref(selected))}
        >
          Open print preview
        </Button>
        <p className="text-micro text-ink-2">Opens a preview first; you print from there.</p>
      </div>
    </Card>
  );
}
