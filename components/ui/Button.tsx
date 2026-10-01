import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon node (e.g. <PlusIcon />). */
  icon?: ReactNode;
  loading?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white hover:bg-navy-700 [&:focus-visible]:outline-navy",
  secondary:
    "bg-white text-navy border border-navy hover:bg-navy-50",
  ghost: "bg-transparent text-navy hover:bg-fill",
  danger: "bg-danger text-white hover:brightness-90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-[32px] px-3.5 text-body",
  md: "min-h-[40px] px-5 text-ui",
};

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-pill font-medium whitespace-nowrap transition-colors duration-fast ease-apple disabled:opacity-40 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
