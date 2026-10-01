import type { ReactNode } from "react";

export type PillVariant = "neutral" | "ok" | "warn" | "danger" | "navy";

const VARIANT: Record<PillVariant, string> = {
  neutral: "bg-fill text-ink-2",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  navy: "bg-navy-50 text-navy",
};

export default function Pill({
  variant = "neutral",
  icon,
  className = "",
  children,
}: {
  variant?: PillVariant;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-micro font-medium leading-4 whitespace-nowrap [&>svg]:h-3.5 [&>svg]:w-3.5 ${VARIANT[variant]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
