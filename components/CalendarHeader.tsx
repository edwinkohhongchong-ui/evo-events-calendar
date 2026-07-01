import Link from "next/link";
import { format, addMonths, subMonths } from "date-fns";
import { LEVELS, LEVEL_COLORS } from "@/lib/constants";

interface CalendarHeaderProps {
  monthStart: Date;
}

export default function CalendarHeader({ monthStart }: CalendarHeaderProps) {
  const prev = subMonths(monthStart, 1);
  const next = addMonths(monthStart, 1);

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-navy">{format(monthStart, "MMMM yyyy")}</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`}
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 text-navy"
          >
            ← Prev
          </Link>
          <Link
            href="/"
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 text-navy"
          >
            Today
          </Link>
          <Link
            href={`/?year=${next.getFullYear()}&month=${next.getMonth() + 1}`}
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 text-navy"
          >
            Next →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((level) => (
          <span
            key={level}
            className={["text-[11px] px-1.5 py-0.5 rounded border", LEVEL_COLORS[level]].join(" ")}
          >
            {level}
          </span>
        ))}
      </div>
    </div>
  );
}
