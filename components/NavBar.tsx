"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/holidays", label: "Holidays" },
  { href: "/seasons", label: "Seasons" },
  { href: "/checklist", label: "Checklist" },
];

export default function NavBar() {
  const pathname = usePathname();

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
      </div>
    </nav>
  );
}
