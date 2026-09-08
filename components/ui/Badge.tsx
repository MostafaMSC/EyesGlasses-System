import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "accent" | "ink" | "success" | "muted" | "danger" | "outline";

const toneClass: Record<BadgeTone, string> = {
  accent:
    "bg-gradient-to-l from-accent to-accent-2 text-accent-contrast shadow-[0_6px_18px_-8px_var(--accent)]",
  ink: "bg-ink text-bg",
  success: "bg-success/15 text-success ring-1 ring-success/30",
  muted: "bg-surface-3 text-ink-soft ring-1 ring-line",
  danger: "bg-danger/15 text-danger ring-1 ring-danger/30",
  outline: "bg-surface/70 text-ink-soft ring-1 ring-line backdrop-blur-sm",
};

export function Badge({
  children,
  tone = "ink",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide",
        toneClass[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Small pill used above section headings. */
export function EyebrowBadge({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-xs font-bold text-accent">
      {icon}
      {children}
    </span>
  );
}
