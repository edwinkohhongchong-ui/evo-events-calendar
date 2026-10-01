import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Tailwind padding class; default p-5. Pass "p-0" for flush content (tables). */
  padding?: string;
}

/** White surface on the canvas page; separation by contrast, no border/shadow. */
export default function Card({ padding = "p-5", className = "", children, ...rest }: CardProps) {
  return (
    <div className={`bg-surface rounded-card ${padding} ${className}`} {...rest}>
      {children}
    </div>
  );
}
