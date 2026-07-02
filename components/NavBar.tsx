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

  return (
    <nav className="bg-navy text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 h-11">
        <span className="font-semibold text-sm mr-4">+EVO Events</span>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                "px-3 py-1.5 text-sm rounded",
                active ? "bg-white/15 font-medium" : "hover:bg-white/10",
              ].join(" ")}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
