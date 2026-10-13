"use client";

import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

export type RemindersTabId = "digest" | "reminders";

interface Tab {
  id: RemindersTabId;
  label: string;
  title: string;
  description: string;
  content: ReactNode;
}

interface Props {
  tabs: Tab[];
}

// Segmented switcher for the /reminders page. The active tab lives in the URL
// (?tab=digest|reminders) so reload and Back keep it. Every panel stays
// mounted (just hidden) so an unsaved draft is not lost when switching.
export default function RemindersTabs({ tabs }: Props) {
  const params = useSearchParams();
  const requested = params.get("tab");
  const active = tabs.find((t) => t.id === requested)?.id ?? tabs[0].id;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = useCallback((id: RemindersTabId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    select(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }

  return (
    <div>
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Reminders sections" className="mb-5 grid grid-flow-col auto-cols-fr gap-1 rounded-ctl bg-fill p-1 sm:inline-grid">
          {tabs.map((t, i) => {
            const selected = t.id === active;
            return (
              <button
                key={t.id}
                ref={(el) => { refs.current[t.id] = el; }}
                type="button"
                role="tab"
                id={`reminders-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`reminders-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`min-h-[36px] coarse:min-h-[44px] rounded-chip px-4 text-ui font-medium transition-colors duration-fast ${
                  selected ? "bg-white text-navy shadow-sm" : "text-ink-2 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
      {tabs.map((t) => (
        <section
          key={t.id}
          role="tabpanel"
          id={`reminders-panel-${t.id}`}
          aria-labelledby={`reminders-tab-${t.id}`}
          hidden={t.id !== active}
          className="min-w-0"
        >
          <h2 className="text-title text-ink">{t.title}</h2>
          <p className="mt-1 mb-4 break-words text-body text-ink-2">{t.description}</p>
          {t.content}
        </section>
      ))}
    </div>
  );
}
