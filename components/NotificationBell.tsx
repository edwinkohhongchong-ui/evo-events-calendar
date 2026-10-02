"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BellIcon, PlusIcon, PencilIcon, TrashIcon, MoveIcon, MessageIcon, RotateCcwIcon } from "./icons";

// Mirrors the GET /api/activity contract (lib/ owns the server side).
type ActivityItem = {
  id: string;
  created_at: string;
  actor_role: "editor" | "viewer";
  action: "added" | "edited" | "deleted" | "moved" | "commented" | "undid" | "redid";
  entity: string;
  label: string;
  summary: string;
  href: string | null;
};

const STORAGE_KEY = "evo_activity_last_seen";
const POLL_MS = 45_000;
const MARK_SEEN_DELAY_MS = 1000;

const ACTION_ICON: Record<ActivityItem["action"], ReactNode> = {
  added: <PlusIcon className="!h-4 !w-4" />,
  edited: <PencilIcon className="!h-4 !w-4" />,
  deleted: <TrashIcon className="!h-4 !w-4" />,
  moved: <MoveIcon className="!h-4 !w-4" />,
  commented: <MessageIcon className="!h-4 !w-4" />,
  undid: <RotateCcwIcon className="!h-4 !w-4" />,
  redid: <RotateCcwIcon className="!h-4 !w-4 -scale-x-100" />,
};

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeLastSeen(iso: string) {
  try {
    localStorage.setItem(STORAGE_KEY, iso);
  } catch {
    /* storage blocked — badge just won't persist across loads */
  }
}

function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

const isNewer = (iso: string, cutoff: string | null) =>
  cutoff !== null && Date.parse(iso) > Date.parse(cutoff);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NotificationBell({ open, onOpenChange }: Props) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  // Snapshot of lastSeen taken when the panel opens, so unread dots stay
  // visible while the badge (driven by the live lastSeen) clears.
  const [dotCutoff, setDotCutoff] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastSeenRef = useRef<string | null>(null);
  const itemsRef = useRef<ActivityItem[]>([]);
  const initialised = useRef(false);

  const commitSeen = useCallback((iso: string) => {
    lastSeenRef.current = iso;
    setLastSeen(iso);
    writeLastSeen(iso);
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity?limit=30", { cache: "no-store" });
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ActivityItem[]; serverTime?: string };
      setUnauthorized(false);
      const list = Array.isArray(data.items) ? data.items : [];
      itemsRef.current = list;
      setItems(list);
      setNow(Date.now());
      if (!initialised.current) {
        initialised.current = true;
        // First ever load: nothing counts as unread, so a new user isn't flooded.
        if (readLastSeen() === null) {
          const iso = data.serverTime ?? new Date().toISOString();
          commitSeen(iso);
        } else {
          lastSeenRef.current = readLastSeen();
          setLastSeen(lastSeenRef.current);
        }
      }
    } catch {
      /* silent: keep the last list */
    }
  }, [commitSeen]);

  // Poll while visible; refresh on focus / becoming visible.
  useEffect(() => {
    fetchActivity();
    const tick = () => {
      if (document.visibilityState === "visible") fetchActivity();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [fetchActivity]);

  const markAllSeen = useCallback(() => {
    const newest = itemsRef.current[0]?.created_at;
    if (newest && isNewer(newest, lastSeenRef.current)) commitSeen(newest);
  }, [commitSeen]);

  // Opening: freeze the dot cutoff, then clear the badge after ~1s.
  // Closing: clear immediately.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDotCutoff(lastSeenRef.current);
      setNow(Date.now());
      const t = window.setTimeout(markAllSeen, MARK_SEEN_DELAY_MS);
      wasOpen.current = true;
      return () => window.clearTimeout(t);
    }
    if (!open && wasOpen.current) {
      wasOpen.current = false;
      markAllSeen();
    }
  }, [open, markAllSeen]);

  const unread = items.filter((i) => isNewer(i.created_at, lastSeen)).length;
  const showBadge = !unauthorized && unread > 0;
  const badgeText = unread > 9 ? "9+" : String(unread);

  const close = () => onOpenChange(false);

  return (
    <div className="shrink-0 sm:relative" data-tour="notification-bell">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={showBadge ? `Notifications, ${unread} new` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        className="relative flex h-8 w-8 coarse:h-11 coarse:w-11 items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <BellIcon className="!h-[18px] !w-[18px]" />
        {showBadge && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-navy"
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Recent activity"
            className="absolute left-4 right-4 top-full z-50 mt-1 flex max-h-[70vh] flex-col overflow-hidden rounded-card bg-surface text-ink shadow-pop sm:left-auto sm:right-0 sm:w-[340px]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="text-ui font-semibold">Activity</h2>
              <button
                type="button"
                onClick={() => {
                  markAllSeen();
                  setDotCutoff(null);
                }}
                disabled={!showBadge && !items.some((i) => isNewer(i.created_at, dotCutoff))}
                className="rounded-chip px-1.5 py-0.5 text-micro text-ink-2 hover:text-navy hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Mark all read
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-ink-2">
                <BellIcon className="!h-6 !w-6 text-ink-3" />
                <p className="text-body">No activity yet.</p>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                {items.map((item) => {
                  const unreadDot = isNewer(item.created_at, dotCutoff);
                  const linkable = !!item.href && item.href.startsWith("/") && !item.href.startsWith("//");
                  const body = (
                    <>
                      <span
                        aria-hidden="true"
                        className={[
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                          item.action === "deleted" ? "bg-danger/10 text-danger" : "bg-navy-50 text-navy",
                        ].join(" ")}
                      >
                        {ACTION_ICON[item.action] ?? ACTION_ICON.edited}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-ink" title={item.summary}>
                          {item.summary}
                        </span>
                        <span className="block text-micro text-ink-2">{relativeTime(item.created_at, now)}</span>
                      </span>
                      <span
                        aria-label={unreadDot ? "Unread" : undefined}
                        className={[
                          "mt-2 h-2 w-2 shrink-0 rounded-full",
                          unreadDot ? "bg-gold" : "bg-transparent",
                        ].join(" ")}
                      />
                    </>
                  );
                  const rowCls = "flex w-full items-start gap-2.5 px-4 py-2 text-left";
                  return (
                    <li key={item.id}>
                      {linkable ? (
                        <Link
                          href={item.href as string}
                          onClick={close}
                          className={`${rowCls} hover:bg-fill focus-visible:bg-fill focus-visible:outline-none`}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={rowCls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
