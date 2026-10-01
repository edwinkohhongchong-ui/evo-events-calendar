import type { ReactNode } from "react";

// Small Feather/Lucide-style stroke icons (20px, 1.75 stroke, round caps).
// Decorative only — always aria-hidden; they inherit text color.
function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

export const CalendarIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
);
export const ToolsIcon = (p: P) => (
  <Icon {...p}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </Icon>
);
export const SunIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Icon>
);
export const LayersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 2 2 7l10 5 10-5-10-5z" />
    <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
  </Icon>
);
export const TagIcon = (p: P) => (
  <Icon {...p}>
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <circle cx="7" cy="7" r="1" />
  </Icon>
);
export const CheckSquareIcon = (p: P) => (
  <Icon {...p}>
    <path d="m9 11 3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </Icon>
);
export const ShieldIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Icon>
);
export const BellIcon = (p: P) => (
  <Icon {...p}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Icon>
);
export const DatabaseIcon = (p: P) => (
  <Icon {...p}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </Icon>
);
export const UploadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5M12 3v12" />
  </Icon>
);
export const CalendarPlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
    <path d="M16 2v4M8 2v4M3 10h18M19 16v6M16 19h6" />
  </Icon>
);
export const FileTextIcon = (p: P) => (
  <Icon {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </Icon>
);
export const PlayCircleIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m10 8 6 4-6 4V8z" />
  </Icon>
);
export const ChevronIcon = ({ open }: { open: boolean }) => (
  <Icon className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

// ---- Calendar-phase icons (additive) ----
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const ChevronLeftIcon = (p: P) => (
  <Icon {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
export const ChevronRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
export const PencilIcon = (p: P) => (
  <Icon {...p}>
    <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </Icon>
);
export const TrashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  </Icon>
);
export const XIcon = (p: P) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
export const UndoIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);
export const RedoIcon = (p: P) => (
  <Icon {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </Icon>
);
export const TagPlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12.59 2.59A2 2 0 0 0 11.17 2H2v9.17a2 2 0 0 0 .59 1.41l8.82 8.82a2 2 0 0 0 2.83 0l7.18-7.18a2 2 0 0 0 0-2.83z" />
    <circle cx="7" cy="7" r="1" />
    <path d="M18 2v6M15 5h6" />
  </Icon>
);
export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);
export const RepeatIcon = (p: P) => (
  <Icon {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Icon>
);
export const ClockIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Icon>
);
export const MapPinIcon = (p: P) => (
  <Icon {...p}>
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);
export const StickyNoteIcon = (p: P) => (
  <Icon {...p}>
    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z" />
    <path d="M15 3v6h6" />
  </Icon>
);
export const FlagIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <path d="M4 22v-7" />
  </Icon>
);
export const ListChecksIcon = (p: P) => (
  <Icon {...p}>
    <path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8" />
  </Icon>
);
export const DownloadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5M12 15V3" />
  </Icon>
);
export const HelpCircleIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </Icon>
);
export const GripVerticalIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="5" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="9" cy="19" r="1" />
    <circle cx="15" cy="5" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="15" cy="19" r="1" />
  </Icon>
);
export const LockIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);
export const CircleIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
  </Icon>
);
export const CircleDotIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="1" />
  </Icon>
);
export const CheckCircleIcon = (p: P) => (
  <Icon {...p}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </Icon>
);
export const SlidersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </Icon>
);
export const NotebookPenIcon = (p: P) => (
  <Icon {...p}>
    <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4" />
    <path d="M21.4 5.6a2 2 0 0 0-2.8-2.8L12 9.4V12h2.6z" />
  </Icon>
);
export const MoveIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
  </Icon>
);
export const MessageIcon = (p: P) => (
  <Icon {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);
export const RotateCcwIcon = (p: P) => (
  <Icon {...p}>
    <path d="M1 4v6h6" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </Icon>
);
