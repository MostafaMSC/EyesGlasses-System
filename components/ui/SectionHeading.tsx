import type { ReactNode } from "react";
import { EyebrowBadge } from "@/components/ui/Badge";

export function SectionHeading({
  eyebrow,
  eyebrowIcon,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <EyebrowBadge icon={eyebrowIcon}>{eyebrow}</EyebrowBadge>}
        <h2 className="mt-3 font-display text-2xl font-extrabold text-ink sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-lg text-sm leading-7 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
