"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/holidays", label: "Holidays" },
  { href: "/seasons", label: "Seasons" },
  { href: "/checklist", label: "Checklist" },
  { href: "/levels", label: "Categories" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [exportOpen, setExportOpen] = useState(false);

  if (pathname === "/login") return null;

  return (
    <nav className="bg-navy text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-12 gap-3">
        <span className="font-semibold text-sm whitespace-nowrap shrink-0">+EVO Events</span>
        {/* Scrolls horizontally instead of wrapping/overflowing the page at
            narrow widths — see PROJECT decision: NavBar is in-scope for the
            mobile pass, the calendar grid it sits above is not. */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "px-3 py-1.5 text-sm rounded whitespace-nowrap shrink-0",
                  active ? "bg-white/15 font-medium" : "hover:bg-white/10",
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="relative ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setExportOpen((prev) => !prev)}
            onBlur={() => setTimeout(() => setExportOpen(false), 150)}
            className="px-3 py-1.5 text-sm rounded whitespace-nowrap hover:bg-white/10"
          >
            Export ▾
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white text-gray-800 rounded-md shadow-lg border border-gray-200 overflow-hidden z-50">
              <a
                href="/api/export/ics"
                className="block px-3 py-2 text-sm hover:bg-gray-50"
              >
                <div className="font-medium text-navy">Add to Calendar (.ics)</div>
                <div className="text-xs text-gray-500">For Apple Calendar or Google Calendar</div>
              </a>
              <Link href="/export" className="block px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-100">
                <div className="font-medium text-navy">Export Document (PDF/Word)</div>
                <div className="text-xs text-gray-500">Pick a date range and categories</div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
